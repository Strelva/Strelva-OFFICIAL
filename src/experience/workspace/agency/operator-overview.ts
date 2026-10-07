import { CRON_MAX_AGE_SECONDS } from "@/platform/infra/heartbeat";
import { OperatorQueueAccessError, QUEUE_KIND_LABELS, type QueueActor } from "@/platform/operator-queue/contracts";
import { readOperatorQueue } from "@/platform/operator-queue/service";
import { readSiteHealth } from "@/platform/operator-queue/site-health-store";
import type { AgencyClientsPage, AgencyQueueItem } from "../agency-clients";

/** The released agency Queue is a view of the operator Queue, not another
 * store. Only full business memberships enter this view; delegated readers
 * keep the RPC's scoped rows and never receive internal operator details. */
export async function addAgencyOperatorOverview(actor: QueueActor, page: AgencyClientsPage,
  ports = { queue: readOperatorQueue, health: readSiteHealth }, now = Date.now()): Promise<AgencyClientsPage> {
  const clients = new Map(page.clients.filter(client => client.status === "ready" && client.reach === "member").map(client => [client.workspaceId, client]));
  let queue: Awaited<ReturnType<typeof readOperatorQueue>>;
  try { queue = await ports.queue(actor); }
  catch (error) {
    // The operator boundary runs before the portfolio sources are read. An
    // agency member who is not an operator gets only their SQL-scoped view.
    if (error instanceof OperatorQueueAccessError) return page;
    return { ...page, queueComplete: false, queueGaps: ["The shared operator Queue could not be read."] };
  }
  const shared: AgencyQueueItem[] = queue.items.flatMap(item => {
    if (item.business.kind !== "workspace") return [];
    const client = clients.get(item.business.workspaceId);
    if (!client || item.kind === "prospect_lead" || item.kind === "lead_unkept" || item.kind === "ops_alert" || item.kind === "readback_failed") return [];
    // Never widen the client read, even when the portfolio reader is broader.
    if (item.system?.id && !client.systems.some(system => system.id === item.system!.id)) return [];
    return [{ id: `operator:${item.key}`, kind: item.kind === "site_health" ? "health" as const : "operator" as const,
      workspaceId: client.workspaceId, clientName: client.name, title: item.title, systemId: item.system?.id ?? null,
      workId: null, since: item.openedAt, label: QUEUE_KIND_LABELS[item.kind],
      ...(item.system?.id ? { href: `/workspace?view=system&system=${encodeURIComponent(item.system.id)}&workspaceId=${encodeURIComponent(client.workspaceId)}` } : {}),
    }];
  });
  const gaps = queue.gaps.filter(gap => !["prospect_lead", "lead_unkept", "ops_alert", "readback_failed"].includes(gap.kind))
    .map(gap => `${gap.source}: ${gap.reason}`.slice(0, 300));
  let health: Awaited<ReturnType<typeof readSiteHealth>> = null;
  try { health = await ports.health(); }
  catch { gaps.push("System health could not be read."); }
  const fresh = health && now - Date.parse(health.checkedAt) <= CRON_MAX_AGE_SECONDS["website-health"] * 1000;
  const rows = page.clients.map(client => !clients.has(client.workspaceId) ? client : ({ ...client, systems: client.systems.map(system => {
    const links = queue.context?.links.filter(link => link.workspaceId === client.workspaceId && link.systemId === system.id) ?? [];
    const matches = fresh ? health!.results.filter(result => links.some(link => link.tenantId === result.tenantId)) : [];
    // Multiple sites cannot silently pick one site's evidence for a System.
    const evidence = matches.length === 1 ? matches[0] : null;
    return { ...system, health: evidence ? { status: evidence.status, summary: evidence.reasons[0]?.message ?? "The site's checks passed.", lastVerifiedAt: evidence.lastVerifiedAt }
      : { status: "unknown" as const, summary: "No recent health evidence for this System.", lastVerifiedAt: null } };
  }) }));
  // Requests and operational failures represented in the shared queue replace
  // their older projection. Decisions and Version offers retain their owners.
  const sharedBusinesses = new Set(shared.filter(item => item.label === "Service request").map(item => item.workspaceId));
  const retained = page.queue.filter(item => !(item.kind === "request" && sharedBusinesses.has(item.workspaceId)));
  return { ...page, clients: rows, queue: [...retained, ...shared], queueComplete: gaps.length === 0, queueGaps: [...new Set(gaps)] };
}
