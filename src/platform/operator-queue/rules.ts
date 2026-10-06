import type { BusinessEffortCategory } from "@/platform/business-effort/types";
import type { QueueItemRaw, QueueKind, QueueMark, QueueMove, QueuePriority, QueueState } from "./contracts";

/**
 * Priority, due time and lateness (spec §3.3–3.4). Priority is computed, never
 * hand-set; a computed priority never approves anything.
 */

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** Existing clocks, reused. */
export const EVENT_RETENTION_DAYS = 90; // src/lib/events.ts
export const DRAFT_RAISE_AFTER_DAYS = 80;
export const DOMAIN_VERIFICATION_ESCALATION_DAYS = 7; // website-domain-verification
export const APPROVE_LINK_DAYS = 14; // src/lib/approve-link.ts
export const DOMAIN_EXPIRY_HARM_DAYS = 7;

/** Proposed clocks, spec §9.2. Jacob to confirm; changing them is config only. */
export const PROPOSED_CLOCKS = {
  p1AcknowledgeMs: 2 * HOUR,
  ownerFirstChaseDays: 3,
  ownerSecondChaseDays: 7,
} as const;

export interface PriorityResult { priority: QueuePriority; move: QueueMove; reason: string | null }

function daysUntil(iso: string, now: number): number {
  return Math.ceil((Date.parse(iso) - now) / DAY);
}

export function priorityFor(raw: QueueItemRaw, now: number): PriorityResult {
  const facts = raw.facts ?? {};
  switch (raw.kind) {
    case "lead_unkept":
      return { priority: "P1", move: "strelva", reason: "A lead is safe in Redis but not yet kept in Postgres." };
    case "readback_failed":
      return { priority: "P1", move: "strelva", reason: "The provider accepted the write but the read-back did not match. Never re-sent automatically." };
    case "domain_alert": {
      if (facts.domainState && facts.domainState !== "expiring") {
        return { priority: "P1", move: "strelva", reason: `The site is ${facts.domainState}.` };
      }
      const days = facts.daysToExpiry ?? null;
      if (days !== null && days <= DOMAIN_EXPIRY_HARM_DAYS) {
        return { priority: "P1", move: "owner", reason: days <= 0 ? "The domain has expired." : `The domain expires in ${days} day${days === 1 ? "" : "s"}.` };
      }
      return { priority: "P4", move: "owner", reason: days === null ? "Renewal is the owner's call." : `Expires in ${days} days. Renewal is the owner's call.` };
    }
    case "ops_alert":
      return facts.severity === "high"
        ? { priority: "P1", move: "strelva", reason: "A failure that is affecting a live site or client data." }
        : { priority: "P2", move: "strelva", reason: null };
    case "site_health":
      if (facts.healthStatus === "blocked") return { priority: "P1", move: "strelva", reason: "The site check is failing." };
      if (facts.healthStatus === "unknown") return { priority: "P2", move: "strelva", reason: "No recent evidence. Unknown is never green." };
      return { priority: "P2", move: "strelva", reason: null };
    case "change_request":
      if (facts.workflowStatus === "quoted") return { priority: "P4", move: "owner", reason: "Quoted. Waiting on the owner to accept." };
      return { priority: "P2", move: "strelva", reason: null };
    case "service_request":
    case "assignment_offer":
    case "operational_exception":
    case "prospect_lead":
      return { priority: "P2", move: "strelva", reason: null };
    case "draft_review": {
      if (facts.expiresAt) {
        const age = now - Date.parse(raw.openedAt);
        if (age >= DRAFT_RAISE_AFTER_DAYS * DAY) {
          const left = Math.max(0, daysUntil(facts.expiresAt, now));
          return { priority: "P2", move: "strelva", reason: `Expires in ${left} day${left === 1 ? "" : "s"}.` };
        }
      }
      return { priority: "P3", move: "strelva", reason: null };
    }
    case "site_draft":
    case "maintenance_digest":
      return { priority: "P3", move: "strelva", reason: null };
    case "owner_pending":
    case "domain_unverified":
      return { priority: "P4", move: "owner", reason: null };
  }
}

/** The known clock for an item, or null when it has none. */
export function dueAtFor(raw: QueueItemRaw, priority: QueuePriority, mark: QueueMark | null): string | null {
  if (raw.dueAt) return raw.dueAt;
  const opened = Date.parse(raw.openedAt);
  if (Number.isNaN(opened)) return null;
  if (raw.kind === "draft_review" && raw.facts?.expiresAt && priority === "P2") return raw.facts.expiresAt;
  if (raw.kind === "domain_unverified") return new Date(opened + DOMAIN_VERIFICATION_ESCALATION_DAYS * DAY).toISOString();
  if (raw.kind === "owner_pending") {
    if (mark?.ownerToldVia === "approve_link" && mark.ownerToldAt) {
      return new Date(Date.parse(mark.ownerToldAt) + APPROVE_LINK_DAYS * DAY).toISOString();
    }
    if (mark?.ownerToldAt) {
      const gap = PROPOSED_CLOCKS.ownerSecondChaseDays - PROPOSED_CLOCKS.ownerFirstChaseDays;
      return new Date(Date.parse(mark.ownerToldAt) + gap * DAY).toISOString();
    }
    return new Date(opened + PROPOSED_CLOCKS.ownerFirstChaseDays * DAY).toISOString();
  }
  if (priority === "P1") return new Date(opened + PROPOSED_CLOCKS.p1AcknowledgeMs).toISOString();
  return null;
}

export function isLate(dueAt: string | null, now: number, acknowledged: boolean, priority: QueuePriority): boolean {
  if (!dueAt) return false;
  // The P1 clock is an acknowledgement clock: taking the item meets it.
  if (priority === "P1" && acknowledged) return false;
  return Date.parse(dueAt) < now;
}

export function stateFor(move: QueueMove, mark: QueueMark | null, closedElsewhere: boolean): QueueState {
  if (mark?.closedState) return mark.closedState;
  if (closedElsewhere) return "done";
  if (move === "owner") return "waiting_on_owner";
  if (move === "provider") return "waiting_on_provider";
  if (mark?.assigneeUserId) return "taken";
  return "open";
}

const PRIORITY_RANK: Record<QueuePriority, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };

/** Pinned first, then P1→P4; within a level oldest due first, then oldest opened. */
export function compareItems(
  a: { pinned: boolean; priority: QueuePriority; dueAt: string | null; openedAt: string; key: string },
  b: { pinned: boolean; priority: QueuePriority; dueAt: string | null; openedAt: string; key: string },
): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  const rank = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (rank) return rank;
  if (a.dueAt && b.dueAt) {
    const due = Date.parse(a.dueAt) - Date.parse(b.dueAt);
    if (due) return due;
  } else if (a.dueAt || b.dueAt) {
    return a.dueAt ? -1 : 1;
  }
  const opened = Date.parse(a.openedAt) - Date.parse(b.openedAt);
  return opened || a.key.localeCompare(b.key);
}

/** Minutes category per kind (spec §3.13). */
export const EFFORT_CATEGORY_BY_KIND: Record<QueueKind, BusinessEffortCategory> = {
  change_request: "change",
  draft_review: "review",
  site_draft: "review",
  maintenance_digest: "review",
  owner_pending: "support",
  ops_alert: "recovery",
  domain_alert: "recovery",
  domain_unverified: "recovery",
  site_health: "recovery",
  lead_unkept: "recovery",
  readback_failed: "recovery",
  service_request: "delivery",
  operational_exception: "delivery",
  assignment_offer: "delivery",
  prospect_lead: "sales",
};

/** Minutes prefill from focused time, rounded up to a whole minute, capped. */
export function prefillMinutes(focusedMs: number): number {
  if (!Number.isFinite(focusedMs) || focusedMs <= 0) return 1;
  return Math.min(480, Math.max(1, Math.ceil(focusedMs / 60_000)));
}
