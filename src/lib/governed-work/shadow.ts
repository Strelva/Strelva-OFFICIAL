/**
 * Governed-work SHADOW-WRITE (Phase 2b ontology increment).
 *
 * Wires the Redis-authoritative governed-work lifecycle (a `UnifiedEvent` in
 * src/lib/events.ts, decided + executed through src/lib/event-actions.ts) into the
 * normalized proposals/decisions/execution_attempts/outcomes tables as a PARALLEL
 * shadow. Redis stays 100% authoritative and every read path is untouched; these
 * writes only populate the new tables so a LATER staged cutover (#8) has parity
 * data. See docs/ontology-phase2-governed-work.md for the field→table mapping.
 *
 * Two hard invariants, both enforced here so call sites can't get them wrong:
 *  1. FLAG-GATED — every orchestrator no-ops unless GOVERNED_WORK_DUAL_WRITE is
 *     explicitly on (`governedWorkDualWriteEnabled()`, default OFF). Flag OFF ⇒
 *     zero new DB calls ⇒ behavior byte-identical to today.
 *  2. BEST-EFFORT — a shadow failure is swallowed + logged, NEVER propagated. The
 *     Redis path and the user-visible result are untouched regardless. (The
 *     repository fns are already best-effort/null-safe; the local try/catch also
 *     guards the pure mapping so nothing here can throw into the caller.)
 *
 * ⚠️ The #7 migration (`supabase/migrations/20260714210000_governed_work_tables.sql`)
 * MUST be applied — and database.types.ts regenerated — before the flag is enabled;
 * until then these tables don't exist and every shadow write degrades to a logged
 * no-op.
 */

import type { UnifiedEvent } from "../types";
import type { DecisionAction } from "./types";
import { governedWorkDualWriteEnabled } from "../db/dual-write";
import {
  finishExecutionAttempt,
  insertProposal,
  recordDecision,
  recordOutcome,
  startExecutionAttempt,
  type NewProposal,
} from "./repository";

/** Swallow + log a shadow failure; never let it reach the Redis-path caller. */
async function bestEffort(label: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (err) {
    console.error(
      `[governed-work-shadow] ${label} failed:`,
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * True for a `UnifiedEvent` that represents governed work — a proposed change that
 * runs the approve/dismiss lifecycle — as opposed to a pure observation (a review
 * landing, a booking, a payment, a verify signal). Only decided-lifecycle events
 * (`pending` awaiting a call, or `auto_approved` already decided by the system) are
 * proposals; a `review` is only governed work when it carries a reply draft.
 */
export function isGovernedWorkEvent(e: UnifiedEvent): boolean {
  if (e.status !== "pending" && e.status !== "auto_approved") return false;
  switch (e.type) {
    case "content_update":
    case "newsletter_draft":
    case "change_request":
    case "suggestion":
      return true;
    case "review":
      return e.metadata?.kind === "review_reply_draft";
    default:
      // booking, message, mention, build_payment, change_verified/verify_failed,
      // visibility_snapshot — observations, not governed work.
      return false;
  }
}

/**
 * UnifiedEvent → NewProposal (the shadow row), or null if the event isn't governed
 * work. Keyed 1:1 on the event's text id per the mapping doc. Pure — no I/O.
 */
export function eventToProposal(e: UnifiedEvent): NewProposal | null {
  if (!isGovernedWorkEvent(e)) return null;
  const kind = typeof e.metadata?.kind === "string" ? e.metadata.kind : null;
  return {
    id: e.id,
    tenantId: e.tenantId,
    // The event `source` union has no "admin"; only "ai" is a governance actor —
    // everything else collapses to "system". (admin arrives via decision.actor.)
    source: e.source === "ai" ? "ai" : "system",
    kind,
    entityType: e.type,
    title: e.title ?? null,
    body: e.body ?? null,
    payload: (e.metadata ?? null) as Record<string, unknown> | null,
    // auto_approved is a proposal the system already approved (doc mapping).
    status: e.status === "auto_approved" ? "approved" : "pending",
  };
}

/** addEvent hook: shadow a governed-work event as a `proposals` row. */
export async function shadowProposalFromEvent(event: UnifiedEvent): Promise<void> {
  if (!governedWorkDualWriteEnabled()) return;
  const proposal = eventToProposal(event);
  if (!proposal) return;
  await bestEffort(`insertProposal ${event.id}`, async () => {
    await insertProposal(proposal);
  });
}

/**
 * resolveEvent hook: shadow the durable approve/dismiss as a `decisions` row. Fires
 * from the single Redis resolution chokepoint, so it records exactly once per real
 * decision. `status` IS the DecisionAction; `resolvedAt` → decisions.decided_at.
 */
export async function shadowDecisionFromResolve(
  proposalId: string,
  action: DecisionAction,
  actor: string,
): Promise<void> {
  if (!governedWorkDualWriteEnabled()) return;
  await bestEffort(`recordDecision ${proposalId}`, async () => {
    await recordDecision({ proposalId, action, actor });
  });
}

/**
 * Execution hook (start): an approval is about to perform the external write. The
 * Redis `attemptId` (crash-surviving reconciliation marker) is the idempotency key.
 * Returns the shadow attempt id to thread into shadowFinishExecutionAttempt, or null
 * (flag off / unconfigured / shadow error) — the finisher no-ops on null.
 */
export async function shadowStartExecutionAttempt(
  proposalId: string,
  idempotencyKey: string,
): Promise<string | null> {
  if (!governedWorkDualWriteEnabled()) return null;
  let attemptId: string | null = null;
  await bestEffort(`startExecutionAttempt ${proposalId}`, async () => {
    const attempt = await startExecutionAttempt({ proposalId, idempotencyKey });
    attemptId = attempt?.id ?? null;
  });
  return attemptId;
}

/**
 * Execution hook (finish): the external write resolved. `success` gates resolution
 * (write accepted), NOT the read-back — so `verified` stays null here; the separate
 * `change_verify_failed` event carries the read-back gap and is shadowed as its own
 * proposal. Writes both the execution_attempts terminal status and its outcome.
 */
export async function shadowFinishExecutionAttempt(
  attemptId: string | null,
  result: { success: boolean; detail?: string },
): Promise<void> {
  if (!governedWorkDualWriteEnabled() || !attemptId) return;
  await bestEffort(`finishExecutionAttempt ${attemptId}`, async () => {
    await finishExecutionAttempt(attemptId, {
      status: result.success ? "succeeded" : "failed",
    });
    await recordOutcome({
      executionAttemptId: attemptId,
      success: result.success,
      verified: null,
      detail: result.detail ?? null,
    });
  });
}
