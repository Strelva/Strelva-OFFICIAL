import { z } from "zod";

/**
 * One place to operate (docs/product/specs/operator.md). Shared shapes for the
 * operator queue: a read projection over existing sources, keyed Business →
 * System. Each source keeps its authority; the queue stores only marks.
 */

/** The fifteen kinds in spec §3.1. A source is one store the queue reads. */
export const QUEUE_KINDS = [
  "draft_review", "site_draft", "maintenance_digest", "change_request", "owner_pending",
  "ops_alert", "domain_alert", "domain_unverified", "site_health", "service_request",
  "operational_exception", "assignment_offer", "lead_unkept", "prospect_lead", "readback_failed",
] as const;
export type QueueKind = (typeof QUEUE_KINDS)[number];

export const QUEUE_KIND_LABELS: Record<QueueKind, string> = {
  draft_review: "Draft to review",
  site_draft: "Site draft",
  maintenance_digest: "Maintenance digest",
  change_request: "Change request",
  owner_pending: "Owner approval",
  ops_alert: "Operations alert",
  domain_alert: "Domain",
  domain_unverified: "Domain unverified",
  site_health: "Site health",
  service_request: "Service request",
  operational_exception: "Failed step",
  assignment_offer: "Assignment offer",
  lead_unkept: "Lead not kept",
  prospect_lead: "Sales lead",
  readback_failed: "Read-back failed",
};

export type QueuePriority = "P1" | "P2" | "P3" | "P4";
export const PRIORITY_LABELS: Record<QueuePriority, string> = {
  P1: "Harm now",
  P2: "Waiting on Strelva",
  P3: "Strelva's drafts",
  P4: "Owner's call",
};

/** Whose move it is. The operator never decides an owner's call. */
export type QueueMove = "strelva" | "owner" | "provider";

export type QueueState = "open" | "taken" | "waiting_on_owner" | "waiting_on_provider" | "done" | "dismissed" | "expired";

/** Business is the customer workspace, or the tenant before conversion. */
export type QueueBusiness =
  | { kind: "workspace"; workspaceId: string; name: string; tenantId: string | null }
  | { kind: "tenant"; tenantId: string; name: string }
  | { kind: "strelva" };

export interface QueueSystem {
  /** A row in `systems`, or the managed website named by tenant stable id. */
  id: string | null;
  label: string;
}

/** How the owner was told about an owner's-call item. */
export type OwnerReach =
  | { status: "told"; via: "email" | "approve_link"; at: string }
  | { status: "not_told" }
  | { status: "email_paused" };

export interface QueueItemRaw {
  kind: QueueKind;
  /** Stable reference inside its source; the mark key is (kind, sourceRef). */
  sourceRef: string;
  tenantId: string | null;
  workspaceId: string | null;
  systemId?: string | null;
  title: string;
  openedAt: string;
  /** A known clock from the source (triage due, verification escalation). */
  dueAt?: string | null;
  /** Source facts the rules read. Never lead contents. */
  facts?: QueueFacts;
  href: string;
  receiptIds?: string[];
}

export interface QueueFacts {
  /** domain_alert: what the monitor saw. */
  domainState?: "down" | "parked" | "unreachable" | "expiring";
  daysToExpiry?: number | null;
  /** ops_alert severity from the attention briefing. */
  severity?: "high" | "medium" | "low";
  /** draft_review: events expire at 90 days; raised to P2 after 80. */
  expiresAt?: string | null;
  /** owner_pending: raw reach from marks, resolved with the email gate. */
  retryCount?: number;
  /** change_request workflow status. */
  workflowStatus?: string;
  /** operational_exception effect certainty. */
  effect?: "none" | "accepted" | "unknown";
  /** site_health status from the every-site health cron. */
  healthStatus?: "healthy" | "degraded" | "blocked" | "unknown";
  /** True when the source already closed the item elsewhere. */
  closedElsewhere?: { by: string; at: string };
}

export interface QueueNote { id: string; body: string; by: string | null; at: string }

export interface QueueMark {
  source: string;
  sourceRef: string;
  assigneeUserId: string | null;
  assigneeEmail: string | null;
  pinnedUntil: string | null;
  snoozedUntil: string | null;
  snoozeReason: string | null;
  closedState: "done" | "dismissed" | null;
  closedReason: string | null;
  closedReceiptId: string | null;
  closedAt: string | null;
  ownerToldVia: "email" | "approve_link" | null;
  ownerToldAt: string | null;
  revision: number;
  updatedBy: string;
  updatedAt: string;
  notes: QueueNote[];
}

export interface QueueItem {
  /** `${kind}:${sourceRef}`, unique across the queue. */
  key: string;
  kind: QueueKind;
  sourceRef: string;
  business: QueueBusiness;
  system: QueueSystem | null;
  title: string;
  move: QueueMove;
  priority: QueuePriority;
  /** Why this priority, in plain words ("expires in 6 days"). */
  priorityReason: string | null;
  openedAt: string;
  ageMs: number;
  dueAt: string | null;
  late: boolean;
  state: QueueState;
  assignee: { userId: string; email: string | null } | null;
  pinned: boolean;
  snoozed: { until: string; reason: string } | null;
  ownerReach: OwnerReach | null;
  notes: QueueNote[];
  href: string;
  receiptIds: string[];
  closed: { state: "done" | "dismissed"; reason: string | null; receiptId: string | null; at: string } | null;
  closedElsewhere: { by: string; at: string } | null;
}

/** A source that could not be read. The list is then marked incomplete. */
export interface QueueSourceGap { kind: QueueKind; source: string; reason: string }

export interface QueueSourceCount { kind: QueueKind; read: number; shown: number; closed: number; snoozed: number }

export interface OperatorQueue {
  generatedAt: string;
  items: QueueItem[];
  /** Closed and snoozed items, kept out of the main list but countable. */
  parked: QueueItem[];
  gaps: QueueSourceGap[];
  complete: boolean;
  /** Count parity: every raw row from every source lands in items or parked. */
  counts: QueueSourceCount[];
  operators: { userId: string; email: string }[];
}

export interface QueueLink { tenantId: string; tenantStableId: string; workspaceId: string; workspaceName: string; systemId: string | null }
export interface QueueDelegation { agencyWorkspaceId: string; customerWorkspaceId: string }

/** Receipts. Mirrors `outside_write_receipts`. */
export const OUTSIDE_WRITE_PROVIDERS = ["google_business", "vercel", "strelva_routing", "strelva_content"] as const;
export const OUTSIDE_WRITE_KINDS = ["review_reply", "gbp_hours", "gbp_post", "gbp_photo", "domain_add", "domain_claim_removal", "content_publish"] as const;
export type OutsideWriteProvider = (typeof OUTSIDE_WRITE_PROVIDERS)[number];
export type OutsideWriteKind = (typeof OUTSIDE_WRITE_KINDS)[number];
export type OutsideWriteAcceptance = "accepted" | "rejected" | "unknown";
export type OutsideWriteReadback = "pending" | "matched" | "differs" | "failed" | "not_possible";
export type OutsideWriteUndo = "available" | "claim_only" | "put_back_draft" | "not_available";

const isoish = z.string().min(1);
export const outsideWriteReceiptSchema = z.object({
  id: z.string().uuid(),
  commandKey: z.string(),
  tenantId: z.string().nullable(),
  tenantStableId: z.string().uuid().nullable(),
  workspaceId: z.string().uuid().nullable(),
  systemId: z.string().uuid().nullable(),
  provider: z.enum(OUTSIDE_WRITE_PROVIDERS),
  writeKind: z.enum(OUTSIDE_WRITE_KINDS),
  subject: z.string(),
  request: z.record(z.string(), z.unknown()),
  beforeState: z.unknown().nullable(),
  acceptance: z.enum(["accepted", "rejected", "unknown"]),
  acceptanceDetail: z.string().nullable(),
  providerRef: z.string().nullable(),
  acceptedAt: isoish.nullable(),
  readback: z.enum(["pending", "matched", "differs", "failed", "not_possible"]),
  readbackDetail: z.string().nullable(),
  readbackAt: isoish.nullable(),
  undo: z.enum(["available", "claim_only", "put_back_draft", "not_available"]),
  undoLabel: z.string(),
  actor: z.string(),
  createdAt: isoish,
}).strict();
export type OutsideWriteReceipt = z.infer<typeof outsideWriteReceiptSchema>;

const noteSchema = z.object({ id: z.string().uuid(), body: z.string(), by: z.string().nullable(), at: isoish }).strict();
export const queueMarkSchema = z.object({
  source: z.string(),
  sourceRef: z.string(),
  assigneeUserId: z.string().uuid().nullable(),
  assigneeEmail: z.string().nullable(),
  pinnedUntil: isoish.nullable(),
  snoozedUntil: isoish.nullable(),
  snoozeReason: z.string().nullable(),
  closedState: z.enum(["done", "dismissed"]).nullable(),
  closedReason: z.string().nullable(),
  closedReceiptId: z.string().uuid().nullable(),
  closedAt: isoish.nullable(),
  ownerToldVia: z.enum(["email", "approve_link"]).nullable(),
  ownerToldAt: isoish.nullable(),
  revision: z.number().int().positive(),
  updatedBy: z.string().uuid(),
  updatedAt: isoish,
  notes: z.array(noteSchema),
}).strict();

export const queueContextSchema = z.object({
  links: z.array(z.object({
    tenantId: z.string(), tenantStableId: z.string().uuid(), workspaceId: z.string().uuid(),
    workspaceName: z.string(), systemId: z.string().uuid().nullable(),
  }).strict()),
  businesses: z.array(z.object({ id: z.string().uuid(), name: z.string() }).strict()),
  delegations: z.array(z.object({ agencyWorkspaceId: z.string().uuid(), customerWorkspaceId: z.string().uuid() }).strict()),
  documentHealth: z.array(z.object({
    workspaceId: z.string().uuid(), workId: z.string(), revision: z.number(), status: z.string(),
    checkedAt: isoish, tenantId: z.string().nullable(),
  }).strict()),
  operators: z.array(z.object({ userId: z.string().uuid(), email: z.string() }).strict()),
  marks: z.array(queueMarkSchema),
  readbackFailures: z.array(outsideWriteReceiptSchema),
}).strict();
export type QueueContext = z.infer<typeof queueContextSchema>;

export const MARK_ACTIONS = ["take", "hand_off", "release", "pin", "unpin", "snooze", "unsnooze", "note", "owner_told", "close", "reopen"] as const;
export type MarkAction = (typeof MARK_ACTIONS)[number];

export interface QueueActor { userId: string; verifiedEmail: string }

export class OperatorQueueAccessError extends Error {
  constructor(message = "Only a Strelva operator can use the queue.") { super(message); this.name = "OperatorQueueAccessError"; }
}
export class OperatorQueueValidationError extends Error {
  constructor(message = "Check the item and try again.") { super(message); this.name = "OperatorQueueValidationError"; }
}
export class OperatorQueueConflictError extends Error {
  constructor(message = "That item changed. Reload and try again.") { super(message); this.name = "OperatorQueueConflictError"; }
}
export class OperatorQueueUnavailableError extends Error {
  constructor(message = "Queue storage is unavailable. Nothing was saved.") { super(message); this.name = "OperatorQueueUnavailableError"; }
}
