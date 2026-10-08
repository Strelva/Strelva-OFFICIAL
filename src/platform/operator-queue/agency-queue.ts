import type { OperatorQueue, QueueDelegation, QueueItem, QueueKind } from "./contracts";
import { groupByBusiness } from "./project";

/**
 * The agency surface's Queue (spec §9.1, option c): the same projection,
 * filtered to the customer businesses an agency has an active delegation for.
 * Retained projection compatibility only; the released agency Queue uses the
 * agency-clients projection in AgencyHome. It grants no provider authority.
 *
 * Never shown to an agency: platform sales leads, items with no
 * business, and kinds that expose platform-internal state (receipts' read-back
 * ledger, the lead copy).
 * Provider-visible receipt checks and owner delivery use the separate
 * current-seat/staff scoped provider-client-queue read.
 */
const PLATFORM_INTERNAL: ReadonlySet<QueueKind> = new Set(["prospect_lead", "readback_failed", "lead_unkept", "ops_alert"]);

export interface AgencyQueueView {
  agencyWorkspaceId: string;
  complete: boolean;
  /** Source gaps, named so an agency never reads a short list as a complete one. */
  gaps: string[];
  groups: { workspaceId: string; name: string; items: AgencyQueueRow[] }[];
  total: number;
}

export interface AgencyQueueRow {
  key: string;
  kind: QueueKind;
  title: string;
  priority: QueueItem["priority"];
  priorityReason: string | null;
  move: QueueItem["move"];
  dueAt: string | null;
  late: boolean;
  openedAt: string;
  system: string | null;
}

export function buildAgencyQueue(queue: OperatorQueue, delegations: QueueDelegation[], agencyWorkspaceId: string): AgencyQueueView {
  const customers = new Set(delegations.filter((d) => d.agencyWorkspaceId === agencyWorkspaceId).map((d) => d.customerWorkspaceId));
  const visible = queue.items.filter((item) =>
    item.business.kind === "workspace" && customers.has(item.business.workspaceId) && !PLATFORM_INTERNAL.has(item.kind));
  const groups = groupByBusiness(visible).map((group) => ({
    workspaceId: group.business.kind === "workspace" ? group.business.workspaceId : "",
    name: group.business.kind === "workspace" ? group.business.name : "",
    items: group.items.map((item): AgencyQueueRow => ({
      key: item.key, kind: item.kind, title: item.title, priority: item.priority, priorityReason: item.priorityReason,
      move: item.move, dueAt: item.dueAt, late: item.late, openedAt: item.openedAt, system: item.system?.label ?? null,
    })),
  }));
  return {
    agencyWorkspaceId,
    complete: queue.complete,
    gaps: queue.gaps.filter((gap) => !PLATFORM_INTERNAL.has(gap.kind)).map((gap) => `Couldn't read ${gap.source.toLowerCase()} (${gap.reason})`),
    groups,
    total: visible.length,
  };
}
