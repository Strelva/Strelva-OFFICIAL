/**
 * Governed-work REVERSE map (Phase 2b ontology increment #8 — the READ flip).
 *
 * The inverse of `eventToProposal` in shadow.ts: given a normalized
 * `proposals` row (+ its latest `decisions` / `execution_attempts` / `outcomes`
 * rows) reconstruct the `UnifiedEvent` the Redis path would have served for the
 * same governed item. The output must be INDISTINGUISHABLE to the dashboard UI
 * and `event-actions.ts` from the Redis event — so a governed queue read can be
 * flag-flipped onto Postgres with zero visible change.
 *
 * Pure — no I/O. The repository fns (repository.ts) fetch + stitch the rows and
 * call this; events.ts flag-gates whether the reconstructed event is used.
 *
 * Field mapping (reverse of shadow.ts `eventToProposal`, which stored
 * `payload = event.metadata` at ADD time — i.e. before any execution/decision
 * metadata was stamped):
 *   id         ← proposal.id
 *   tenantId   ← proposal.tenantId
 *   source     ← proposal.source            (LOSSY forward: website/google/… collapsed
 *                                            to ai|system, so only ai round-trips)
 *   type       ← proposal.entityType
 *   title/body ← proposal.title/body
 *   metadata   ← proposal.payload           (the original event.metadata) with the
 *                                            execution + resolutionHistory folded back on
 *   createdAt  ← proposal.createdAt
 *   status     ← decision ? decision.action : (approved→auto_approved | pending)
 *   resolvedAt ← decision.decidedAt (only when decided)
 */

import type { UnifiedEvent } from "../types";
import type { Decision, ExecutionAttempt, Outcome, Proposal } from "./types";

/**
 * Governed-work SCOPE test — the status-INDEPENDENT twin of shadow.ts
 * `isGovernedWorkEvent`. That one gates on `pending`/`auto_approved` because it
 * decides what to shadow-WRITE as a fresh proposal; the read flip must instead
 * recognize a governed item at ANY status (a resolved approved/dismissed event is
 * still a governed item to hydrate from Postgres), so the status gate is dropped
 * here. Same type/kind surface otherwise.
 */
export function isGovernedScopeEvent(e: UnifiedEvent): boolean {
  switch (e.type) {
    case "content_update":
    case "newsletter_draft":
    case "change_request":
    case "suggestion":
      return true;
    case "review":
      return e.metadata?.kind === "review_reply_draft";
    default:
      return false;
  }
}

/** attempt.status (running|succeeded|failed) → the Redis execution `state`. */
function executionState(
  status: ExecutionAttempt["status"],
): "processing" | "completed" | "failed" {
  switch (status) {
    case "succeeded":
      return "completed";
    case "failed":
      return "failed";
    default:
      return "processing";
  }
}

/**
 * Reconstruct the `UnifiedEvent` for a governed item from its normalized rows.
 * `decision`/`attempt`/`outcome` are the LATEST row of each for the proposal (or
 * null when none exists yet).
 */
export function proposalToEvent(
  proposal: Proposal,
  decision: Decision | null,
  attempt: ExecutionAttempt | null,
  outcome: Outcome | null,
): UnifiedEvent {
  // status + resolvedAt. A decision means the pending→resolved transition fired,
  // so its action IS the event status and its timestamp IS resolvedAt. Absent a
  // decision the proposal's own status carries it: `approved` is a system
  // auto_approval (never decided), `dismissed` stays dismissed, else pending.
  let status: UnifiedEvent["status"];
  let resolvedAt: string | undefined;
  if (decision) {
    status = decision.action; // "approved" | "dismissed"
    resolvedAt = decision.decidedAt;
  } else if (proposal.status === "approved") {
    status = "auto_approved";
  } else if (proposal.status === "dismissed") {
    status = "dismissed";
  } else {
    status = "pending";
  }

  // metadata = the original payload with the later-stamped execution +
  // resolutionHistory folded back in. Kept undefined only when there is nothing
  // to carry (no payload, no decision, no attempt) so an event that had no
  // metadata round-trips to `undefined`, not `{}`.
  const payload = (proposal.payload ?? null) as Record<string, unknown> | null;
  const hasExtras = Boolean(decision || attempt);
  let metadata: UnifiedEvent["metadata"];
  if (payload || hasExtras) {
    const meta: Record<string, unknown> = payload ? { ...payload } : {};

    if (decision) {
      // resolveEvent appended exactly one { status, actor, resolvedAt } entry on
      // the single pending→resolved transition; the decision row is its 1:1 twin.
      meta.resolutionHistory = [
        { status: decision.action, actor: decision.actor, resolvedAt: decision.decidedAt },
      ];
    }

    if (attempt) {
      // Fold the attempt + outcome back into the execution marker the resolve
      // path wrote. attemptId is the idempotency key (the crash-surviving
      // reconciliation marker); reason comes from the outcome detail. success /
      // verified are NOT separate execution fields on UnifiedEvent — the accepted
      // vs read-back split lives in the state + the separate change_verify_failed
      // event, so they are not re-synthesized here.
      meta.execution = {
        state: executionState(attempt.status),
        action: decision?.action ?? "approved",
        actor: decision?.actor ?? "system",
        attemptId: attempt.idempotencyKey ?? attempt.id,
        startedAt: attempt.startedAt,
        ...(attempt.finishedAt ? { finishedAt: attempt.finishedAt } : {}),
        ...(outcome?.detail ? { reason: outcome.detail } : {}),
      };
    }

    metadata = meta as UnifiedEvent["metadata"];
  }

  return {
    id: proposal.id,
    tenantId: proposal.tenantId,
    // forward collapsed the source union to ai|admin|system; cast back (only "ai"
    // is a genuine round-trip, the rest read as system).
    source: proposal.source as UnifiedEvent["source"],
    type: proposal.entityType as UnifiedEvent["type"],
    title: proposal.title ?? "",
    body: proposal.body ?? "",
    status,
    ...(metadata !== undefined ? { metadata } : {}),
    createdAt: proposal.createdAt,
    ...(resolvedAt ? { resolvedAt } : {}),
  };
}
