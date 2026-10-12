import { z } from "zod";
import { systemsReleasedFor } from "@/platform/systems-release";
import { getSupabase } from "@/platform/infra/db/client";
import { WorkspaceAccessError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { systemOriginSchema, type SystemOrigin } from "@/platform/systems/contracts";
import { createSupabaseSystemStore } from "@/platform/systems/supabase-store";
import { CONTENT_READING_REPOS } from "./site-editing";

export interface WebsiteReleaseTarget {
  systemId: string;
  origin: SystemOrigin;
  tenantId?: string | null;
}
export interface WebsiteReleasesDb {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}

/** Reconcile immutable native receipts into System revisions. The source stores
 * stay authoritative; failed observations are repaired by the next System read.
 * Never retry a provider write to repair this projection. */
export async function reconcileWebsiteSystemReleases(
  actor: WorkspaceActor, businessId: string, target: WebsiteReleaseTarget,
  dependencies: { db?: WebsiteReleasesDb; released?: typeof systemsReleasedFor } = {},
): Promise<number> {
  if (!(await (dependencies.released ?? systemsReleasedFor)(actor, businessId))) return 0;
  const db = dependencies.db ?? getSupabase() as unknown as WebsiteReleasesDb | null;
  if (!db) throw new WorkspaceStoreError("Website release history is unavailable.");
  const origin = systemOriginSchema.parse(target.origin);
  const { data, error } = await db.rpc("reconcile_website_system_releases", {
    p_workspace_id: z.string().uuid().parse(businessId),
    p_user_id: z.string().uuid().parse(actor.userId),
    p_verified_email: z.string().email().parse(actor.verifiedEmail.trim().toLowerCase()),
    p_system_id: z.string().uuid().parse(target.systemId),
    p_origin_kind: origin.kind, p_origin_ref: origin.ref,
    p_content_reading: target.tenantId ? CONTENT_READING_REPOS.has(target.tenantId) : false,
  });
  if (error) {
    if (/business_record_access_denied|system_not_found/.test(error.message ?? "")) throw new WorkspaceAccessError();
    throw new WorkspaceStoreError("Website release history could not be reconciled.");
  }
  const result = z.number().int().nonnegative().safeParse(data);
  if (!result.success) throw new WorkspaceStoreError("Website release history could not be confirmed.");
  return result.data;
}

/** Observe immediately after an accepted native write, best effort. Readers
 * report reconciliation failure and heal it; the accepted write never retries. */
export async function observeWebsiteWorkRelease(
  actor: WorkspaceActor, businessId: string, workId: string, db?: WebsiteReleasesDb,
): Promise<void> {
  try {
    if (!(await systemsReleasedFor(actor, businessId))) return;
    const { listBusinessSystems } = await import("@/platform/systems/from-existing");
    const listing = await listBusinessSystems(actor, businessId, { store: createSupabaseSystemStore() });
    const site = listing.systems.find(item => item.system.kind === "website" && item.references.savedWorkId === workId);
    if (site?.system.origin) await reconcileWebsiteSystemReleases(actor, businessId, {
      systemId: site.system.id, origin: site.system.origin, tenantId: site.references.tenantId,
    }, { db, released: async () => true });
  } catch {
    console.warn("[websites] Published release history needs reconciliation", { businessId, workId });
  }
}

export async function observeWebsiteSystemRelease(
  actor: WorkspaceActor, businessId: string, systemId: string, db?: WebsiteReleasesDb,
): Promise<void> {
  try {
    if (!(await systemsReleasedFor(actor, businessId))) return;
    const { listBusinessSystems } = await import("@/platform/systems/from-existing");
    const site = (await listBusinessSystems(actor, businessId, { store: createSupabaseSystemStore() })).systems.find(item => item.system.id === systemId && item.system.kind === "website");
    if (site?.system.origin) await reconcileWebsiteSystemReleases(actor, businessId, {
      systemId, origin: site.system.origin, tenantId: site.references.tenantId,
    }, { db, released: async () => true });
  } catch {
    console.warn("[websites] Accepted release history needs reconciliation", { businessId, systemId });
  }
}
