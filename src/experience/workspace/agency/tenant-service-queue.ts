import { createHash } from "node:crypto";
import { getSupabase } from "@/platform/infra/db/client";
import { getActiveTenants } from "@/lib/tenants";
import { QUEUE_KIND_LABELS, type QueueTenant } from "@/platform/operator-queue/contracts";
import type { SourceRead } from "@/platform/operator-queue/project";
import { oneQueueEnabled } from "@/platform/provider-client-queue/release";
import { readEventKinds, readMaintenanceDigests, readSiteDrafts, readUnkeptLeads } from "@/server/operator-queue/sources";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { AgencyClientsPage, AgencyQueueItem } from "../agency-clients";

/**
 * The client's site work (drafts, owner approvals, change requests, site
 * drafts, maintenance digests, unkept leads) in the Queue of the agency that
 * serves the client. It used to be only in /admin/queue. Only clients already
 * authorized for this actor on the page are read: agency_client_overview is the
 * authority, there is no super-admin read, and Strelva Agency has no special
 * case. Behind STRELVA_ONE_QUEUE; off, nothing is read.
 */
export interface TenantServiceDeps {
  links(workspaceIds: string[]): Promise<{ workspaceId: string; tenantStableId: string }[]>;
  tenants(): Promise<QueueTenant[]>;
  readEventKinds(tenants: QueueTenant[]): Promise<SourceRead[]>;
  readSiteDrafts(tenants: QueueTenant[], now: number): Promise<SourceRead>;
  readMaintenanceDigests(): Promise<SourceRead>;
  readUnkeptLeads(): Promise<SourceRead>;
}

export const defaultTenantServiceDeps: TenantServiceDeps = {
  async links(workspaceIds) {
    const db = getSupabase();
    if (!db) throw new Error("Postgres unavailable");
    const { data, error } = await db.from("tenant_workspace_links").select("workspace_id, tenant_stable_id").in("workspace_id", workspaceIds);
    if (error || !data) throw new Error("Tenant links could not be read");
    return data.map(row => ({ workspaceId: String(row.workspace_id), tenantStableId: String(row.tenant_stable_id) }));
  },
  tenants: async () => (await getActiveTenants()).map(tenant => ({ id: tenant.id, siteName: tenant.siteName, stableId: tenant.stableId })),
  readEventKinds: tenants => readEventKinds(tenants, null),
  readSiteDrafts,
  readMaintenanceDigests,
  readUnkeptLeads,
};

const MAX_ITEMS = 200;
const GAP = "Client site work: could not be read.";

export async function addAgencyTenantServiceQueue(
  _actor: WorkspaceActor,
  page: AgencyClientsPage,
  deps: TenantServiceDeps = defaultTenantServiceDeps,
  enabled = oneQueueEnabled(),
  now = Date.now(),
): Promise<AgencyClientsPage> {
  if (!enabled) return page;
  const clients = new Map(page.clients.filter(client => client.status === "ready" && client.provider).map(client => [client.workspaceId, client]));
  const base = page.queue.filter(item => item.kind !== "client_site");
  if (!clients.size) return base.length === page.queue.length ? page : { ...page, queue: base };
  const fail = (): AgencyClientsPage => ({ ...page, queue: base, queueComplete: false, queueGaps: [...new Set([...(page.queueGaps ?? []), GAP])] });
  try {
    const [links, allTenants] = await Promise.all([deps.links([...clients.keys()]), deps.tenants()]);
    const workspaceByStable = new Map(links.map(link => [link.tenantStableId, link.workspaceId]));
    const tenants = allTenants.filter(tenant => tenant.stableId && workspaceByStable.has(tenant.stableId) && clients.has(workspaceByStable.get(tenant.stableId)!));
    if (!tenants.length) return base.length === page.queue.length ? page : { ...page, queue: base };
    const workspaceByTenant = new Map(tenants.map(tenant => [tenant.id, workspaceByStable.get(tenant.stableId!)!]));
    const reads = [
      ...await deps.readEventKinds(tenants),
      await deps.readSiteDrafts(tenants, now),
      await deps.readMaintenanceDigests(),
      await deps.readUnkeptLeads(),
    ];
    const added: AgencyQueueItem[] = [];
    let incomplete = false;
    for (const read of reads) {
      if (!read.ok) { incomplete = true; continue; }
      for (const row of read.rows) {
        const workspaceId = row.tenantId ? workspaceByTenant.get(row.tenantId) : undefined;
        const client = workspaceId ? clients.get(workspaceId) : undefined;
        if (!workspaceId || !client) continue;
        added.push({
          id: `site:${createHash("sha256").update(`${row.kind}:${row.sourceRef}`).digest("hex").slice(0, 32)}`,
          kind: "client_site", workspaceId, clientName: client.name, title: row.title.slice(0, 300),
          systemId: null, workId: null, since: row.openedAt, label: QUEUE_KIND_LABELS[row.kind],
          // The client's own workspace, never the operator href the source carries.
          href: `/workspace?workspaceId=${encodeURIComponent(workspaceId)}`,
        });
      }
    }
    const seen = new Set<string>();
    const unique = added.filter(item => !seen.has(item.id) && seen.add(item.id));
    const capped = unique.slice(0, MAX_ITEMS);
    const gaps = [...(page.queueGaps ?? []), ...(incomplete ? [GAP] : []), ...(unique.length > MAX_ITEMS ? [`Client site work: only the oldest ${MAX_ITEMS} items are shown.`] : [])];
    return { ...page, queue: [...base, ...capped], queueGaps: [...new Set(gaps)], queueComplete: page.queueComplete !== false && !incomplete && unique.length <= MAX_ITEMS };
  } catch {
    return fail();
  }
}
