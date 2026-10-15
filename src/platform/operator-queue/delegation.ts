import { CLIENT_WORK_KINDS, type OperatorQueue, type QueueContext, type QueueItem } from "./contracts";

function businessWorkspaceId(item: QueueItem, context: QueueContext): string | null {
  if (item.business.kind === "workspace") return item.business.workspaceId;
  if (item.business.kind === "tenant") {
    const tenantId = item.business.tenantId;
    return context.links.find(link => link.tenantId === tenantId)?.workspaceId ?? null;
  }
  return null;
}

/**
 * Client work for a business an agency holds belongs in that agency's Queue.
 * Remove it from this one, keep the per-source counts honest, and say how many
 * moved to which agency. Items for a tenant with no business, or a business no
 * agency holds, stay. Strelva Agency is just another delegation row.
 */
export function delegateClientWork<Q extends OperatorQueue>(queue: Q, context: QueueContext | null): Q {
  if (!context?.delegations.length) return queue;
  const holders = new Map(context.delegations.map(row => [row.customerWorkspaceId, row.agencyWorkspaceId]));
  const moved = new Map<string, number>();
  const counts = queue.counts.map(count => ({ ...count }));
  const keep = (list: QueueItem[], landed: (item: QueueItem) => "shown" | "closed" | "snoozed") => list.filter(item => {
    if (!CLIENT_WORK_KINDS.has(item.kind)) return true;
    const workspaceId = businessWorkspaceId(item, context);
    const agency = workspaceId ? holders.get(workspaceId) : undefined;
    if (!agency) return true;
    moved.set(agency, (moved.get(agency) ?? 0) + 1);
    const count = counts.find(row => row.kind === item.kind);
    if (count) { count.read -= 1; count[landed(item)] -= 1; }
    return false;
  });
  const items = keep(queue.items, () => "shown");
  const parked = keep(queue.parked, item => (item.closed || item.closedElsewhere ? "closed" : "snoozed"));
  if (!moved.size) return queue;
  return { ...queue, items, parked, counts, delegated: [...moved].map(([agencyWorkspaceId, count]) => ({ agencyWorkspaceId, count })).sort((a, b) => a.agencyWorkspaceId.localeCompare(b.agencyWorkspaceId)) };
}
