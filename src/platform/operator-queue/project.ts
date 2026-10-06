import {
  QUEUE_KINDS,
  type OperatorQueue, type OwnerReach, type QueueBusiness, type QueueContext, type QueueItem, type QueueItemRaw,
  type QueueKind, type QueueLink, type QueueMark, type QueueSourceCount, type QueueSourceGap, type QueueSystem,
} from "./contracts";
import { compareItems, dueAtFor, isLate, priorityFor, stateFor } from "./rules";

/**
 * The queue projection. Pure: every source read and the Postgres context are
 * passed in, so the same function serves /admin, the agency Queue view model
 * and the count-parity tests. It stores nothing it copies.
 */

export type SourceRead =
  | { kind: QueueKind; source: string; ok: true; rows: QueueItemRaw[] }
  | { kind: QueueKind; source: string; ok: false; reason: string };

export interface ProjectionTenant { id: string; siteName?: string; stableId?: string }

export interface ProjectInput {
  reads: SourceRead[];
  /** Null when Postgres could not be read: marks are then unknown. */
  context: QueueContext | null;
  contextFailure?: string;
  tenants: ProjectionTenant[];
  /** Client email paused (EMAIL_SENDING_ENABLED unset): owners can't be told. */
  emailPaused: boolean;
  now: number;
}

function markKey(kind: string, ref: string) { return `${kind}:${ref}`; }

function businessFor(raw: QueueItemRaw, links: Map<string, QueueLink>, names: Map<string, string>, tenants: Map<string, ProjectionTenant>): QueueBusiness {
  if (raw.workspaceId) {
    const linkTenant = raw.tenantId ?? [...links.values()].find((link) => link.workspaceId === raw.workspaceId)?.tenantId ?? null;
    return { kind: "workspace", workspaceId: raw.workspaceId, name: names.get(raw.workspaceId) ?? "Business", tenantId: linkTenant };
  }
  if (raw.tenantId) {
    const link = links.get(raw.tenantId);
    if (link) return { kind: "workspace", workspaceId: link.workspaceId, name: link.workspaceName, tenantId: raw.tenantId };
    const tenant = tenants.get(raw.tenantId);
    return { kind: "tenant", tenantId: raw.tenantId, name: tenant?.siteName || raw.tenantId };
  }
  return { kind: "strelva" };
}

function systemFor(raw: QueueItemRaw, links: Map<string, QueueLink>, tenants: Map<string, ProjectionTenant>): QueueSystem | null {
  if (raw.kind === "prospect_lead") return null;
  if (raw.systemId) return { id: raw.systemId, label: "System" };
  if (raw.tenantId) {
    const link = links.get(raw.tenantId);
    const tenant = tenants.get(raw.tenantId);
    const label = `${tenant?.siteName || raw.tenantId} website`;
    if (link?.systemId) return { id: link.systemId, label };
    // Unconverted tenant: the managed website is named by its stable id.
    return { id: tenant?.stableId ?? link?.tenantStableId ?? null, label };
  }
  return { id: null, label: "Not attached" };
}

function ownerReachFor(mark: QueueMark | null, emailPaused: boolean): OwnerReach {
  if (mark?.ownerToldVia && mark.ownerToldAt) return { status: "told", via: mark.ownerToldVia, at: mark.ownerToldAt };
  return emailPaused ? { status: "email_paused" } : { status: "not_told" };
}

export function projectQueue(input: ProjectInput): OperatorQueue {
  const { now } = input;
  const links = new Map((input.context?.links ?? []).map((link) => [link.tenantId, link]));
  const names = new Map<string, string>();
  for (const business of input.context?.businesses ?? []) names.set(business.id, business.name);
  for (const link of input.context?.links ?? []) names.set(link.workspaceId, link.workspaceName);
  const tenants = new Map(input.tenants.map((tenant) => [tenant.id, tenant]));
  const marks = new Map((input.context?.marks ?? []).map((mark) => [markKey(mark.source, mark.sourceRef), mark]));

  const gaps: QueueSourceGap[] = [];
  if (!input.context) {
    gaps.push({ kind: "readback_failed", source: "Queue marks and receipts", reason: input.contextFailure ?? "Postgres unavailable" });
  }
  const items: QueueItem[] = [];
  const parked: QueueItem[] = [];
  const counts = new Map<QueueKind, QueueSourceCount>(QUEUE_KINDS.map((kind) => [kind, { kind, read: 0, shown: 0, closed: 0, snoozed: 0 }]));
  const seen = new Set<string>();

  for (const read of input.reads) {
    if (!read.ok) {
      gaps.push({ kind: read.kind, source: read.source, reason: read.reason });
      continue;
    }
    const count = counts.get(read.kind)!;
    for (const raw of read.rows) {
      const key = markKey(raw.kind, raw.sourceRef);
      // A source listing one ref twice is one item; parity counts unique refs.
      if (seen.has(key)) continue;
      seen.add(key);
      count.read += 1;
      const mark = marks.get(key) ?? null;
      const { priority, move, reason } = priorityFor(raw, now);
      const dueAt = dueAtFor(raw, priority, mark);
      const closedElsewhere = raw.facts?.closedElsewhere ?? null;
      const pinned = Boolean(mark?.pinnedUntil && Date.parse(mark.pinnedUntil) > now);
      // P1 is never snoozed, even if a stale mark says so.
      const snoozed = priority !== "P1" && mark?.snoozedUntil && mark.snoozeReason && Date.parse(mark.snoozedUntil) > now
        ? { until: mark.snoozedUntil, reason: mark.snoozeReason } : null;
      const item: QueueItem = {
        key,
        kind: raw.kind,
        sourceRef: raw.sourceRef,
        business: businessFor(raw, links, names, tenants),
        system: systemFor(raw, links, tenants),
        title: raw.title,
        move,
        priority,
        priorityReason: reason,
        openedAt: raw.openedAt,
        ageMs: Math.max(0, now - Date.parse(raw.openedAt)),
        dueAt,
        late: isLate(dueAt, now, Boolean(mark?.assigneeUserId), priority),
        state: stateFor(move, mark, Boolean(closedElsewhere)),
        assignee: mark?.assigneeUserId ? { userId: mark.assigneeUserId, email: mark.assigneeEmail } : null,
        pinned,
        snoozed,
        ownerReach: move === "owner" ? ownerReachFor(mark, input.emailPaused) : null,
        notes: mark?.notes ?? [],
        href: raw.href,
        receiptIds: [...(raw.receiptIds ?? []), ...(mark?.closedReceiptId ? [mark.closedReceiptId] : [])],
        closed: mark?.closedState && mark.closedAt
          ? { state: mark.closedState, reason: mark.closedReason, receiptId: mark.closedReceiptId, at: mark.closedAt } : null,
        closedElsewhere,
      };
      if (item.closed || closedElsewhere) {
        count.closed += 1;
        parked.push(item);
      } else if (snoozed) {
        count.snoozed += 1;
        parked.push(item);
      } else {
        count.shown += 1;
        items.push(item);
      }
    }
  }

  items.sort(compareItems);
  parked.sort(compareItems);
  return {
    generatedAt: new Date(now).toISOString(),
    items,
    parked,
    gaps,
    complete: gaps.length === 0,
    counts: [...counts.values()],
    operators: input.context?.operators ?? [],
  };
}

/** Group the main list by business, keeping queue order inside each group. */
export function groupByBusiness(items: QueueItem[]): { key: string; business: QueueBusiness; items: QueueItem[] }[] {
  const groups = new Map<string, { key: string; business: QueueBusiness; items: QueueItem[] }>();
  for (const item of items) {
    const key = item.business.kind === "workspace" ? `w:${item.business.workspaceId}`
      : item.business.kind === "tenant" ? `t:${item.business.tenantId}` : "strelva";
    const group = groups.get(key) ?? { key, business: item.business, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function businessLabel(business: QueueBusiness): string {
  if (business.kind === "strelva") return "Strelva";
  if (business.kind === "tenant") return `${business.name} · not yet a workspace`;
  return business.name;
}
