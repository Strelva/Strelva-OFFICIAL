/**
 * Governed-work domain types (Phase 2a ontology foundation).
 *
 * Hand-authored camelCase mirrors of the four tables in
 * supabase/migrations/20260714210000_governed_work_tables.sql. They are authored
 * by hand — NOT generated into src/lib/db/database.types.ts — because that
 * migration is intentionally UNAPPLIED in this increment, so the generated types
 * have no knowledge of these tables yet. Regenerate database.types.ts (and retire
 * these hand types in favour of typed Row/Insert access) at the #8 cutover.
 *
 * These model the same lifecycle that today lives in Redis as a `UnifiedEvent`
 * (src/lib/events.ts) driven through src/lib/event-actions.ts. Nothing on the live
 * path reads or writes them yet; authority stays in Redis until #8. See
 * docs/ontology-phase2-governed-work.md.
 */

/** Who authored the proposed change. Mirrors the UnifiedEvent `source` collapsed
 *  to the governance-relevant actors. */
export type ProposalSource = "ai" | "admin" | "system";

/** Closed lifecycle set for a proposal. `pending`/`approved`/`dismissed` mirror the
 *  Redis event; `executed`/`failed` are the terminal states the outcome adds. */
export type ProposalStatus = "pending" | "approved" | "dismissed" | "executed" | "failed";

/** The approve/dismiss verb recorded against a proposal. */
export type DecisionAction = "approved" | "dismissed";

/** An external-write attempt's lifecycle (mirrors the execution `state` marker:
 *  processing -> completed|failed). */
export type ExecutionAttemptStatus = "running" | "succeeded" | "failed";

/** A proposed governed change — the `UnifiedEvent` while it is pending review. */
export interface Proposal {
  /** App-side id (evt_* / sug_*), not a uuid — keyed 1:1 to the Redis event. */
  id: string;
  tenantId: string;
  source: ProposalSource;
  /** metadata.kind, e.g. `gbp_post_draft`; null for kind-less events. */
  kind: string | null;
  /** The UnifiedEvent `type` (content_update, review, newsletter_draft, …). */
  entityType: string;
  title: string | null;
  body: string | null;
  /** The execution-driving metadata (the UnifiedEvent `metadata` payload). */
  payload: Record<string, unknown> | null;
  status: ProposalStatus;
  createdAt: string;
}

/** The owner/operator approve|dismiss on a proposal (from claimEventAction). */
export interface Decision {
  id: string;
  proposalId: string;
  action: DecisionAction;
  actor: string;
  decidedAt: string;
}

/** One attempt to perform the external write for an approved proposal. */
export interface ExecutionAttempt {
  id: string;
  proposalId: string;
  attemptNo: number;
  /** The attemptId / reconciliation key that survives a crashed action lock. */
  idempotencyKey: string | null;
  status: ExecutionAttemptStatus;
  /** Provider acknowledgement (e.g. the created GBP post id). */
  providerReceipt: Record<string, unknown> | null;
  startedAt: string;
  finishedAt: string | null;
}

/** The terminal result of an execution attempt. `success` gates resolution;
 *  `verified` is the separate read-back confirmation (false-with-success is the
 *  change_verify_failed signal). */
export interface Outcome {
  id: string;
  executionAttemptId: string;
  success: boolean;
  verified: boolean | null;
  detail: string | null;
  createdAt: string;
}
