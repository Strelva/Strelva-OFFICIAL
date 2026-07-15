/**
 * Governed-work repository (Phase 2a foundation → #8 read flip).
 *
 * The write helpers shadow the Redis event lifecycle into the normalized
 * proposals/decisions/execution_attempts/outcomes tables (gated by
 * GOVERNED_WORK_DUAL_WRITE, via shadow.ts). The read helpers reconstruct a
 * `UnifiedEvent` from those tables for the #8 read flip (gated by
 * GOVERNED_WORK_READ_PG, via events.ts). Redis stays authoritative until the
 * authority flip; these reads are non-authoritative and best-effort.
 *
 * database.types.ts was regenerated at the #8 cutover, so these tables are now in
 * the generated `Database` schema — this file uses the TYPED `getSupabase()`
 * client (`db.from("proposals")`) directly; the old untyped `governedWorkDb()`
 * shim + hand-rolled raw-row types are gone. Correctness on the read side comes
 * from the compiler; the row→domain mappers just rename snake_case → camelCase.
 *
 * Error handling mirrors src/lib/db/repositories.ts: best-effort (shadow writes /
 * non-authoritative reads — a failure logs and degrades to []/null, never throws,
 * so a Postgres blip can't 500 the queue).
 */

import { getSupabase, type Insert, type Row } from "../db/client";
import type { UnifiedEvent } from "../types";
import { proposalToEvent } from "./read";
import type {
  Decision,
  DecisionAction,
  ExecutionAttempt,
  ExecutionAttemptStatus,
  Outcome,
  Proposal,
  ProposalSource,
  ProposalStatus,
} from "./types";

/** Best-effort work: shadow writes + non-authoritative reads. Logs, never throws. */
async function bestEffort<T>(label: string, run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch (err) {
    console.error(`[governed-work] ${label} failed:`, err instanceof Error ? err.message : err);
    return fallback;
  }
}

// ── row → domain mappers (rename only; the typed client guarantees the shape) ──

function toProposal(row: Row<"proposals">): Proposal {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    source: row.source as ProposalSource,
    kind: row.kind,
    entityType: row.entity_type,
    title: row.title,
    body: row.body,
    payload: row.payload as Record<string, unknown> | null,
    status: row.status as ProposalStatus,
    createdAt: row.created_at,
  };
}

function toDecision(row: Row<"decisions">): Decision {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    action: row.action as DecisionAction,
    actor: row.actor,
    decidedAt: row.decided_at,
  };
}

function toExecutionAttempt(row: Row<"execution_attempts">): ExecutionAttempt {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    attemptNo: row.attempt_no,
    idempotencyKey: row.idempotency_key,
    status: row.status as ExecutionAttemptStatus,
    providerReceipt: row.provider_receipt as Record<string, unknown> | null,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

function toOutcome(row: Row<"outcomes">): Outcome {
  return {
    id: row.id,
    executionAttemptId: row.execution_attempt_id,
    success: row.success,
    verified: row.verified,
    detail: row.detail,
    createdAt: row.created_at,
  };
}

// ── write shapes for the shadow-write callers ────────────────────────────────

export type NewProposal = {
  id: string;
  tenantId: string;
  source: ProposalSource;
  kind?: string | null;
  entityType: string;
  title?: string | null;
  body?: string | null;
  payload?: Record<string, unknown> | null;
  status?: ProposalStatus;
};

export type NewDecision = {
  proposalId: string;
  action: DecisionAction;
  actor: string;
};

export type NewExecutionAttempt = {
  proposalId: string;
  attemptNo?: number;
  idempotencyKey?: string | null;
};

export type FinishExecutionAttempt = {
  status: Extract<ExecutionAttemptStatus, "succeeded" | "failed">;
  providerReceipt?: Record<string, unknown> | null;
};

export type NewOutcome = {
  executionAttemptId: string;
  success: boolean;
  verified?: boolean | null;
  detail?: string | null;
};

// ── proposals ────────────────────────────────────────────────────────────────

export async function insertProposal(input: NewProposal): Promise<Proposal | null> {
  const db = getSupabase();
  if (!db) return null;
  return bestEffort(`insertProposal ${input.id}`, async () => {
    const { data, error } = await db
      .from("proposals")
      .insert({
        id: input.id,
        tenant_id: input.tenantId,
        source: input.source,
        kind: input.kind ?? null,
        entity_type: input.entityType,
        title: input.title ?? null,
        body: input.body ?? null,
        payload: (input.payload ?? null) as Insert<"proposals">["payload"],
        status: input.status ?? "pending",
      })
      .select("*")
      .single();
    if (error) throw error;
    return toProposal(data);
  }, null);
}

/**
 * Update a proposal's mutable state (status + payload) in place. The change_request
 * workflow (triaged/quoted/shipped/declined) mutates its Redis event AFTER creation
 * — this re-syncs the shadow row so the reconstruction stays faithful (gap #3). A
 * no-op if the row doesn't exist yet (0 rows updated); best-effort → null on error.
 */
export async function updateProposalState(
  id: string,
  input: { status: ProposalStatus; payload?: Record<string, unknown> | null },
): Promise<Proposal | null> {
  const db = getSupabase();
  if (!db) return null;
  return bestEffort(`updateProposalState ${id}`, async () => {
    const { data, error } = await db
      .from("proposals")
      .update({
        status: input.status,
        payload: (input.payload ?? null) as Insert<"proposals">["payload"],
      })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return data ? toProposal(data) : null;
  }, null);
}

export async function getProposal(id: string): Promise<Proposal | null> {
  const db = getSupabase();
  if (!db) return null;
  return bestEffort(`getProposal ${id}`, async () => {
    const { data, error } = await db.from("proposals").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? toProposal(data) : null;
  }, null);
}

// ── decisions ──────────────────────────────────────────────────────────────

export async function recordDecision(input: NewDecision): Promise<Decision | null> {
  const db = getSupabase();
  if (!db) return null;
  return bestEffort(`recordDecision ${input.proposalId}`, async () => {
    const { data, error } = await db
      .from("decisions")
      .insert({ proposal_id: input.proposalId, action: input.action, actor: input.actor })
      .select("*")
      .single();
    if (error) throw error;
    return toDecision(data);
  }, null);
}

// ── execution_attempts ───────────────────────────────────────────────────────

export async function startExecutionAttempt(
  input: NewExecutionAttempt
): Promise<ExecutionAttempt | null> {
  const db = getSupabase();
  if (!db) return null;
  return bestEffort(`startExecutionAttempt ${input.proposalId}`, async () => {
    const { data, error } = await db
      .from("execution_attempts")
      .insert({
        proposal_id: input.proposalId,
        attempt_no: input.attemptNo ?? 1,
        idempotency_key: input.idempotencyKey ?? null,
        status: "running",
      })
      .select("*")
      .single();
    if (error) throw error;
    return toExecutionAttempt(data);
  }, null);
}

export async function finishExecutionAttempt(
  id: string,
  input: FinishExecutionAttempt
): Promise<ExecutionAttempt | null> {
  const db = getSupabase();
  if (!db) return null;
  return bestEffort(`finishExecutionAttempt ${id}`, async () => {
    const { data, error } = await db
      .from("execution_attempts")
      .update({
        status: input.status,
        provider_receipt: (input.providerReceipt ?? null) as Insert<"execution_attempts">["provider_receipt"],
        finished_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return toExecutionAttempt(data);
  }, null);
}

// ── outcomes ──────────────────────────────────────────────────────────────────

export async function recordOutcome(input: NewOutcome): Promise<Outcome | null> {
  const db = getSupabase();
  if (!db) return null;
  return bestEffort(`recordOutcome ${input.executionAttemptId}`, async () => {
    const { data, error } = await db
      .from("outcomes")
      .insert({
        execution_attempt_id: input.executionAttemptId,
        success: input.success,
        verified: input.verified ?? null,
        detail: input.detail ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return toOutcome(data);
  }, null);
}

// ── governed-event READS (#8 flip; gated by GOVERNED_WORK_READ_PG in events.ts) ─

/**
 * Pick the latest row per key from rows PRE-ORDERED newest-first: the first row
 * seen for a key wins. Used to stitch each proposal's latest decision / attempt,
 * and each attempt's latest outcome, from one batched query each (no N+1).
 */
function latestByKey<T>(rows: T[], key: (row: T) => string): Map<string, T> {
  const out = new Map<string, T>();
  for (const row of rows) {
    const k = key(row);
    if (!out.has(k)) out.set(k, row);
  }
  return out;
}

/**
 * Reconstruct a tenant's governed events from Postgres, newest-first, as
 * `UnifiedEvent`s. `status` filters on the RECONSTRUCTED event status (which
 * requires the decision join — the proposal row's own status is not the event
 * status once decided), so it is applied after reconstruction, mirroring how
 * getEvents status-filters Redis values. Best-effort: any read error → [].
 */
export async function listGovernedEventsForTenant(
  tenantId: string,
  opts?: { status?: string; limit?: number },
): Promise<UnifiedEvent[]> {
  const db = getSupabase();
  if (!db) return [];
  const limit = opts?.limit ?? 50;
  return bestEffort(`listGovernedEventsForTenant ${tenantId}`, async () => {
    // Over-fetch (like the Redis limit*2 window) so a status filter still has
    // enough reconstructed rows to fill `limit`.
    const window = Math.max(limit * 2, limit);
    const { data: proposalRows, error } = await db
      .from("proposals")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(window);
    if (error) throw error;
    const proposals = proposalRows ?? [];
    if (proposals.length === 0) return [];

    const proposalIds = proposals.map((p) => p.id);

    const { data: decisionRows, error: dErr } = await db
      .from("decisions")
      .select("*")
      .in("proposal_id", proposalIds)
      .order("decided_at", { ascending: false });
    if (dErr) throw dErr;
    const decisionByProposal = latestByKey(decisionRows ?? [], (d) => d.proposal_id);

    const { data: attemptRows, error: aErr } = await db
      .from("execution_attempts")
      .select("*")
      .in("proposal_id", proposalIds)
      .order("started_at", { ascending: false });
    if (aErr) throw aErr;
    const attemptByProposal = latestByKey(attemptRows ?? [], (a) => a.proposal_id);

    const attemptIds = [...attemptByProposal.values()].map((a) => a.id);
    let outcomeByAttempt = new Map<string, Row<"outcomes">>();
    if (attemptIds.length) {
      const { data: outcomeRows, error: oErr } = await db
        .from("outcomes")
        .select("*")
        .in("execution_attempt_id", attemptIds)
        .order("created_at", { ascending: false });
      if (oErr) throw oErr;
      outcomeByAttempt = latestByKey(outcomeRows ?? [], (o) => o.execution_attempt_id);
    }

    const events: UnifiedEvent[] = [];
    for (const row of proposals) {
      const decisionRow = decisionByProposal.get(row.id) ?? null;
      const attemptRow = attemptByProposal.get(row.id) ?? null;
      const outcomeRow = attemptRow ? outcomeByAttempt.get(attemptRow.id) ?? null : null;
      const event = proposalToEvent(
        toProposal(row),
        decisionRow ? toDecision(decisionRow) : null,
        attemptRow ? toExecutionAttempt(attemptRow) : null,
        outcomeRow ? toOutcome(outcomeRow) : null,
      );
      if (!opts?.status || event.status === opts.status) {
        events.push(event);
        if (events.length >= limit) break;
      }
    }
    return events;
  }, []);
}

/** Reconstruct one governed event by id from Postgres. Best-effort → null. */
export async function getGovernedEventById(id: string): Promise<UnifiedEvent | null> {
  const db = getSupabase();
  if (!db) return null;
  return bestEffort(`getGovernedEventById ${id}`, async () => {
    const { data: proposalRow, error } = await db
      .from("proposals")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!proposalRow) return null;

    const { data: decisionRow, error: dErr } = await db
      .from("decisions")
      .select("*")
      .eq("proposal_id", id)
      .order("decided_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (dErr) throw dErr;

    const { data: attemptRow, error: aErr } = await db
      .from("execution_attempts")
      .select("*")
      .eq("proposal_id", id)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (aErr) throw aErr;

    let outcomeRow: Row<"outcomes"> | null = null;
    if (attemptRow) {
      const { data, error: oErr } = await db
        .from("outcomes")
        .select("*")
        .eq("execution_attempt_id", attemptRow.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (oErr) throw oErr;
      outcomeRow = data;
    }

    return proposalToEvent(
      toProposal(proposalRow),
      decisionRow ? toDecision(decisionRow) : null,
      attemptRow ? toExecutionAttempt(attemptRow) : null,
      outcomeRow ? toOutcome(outcomeRow) : null,
    );
  }, null);
}
