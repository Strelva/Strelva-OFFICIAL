import "server-only";
/**
 * Sidebar facts for places that render their own StrelvaShell outside the
 * workspace view (Reviews, Recaps, Results, Service requests, Check results).
 * Without these the real routes showed an empty rail where the preview showed
 * pinned Systems, the agency link and the agency's clients.
 *
 * Read-only and presentation only: every read goes through the same
 * membership-checked repositories as GET /api/workspace, nothing here creates
 * or refreshes a stored record (canWrite stays false), and any failure drops
 * the extra rail facts rather than the page.
 */
import { resolveOwnerBrand } from "@/platform/agency-brand/server";
import { systemsReleasedFor } from "@/platform/systems-release";
import { listWork, listWorkspaces } from "@/platform/workspaces/repository";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { listManagedPresenceWork } from "@/products/managed-presence/server";
import { readWorkspaceSystems } from "@/experience/systems/server";
import { systemHref } from "@/experience/systems/model";
import { systemKindView } from "@/experience/systems/from-workspace";
import { pinnedSystems, type StrelvaClientLink, type StrelvaPinnedItem } from "@/experience/app-frame/workspace-places";
import type { OwnerBrand } from "@/platform/infra/agency-brand";
import { identityColor } from "@/platform/presentation/identity-color";

export interface OwnerPlaceChrome {
  systemsReleased: boolean;
  workspaceName?: string;
  pinned?: StrelvaPinnedItem[];
  ownerBrand?: OwnerBrand;
}

/** The owner rail for one business: its name, its Systems (one marked current) and its agency. */
export async function readOwnerPlaceChrome(actor: WorkspaceActor, workspaceId: string, currentKind?: StrelvaPinnedItem["kind"]): Promise<OwnerPlaceChrome> {
  const systemsReleased = await systemsReleasedFor(actor, workspaceId).catch(() => false);
  try {
    const workspaces = await listWorkspaces(actor);
    const current = workspaces.find(item => item.id === workspaceId);
    if (!current) return { systemsReleased };
    const brand = await resolveOwnerBrand(workspaceId).catch(() => undefined);
    let pinned: StrelvaPinnedItem[] | undefined;
    if (systemsReleased && current.kind === "customer") {
      const [savedWork, presence] = await Promise.all([listWork(actor, workspaceId), listManagedPresenceWork().catch(() => ({ managedWork: [] }))]);
      const domains = new Map<string, string>();
      for (const site of (presence as { managedWork?: unknown[] }).managedWork ?? []) {
        const item = site as { id?: unknown; domain?: unknown };
        if (typeof item.id === "string" && typeof item.domain === "string" && /^[a-z0-9.-]+$/i.test(item.domain)) domains.set(item.id, item.domain.toLowerCase());
      }
      const systems = await readWorkspaceSystems({ actor, businessId: workspaceId, savedWork, canWrite: false, siteDomains: domains });
      if (systems.status === "ready") {
        const views = systems.systems.map(entry => ({ id: entry.ref.systemId, name: entry.name, kind: systemKindView(entry.kind), lifecycle: entry.lifecycle, health: { state: entry.health.status } }));
        const currentId = currentKind ? views.find(system => system.kind === currentKind)?.id ?? null : null;
        pinned = pinnedSystems(views, id => systemHref("", workspaceId, id), undefined, currentId);
      }
    }
    return { systemsReleased, workspaceName: current.name, pinned, ...(brand ? { ownerBrand: brand } : {}) };
  } catch {
    return { systemsReleased };
  }
}

/** The agency's clients for the agency rail, the same scope as the workspace view's client list. */
export async function readAgencyClients(actor: WorkspaceActor): Promise<StrelvaClientLink[]> {
  try {
    return (await listWorkspaces(actor))
      .filter(item => item.kind === "customer" && (item.access === "provider_seat" || item.access === "delegated_read"))
      .map(item => ({ id: item.id, name: item.name, href: `/workspace?workspaceId=${encodeURIComponent(item.id)}`, color: identityColor(item.id), detail: item.access === "delegated_read" ? "Read-only" : undefined }));
  } catch {
    return [];
  }
}
