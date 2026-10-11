import { createSupabaseSystemStore, listBusinessSystems } from "@/platform/systems";
import { deriveSystemHealth, healthGraphFromSystems } from "@/platform/system-health";
import { readSystemsEvidence } from "@/experience/systems/server";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { AgencyClientsPage, AgencyQueueItem } from "../agency-clients";

/** Ordinary client grants supply service health. No platform operator read or bypass. */
export async function addAgencyOperatorOverview(actor: WorkspaceActor, page: AgencyClientsPage,
  ports = { systems: (actor: WorkspaceActor, workspaceId: string) => listBusinessSystems(actor, workspaceId, { store: createSupabaseSystemStore() }), evidence: readSystemsEvidence }, now = Date.now()): Promise<AgencyClientsPage> {
  const gaps = [...(page.queueGaps ?? [])];
  const queue: AgencyQueueItem[] = page.queue.filter(item => item.kind !== "operator");
  const clients = await Promise.all(page.clients.map(async client => {
    if (client.status !== "ready") { gaps.push(`${client.name}: client could not be read.`); return client; }
    try {
      const listing = await ports.systems(actor, client.workspaceId);
      const allowed = new Set(client.systems.map(system => system.id));
      const systems = listing.systems.filter(row => allowed.has(row.system.id));
      const scoped = { ...listing, systems, connections: listing.connections.filter(connection => allowed.has(connection.connection.source.systemId)) };
      const health = deriveSystemHealth(healthGraphFromSystems({ systems: systems.map(row => row.system), connections: scoped.connections.map(row => row.connection), observations: await ports.evidence(scoped, now) }), now);
      return { ...client, systems: client.systems.map(system => {
        const checked = health.get(system.id);
        if (checked?.status === "blocked" || checked?.status === "degraded") queue.push({ id: `health:${system.id}`, kind: "health", workspaceId: client.workspaceId, clientName: client.name, title: system.name, systemId: system.id, workId: null, since: checked.lastVerifiedAt || new Date(now).toISOString(), href: `/workspace?view=system&system=${system.id}&workspaceId=${client.workspaceId}` });
        return { ...system, health: checked ? { status: checked.status, summary: checked.reasons[0]?.message || "No recent health evidence.", lastVerifiedAt: checked.lastVerifiedAt } : { status: "unknown" as const, summary: "No recent health evidence.", lastVerifiedAt: null } };
      }) };
    } catch { gaps.push(`${client.name}: System health could not be read.`); return client; }
  }));
  return { ...page, clients, queue, queueComplete: !page.nextCursor && gaps.length === 0, queueGaps: [...new Set(gaps)] };
}
