import { getSupabase } from "@/platform/infra/db/client";
import { z } from "zod";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { readVersionActor } from "@/platform/system-versions/supabase-store";
import { recordedActor, type RecordedActor } from "./actor";
import { readBusinessProviderIdentity, readServiceRequestProviders } from "@/platform/service-requests/provider-options";
import { resolveOwnerBrand } from "@/platform/agency-brand/server";

/**
 * Capture who serves this automatic action, independently of its reader.
 * A successful empty relationship read proves the direct door. An unreadable
 * relationship or ambiguous scoped agencies never falls back to the platform.
 * Pass the exact acting agency when an action/session has already bound it.
 */
export async function captureAutomationActor(actor: WorkspaceActor, workspaceId: string, actingAgencyId?: string): Promise<RecordedActor | null> {
  try {
    const [provider, agencies] = await Promise.all([
      readBusinessProviderIdentity(actor, workspaceId),
      readServiceRequestProviders(actor, workspaceId),
    ]);
    const ids = new Set(agencies.map(agency => agency.agencyWorkspaceId));
    if (provider) ids.add(provider.agencyWorkspaceId);
    if (!ids.size) return actingAgencyId ? null : { kind: "platform" };
    const agencyId = actingAgencyId ?? (ids.size === 1 ? [...ids][0] : undefined);
    if (!agencyId || !ids.has(agencyId)) return null;
    const brand = await resolveOwnerBrand(agencyId);
    if (brand.agencyId !== agencyId) return null;
    return recordedActor({ kind: "agency", agencyId, displayName: brand.name });
  } catch { return null; }
}

/** The account's own recorded name (full_name, then name). Never the email. */
export async function accountDisplayName(userId: string): Promise<string | null> {
  try {
    const db = getSupabase();
    if (!db || !/^[0-9a-f-]{36}$/i.test(userId)) return null;
    const { data, error } = await db.auth.admin.getUserById(userId);
    if (error || data.user?.id !== userId) return null;
    const metadata = data.user.user_metadata;
    const name = [metadata?.full_name, metadata?.name].find(value => typeof value === "string" && value.trim());
    return typeof name === "string" ? name.trim().slice(0, 80) : null;
  } catch { return null; }
}

/** Resolve the recorded principal, never the person viewing its History. */
export async function personActor(userId: string): Promise<RecordedActor | null> {
  const displayName = await accountDisplayName(userId);
  return displayName ? recordedActor({ kind: "person", displayName }) : null;
}

/** Capture at the action, then retain the name in the receipt. Never use this
 * to infer a historical agency from today's membership or brand. */
export async function captureActionActor(actor: WorkspaceActor, workspaceId: string): Promise<RecordedActor | null> {
  try {
    const db = getSupabase();
    if (!db) return null;
    const scope = await readVersionActor(actor);
    if (scope.userId !== actor.userId) return null;
    const direct = scope.memberships.some(row => row.businessId === workspaceId && row.via !== "provider_seat");
    let agencyId: string | null = null;
    if (direct) {
      const { data: workspace, error } = await db.from("workspaces").select("id, kind").eq("id", workspaceId).maybeSingle();
      if (error) return null;
      if (workspace?.kind === "agency") agencyId = workspace.id;
    } else {
      if (!scope.memberships.some(row => row.businessId === workspaceId && row.via === "provider_seat")) return null;
      const memberships = scope.memberships.filter(row => row.via !== "provider_seat");
      const ids: string[] = [];
      for (const membership of memberships) {
        const { data: workspace, error } = await db.from("workspaces").select("kind").eq("id", membership.businessId).maybeSingle();
        if (error) return null;
        if (workspace?.kind !== "agency") continue;
        // Staff tables intentionally have no service-role SELECT grant. Use
        // the existing identity-checked read, not privileged table access.
        const { data, error: seatError } = await db.rpc("read_agency_provider_seats", {
          p_user_id: actor.userId, p_verified_email: actor.verifiedEmail,
          p_agency_workspace_id: membership.businessId,
        });
        const seats = z.array(z.object({ customerWorkspaceId: z.string(), staff: z.array(z.object({ userId: z.string() })) })).safeParse(data);
        if (seatError || !seats.success) return null;
        if (seats.data.some(row => row.customerWorkspaceId === workspaceId
          && row.staff.some(staff => staff.userId === actor.userId))) ids.push(membership.businessId);
      }
      // Multiple agencies are ambiguous; a brand cannot select the actor.
      if (ids.length > 1) return null;
      agencyId = ids[0] ?? null;
      if (!agencyId) return null;
    }
    if (agencyId) {
      const { data: workspace, error } = await db.from("workspaces").select("name, agency_brand")
        .eq("id", agencyId).eq("kind", "agency").maybeSingle();
      if (error || !workspace) return null;
      const brand = workspace.agency_brand as { displayName?: unknown } | null;
      // The agency member who acted, by their own recorded name: "Maya at North Studio".
      const personName = await accountDisplayName(actor.userId);
      return recordedActor({ kind: "agency", displayName: brand?.displayName ?? workspace.name, ...(personName ? { personName } : {}) });
    }
    return personActor(actor.userId);
  } catch { return null; }
}
