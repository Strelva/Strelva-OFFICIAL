/**
 * Governed-work repository (Phase 2a ontology foundation).
 *
 * ADDITIVE + UNUSED. These functions compile and are correct against the domain
 * types + the (unapplied) governed-work migration, but NOTHING on the live path
 * calls them yet. They exist so the #8 cutover can dual-write these tables as a
 * shadow of the Redis event lifecycle; authority stays in Redis until that flip.
 * See docs/ontology-phase2-governed-work.md.
 *
 * Untyped-table handling: src/lib/db/database.types.ts is generated from the
 * APPLIED schema, and this increment leaves the migration UNAPPLIED, so a typed
 * `db.from("proposals")` on the `SupabaseClient<Database>` would not compile — the
 * generated `Database` has no knowledge of these four tables. We therefore reach
 * them through an explicitly-untyped view of the SAME service-role client
 * (`governedWorkDb()`), and re-impose type safety by hand-mapping every row
 * through the domain interfaces below. When database.types.ts is regenerated at
 * the #8 cutover, delete `governedWorkDb()` and the raw-row mappers in favour of
 * typed `Row<"proposals">` / `Insert<"proposals">` access.
 *
 * Error handling mirrors src/lib/db/repositories.ts: best-effort (these are shadow
 * writes / non-authoritative reads — a failure logs and degrades, never throws).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "../db/client";
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

/**
 * The service-role client viewed WITHOUT the generated `Database` schema, so the
 * four not-yet-generated governed-work tables are reachable. Correctness comes
 * from the hand mappers below, not from the compiler here — see the file header.
 */
function governedWorkDb(): SupabaseClient | null {
  return getSupabase() as unknown as SupabaseClient | null;
}

/** Best-effort work: shadow writes + non-authoritative reads. Logs, never throws. */
async function bestEffort<T>(label: string, run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch (err) {
    console.error(`[governed-work] ${label} failed:`, err instanceof Error ? err.message : err);
    return fallback;
  }
}

// ── raw-row shape (snake_case, as the untyped client returns it) ─────────────
// Local to this file: the typed shim is temporary and these disappear when
// database.types.ts is regenerated at the cutover.

type ProposalRow = {
  id: string;
  tenant_id: string;
  source: string;
  kind: string | null;
  entity_type: string;
  title: string | null;
  body: string | null;
  payload: Record<string, unknown> | null;
  status: string;
  created_at: string;
};

type DecisionRow = {
  id: string;
  proposal_id: string;
  action: string;
  actor: string;
  decided_at: string;
};

type ExecutionAttemptRow = {
  id: string;
  proposal_id: string;
  attempt_no: number;
  idempotency_key: string | null;
  status: string;
  provider_receipt: Record<string, unknown> | null;
  started_at: string;
  finished_at: string | null;
};

type OutcomeRow = {
  id: string;
  execution_attempt_id: string;
  success: boolean;
  verified: boolean | null;
  detail: string | null;
  created_at: string;
};

function toProposal(row: ProposalRow): Proposal {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    source: row.source as ProposalSource,
    kind: row.kind,
    entityType: row.entity_type,
    title: row.title,
    body: row.body,
    payload: row.payload,
    status: row.status as ProposalStatus,
    createdAt: row.created_at,
  };
}

function toDecision(row: DecisionRow): Decision {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    action: row.action as DecisionAction,
    actor: row.actor,
    decidedAt: row.decided_at,
  };
}

function toExecutionAttempt(row: ExecutionAttemptRow): ExecutionAttempt {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    attemptNo: row.attempt_no,
    idempotencyKey: row.idempotency_key,
    status: row.status as ExecutionAttemptStatus,
    providerReceipt: row.provider_receipt,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

function toOutcome(row: OutcomeRow): Outcome {
  return {
    id: row.id,
    executionAttemptId: row.execution_attempt_id,
    success: row.success,
    verified: row.verified,
    detail: row.detail,
    createdAt: row.created_at,
  };
}

// ── write/read shapes for the callers the cutover will add ───────────────────

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
  const db = governedWorkDb();
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
        payload: input.payload ?? null,
        status: input.status ?? "pending",
      })
      .select("*")
      .single();
    if (error) throw error;
    return toProposal(data as ProposalRow);
  }, null);
}

export async function getProposal(id: string): Promise<Proposal | null> {
  const db = governedWorkDb();
  if (!db) return null;
  return bestEffort(`getProposal ${id}`, async () => {
    const { data, error } = await db.from("proposals").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? toProposal(data as ProposalRow) : null;
  }, null);
}

// ── decisions ──────────────────────────────────────────────────────────────

export async function recordDecision(input: NewDecision): Promise<Decision | null> {
  const db = governedWorkDb();
  if (!db) return null;
  return bestEffort(`recordDecision ${input.proposalId}`, async () => {
    const { data, error } = await db
      .from("decisions")
      .insert({ proposal_id: input.proposalId, action: input.action, actor: input.actor })
      .select("*")
      .single();
    if (error) throw error;
    return toDecision(data as DecisionRow);
  }, null);
}

// ── execution_attempts ───────────────────────────────────────────────────────

export async function startExecutionAttempt(
  input: NewExecutionAttempt
): Promise<ExecutionAttempt | null> {
  const db = governedWorkDb();
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
    return toExecutionAttempt(data as ExecutionAttemptRow);
  }, null);
}

export async function finishExecutionAttempt(
  id: string,
  input: FinishExecutionAttempt
): Promise<ExecutionAttempt | null> {
  const db = governedWorkDb();
  if (!db) return null;
  return bestEffort(`finishExecutionAttempt ${id}`, async () => {
    const { data, error } = await db
      .from("execution_attempts")
      .update({
        status: input.status,
        provider_receipt: input.providerReceipt ?? null,
        finished_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return toExecutionAttempt(data as ExecutionAttemptRow);
  }, null);
}

// ── outcomes ──────────────────────────────────────────────────────────────────

export async function recordOutcome(input: NewOutcome): Promise<Outcome | null> {
  const db = governedWorkDb();
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
    return toOutcome(data as OutcomeRow);
  }, null);
}
