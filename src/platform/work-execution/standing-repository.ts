import { z } from "zod";
import { getSupabase } from "@/lib/db/client";
import {
  WorkspaceAccessError,
  WorkspaceConflictError,
  WorkspaceStoreError,
  type WorkspaceActor,
} from "@/platform/workspaces/types";
import { assertCanSaveWork, assertWorkspaceMember } from "@/platform/workspaces/repository";
import {
  standingResponsibilitySchema,
  type StandingAdmissionInput,
  type StandingResponsibility,
  type StandingTrigger,
} from "./standing";

type DbRow = Record<string, unknown>;
type DbFailure = { message?: unknown; code?: unknown } | null;

export type StandingJobStatus = "accepted" | "cancelled";
export type StandingRunStatus = "admitted" | "running" | "waiting" | "needs_attention" | "completed" | "failed" | "cancelled";

export interface StandingJob {
  id: string;
  standingResponsibilityId: string;
  finiteWorkId: string;
  triggerKey: string;
  policyVersion: number;
  status: StandingJobStatus;
  acceptedAt: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StandingRun {
  id: string;
  standingResponsibilityId: string;
  jobId: string;
  finiteWorkId: string;
  triggerKey: string;
  policyVersion: number;
  status: StandingRunStatus;
  attempt: number;
  wakeAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string;
}

export interface StandingRunReceipt {
  id: string;
  runId: string;
  stepId: string;
  attempt: number;
  status: string;
  effect: "none" | "accepted" | "unknown";
  result?: unknown;
  reason?: string;
  finishedAt?: string;
  createdAt: string;
}

export interface StandingResponsibilityRecord {
  id: string;
  workspaceId: string;
  policy: StandingResponsibility;
}

export interface StandingRunsRecord {
  policy: StandingResponsibilityRecord;
  jobs: StandingJob[];
  runs: Array<StandingRun & { receipts: StandingRunReceipt[] }>;
}

export interface StandingAdmission {
  policy: StandingResponsibilityRecord;
  job: StandingJob;
  run: StandingRun;
  replayed: boolean;
}

interface QueryResult {
  data?: unknown;
  error?: DbFailure;
}

interface Query {
  select(columns?: string): Query;
  eq(column: string, value: unknown): Query;
  in(column: string, values: unknown[]): Query;
  order(column: string, options?: { ascending?: boolean }): Query;
  insert(value: DbRow): Query;
  update(value: DbRow): Query;
  limit(value: number): Query;
  maybeSingle(): Promise<QueryResult & { data: DbRow | null }>;
  single(): Promise<QueryResult & { data: DbRow | null }>;
  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
}

interface StandingDb {
  from(table: string): Query;
  rpc(name: string, args: Record<string, unknown>): Promise<QueryResult>;
}

function db(): StandingDb {
  const client = getSupabase();
  if (!client) throw new WorkspaceStoreError("Ongoing work storage is unavailable.");
  return client as unknown as StandingDb;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function integer(value: unknown, field: string): number {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  throw new WorkspaceStoreError(`Ongoing work storage returned an invalid ${field}.`);
}

function databaseError(error: DbFailure, fallback: string): never {
  const detail = `${text(error?.code)} ${text(error?.message)}`;
  if (detail.includes("standing_workspace_denied") || detail.includes("standing_identity_denied")) throw new WorkspaceAccessError();
  if (detail.includes("standing_not_found")) throw new WorkspaceAccessError();
  if (detail.includes("standing_revision_conflict") || detail.includes("standing_version_conflict")
    || detail.includes("standing_trigger_conflict") || detail.includes("standing_admission_blocked")
    || detail.includes("standing_limit_reached") || detail.includes("standing_payload_invalid")
    || detail.includes("standing_trigger_invalid") || detail.includes("standing_scope_conflict")
    || detail.includes("standing_scope_invalid") || detail.includes("standing_scope_workspace_invalid")
    || detail.includes("standing_admission_budget_required") || detail.includes("standing_run_invalid")
    || detail.includes("standing_receipt_invalid") || detail.includes("standing_revoked")
    || detail.includes("standing_job_invalid") || detail.includes("standing_run_invalid_transition")
    || detail.includes("standing_execution_blocked")) {
    throw new WorkspaceConflictError(text(error?.message) || fallback);
  }
  throw new WorkspaceStoreError(fallback);
}

async function assertStandingAuthority(actor: WorkspaceActor, workspaceId: string): Promise<void> {
  const result = await db().from("workspace_memberships")
    .select("role").eq("workspace_id", workspaceId).eq("user_id", actor.userId).maybeSingle();
  if (result.error) databaseError(result.error, "Workspace membership is unavailable.");
  const role = result.data ? text(result.data.role) : "";
  if (role !== "owner" && role !== "admin") throw new WorkspaceAccessError();
}

function mapPolicy(row: DbRow): StandingResponsibilityRecord {
  const payload = row.payload;
  if (!payload || typeof payload !== "object") throw new WorkspaceStoreError("The ongoing responsibility policy is invalid.");
  const parsed = standingResponsibilitySchema.parse(payload);
  const cursor = optionalText(row.next_trigger_at);
  const policy = cursor && parsed.trigger.kind === "interval"
    ? { ...parsed, trigger: { ...parsed.trigger, nextAt: cursor } }
    : parsed;
  return {
    id: text(row.id),
    workspaceId: text(row.workspace_id),
    policy: standingResponsibilitySchema.parse(policy),
  };
}

function mapJob(row: DbRow): StandingJob {
  const status = text(row.status);
  if (status !== "accepted" && status !== "cancelled") throw new WorkspaceStoreError("The accepted job record is invalid.");
  return {
    id: text(row.id),
    standingResponsibilityId: text(row.standing_responsibility_id),
    finiteWorkId: text(row.finite_work_id),
    triggerKey: text(row.trigger_key),
    policyVersion: integer(row.policy_version, "policy version"),
    status,
    acceptedAt: text(row.accepted_at),
    ...(optionalText(row.cancelled_at) ? { cancelledAt: optionalText(row.cancelled_at) } : {}),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

function mapRun(row: DbRow): StandingRun {
  const status = text(row.status);
  if (!["admitted", "running", "waiting", "needs_attention", "completed", "failed", "cancelled"].includes(status)) {
    throw new WorkspaceStoreError("The ongoing run record is invalid.");
  }
  return {
    id: text(row.id),
    standingResponsibilityId: text(row.standing_responsibility_id),
    jobId: text(row.job_id),
    finiteWorkId: text(row.finite_work_id),
    triggerKey: text(row.trigger_key),
    policyVersion: integer(row.policy_version, "run policy version"),
    status: status as StandingRunStatus,
    attempt: integer(row.attempt, "run attempt"),
    ...(optionalText(row.wake_at) ? { wakeAt: optionalText(row.wake_at) } : {}),
    ...(optionalText(row.last_error) ? { lastError: optionalText(row.last_error) } : {}),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    ...(optionalText(row.cancelled_at) ? { cancelledAt: optionalText(row.cancelled_at) } : {}),
  };
}

function mapReceipt(row: DbRow): StandingRunReceipt {
  const effect = text(row.effect);
  if (effect !== "none" && effect !== "accepted" && effect !== "unknown") throw new WorkspaceStoreError("The ongoing run receipt is invalid.");
  return {
    id: text(row.id),
    runId: text(row.run_id),
    stepId: text(row.step_id),
    attempt: integer(row.attempt, "receipt attempt"),
    status: text(row.status),
    effect,
    ...(row.result !== null && row.result !== undefined ? { result: row.result } : {}),
    ...(optionalText(row.reason) ? { reason: optionalText(row.reason) } : {}),
    ...(optionalText(row.finished_at) ? { finishedAt: optionalText(row.finished_at) } : {}),
    createdAt: text(row.created_at),
  };
}

function triggerNextAt(trigger: StandingTrigger): string | undefined {
  return trigger.kind === "interval" ? trigger.nextAt : undefined;
}

export async function createStandingResponsibility(
  actor: WorkspaceActor,
  workspaceId: string,
  policy: StandingResponsibility,
): Promise<StandingResponsibilityRecord> {
  await assertCanSaveWork(actor, workspaceId);
  await assertStandingAuthority(actor, workspaceId);
  if (policy.ownerId !== actor.userId) throw new WorkspaceAccessError();
  const result = await db().from("standing_responsibilities").insert({
    workspace_id: workspaceId,
    owner_id: actor.userId,
    version: policy.version,
    revision: policy.revision,
    status: policy.status,
    payload: policy,
    next_trigger_at: triggerNextAt(policy.trigger) ?? null,
  }).select("*").single();
  if (result.error || !result.data) {
    if (result.error) databaseError(result.error, "The ongoing responsibility could not be saved.");
    throw new WorkspaceStoreError("The ongoing responsibility could not be saved.");
  }
  return mapPolicy(result.data);
}

export async function readStandingResponsibility(actor: WorkspaceActor, standingId: string): Promise<StandingResponsibilityRecord> {
  const id = z.string().uuid().parse(standingId);
  const result = await db().from("standing_responsibilities").select("*").eq("id", id).maybeSingle();
  if (result.error) databaseError(result.error, "The ongoing responsibility could not be opened.");
  if (!result.data) throw new WorkspaceAccessError();
  const policy = mapPolicy(result.data);
  await assertWorkspaceMember(actor, policy.workspaceId);
  return policy;
}

export async function listStandingResponsibilities(actor: WorkspaceActor, workspaceId: string): Promise<StandingResponsibilityRecord[]> {
  await assertWorkspaceMember(actor, workspaceId);
  const result = await db().from("standing_responsibilities").select("*")
    .eq("workspace_id", workspaceId).order("updated_at", { ascending: false }).limit(50);
  if (result.error) databaseError(result.error, "The ongoing responsibilities could not be loaded.");
  return (Array.isArray(result.data) ? result.data : []).map((row) => mapPolicy(row as DbRow));
}

/** Generic finite runners use this guard before their native effect. A finite
 * work row that was admitted by standing policy stays ordinary and readable,
 * but its native action is gated by the current policy version. */
export async function assertStandingExecutionAllowed(
  actor: WorkspaceActor,
  workspaceId: string,
  finiteWorkId: string,
): Promise<void> {
  const linked = await db().from("standing_responsibility_jobs")
    .select("standing_responsibility_id,workspace_id,policy_version,status")
    .eq("finite_work_id", finiteWorkId).maybeSingle();
  if (linked.error) databaseError(linked.error, "The ongoing work link could not be checked.");
  if (!linked.data) return;
  if (text(linked.data.workspace_id) !== workspaceId) throw new WorkspaceAccessError();
  if (text(linked.data.status) !== "accepted") {
    throw new WorkspaceConflictError("This accepted job has been cancelled.");
  }
  const policy = await db().from("standing_responsibilities")
    .select("owner_id,status,version").eq("id", text(linked.data.standing_responsibility_id)).maybeSingle();
  if (policy.error) databaseError(policy.error, "The ongoing work policy could not be checked.");
  if (!policy.data || text(policy.data.owner_id) !== actor.userId) throw new WorkspaceAccessError();
  if (text(policy.data.status) !== "active" || integer(policy.data.version, "policy version") !== integer(linked.data.policy_version, "policy version")) {
    throw new WorkspaceConflictError("This ongoing responsibility is paused, revoked, or has a newer approved version.");
  }
}

export async function persistStandingResponsibility(
  actor: WorkspaceActor,
  standingId: string,
  workspaceId: string,
  expectedRevision: number,
  policy: StandingResponsibility,
): Promise<StandingResponsibilityRecord> {
  const result = await db().rpc("update_standing_responsibility", {
    p_standing_id: standingId,
    p_workspace_id: workspaceId,
    p_user_id: actor.userId,
    p_verified_email: actor.verifiedEmail,
    p_expected_revision: expectedRevision,
    p_payload: policy,
  });
  if (result.error) databaseError(result.error, "The ongoing responsibility could not be confirmed.");
  const row = Array.isArray(result.data) ? result.data[0] : null;
  if (!row || typeof row !== "object") throw new WorkspaceStoreError("The ongoing responsibility checkpoint was not returned.");
  return mapPolicy(row as DbRow);
}

export async function admitStandingResponsibility(
  actor: WorkspaceActor,
  input: StandingAdmissionInput,
  policy: StandingResponsibilityRecord,
  finitePayload: Record<string, unknown>,
): Promise<StandingAdmission> {
  const parsed = z.object({
    standingResponsibilityId: z.string().uuid(),
    triggerKey: z.string().trim().min(1).max(256),
    expectedVersion: z.number().int().positive().optional(),
    nextAt: z.string().datetime().optional(),
  }).strict().parse(input);
  const result = await db().rpc("admit_standing_responsibility", {
    p_standing_id: parsed.standingResponsibilityId,
    p_workspace_id: policy.workspaceId,
    p_user_id: actor.userId,
    p_verified_email: actor.verifiedEmail,
    p_expected_version: parsed.expectedVersion ?? policy.policy.version,
    p_trigger_key: parsed.triggerKey,
    p_payload: finitePayload,
    p_next_trigger_at: parsed.nextAt ?? null,
  });
  if (result.error) databaseError(result.error, "The ongoing job could not be admitted.");
  const row = Array.isArray(result.data) ? result.data[0] : null;
  if (!row || typeof row !== "object") throw new WorkspaceStoreError("The admitted job was not returned.");
  const value = row as DbRow;
  if (!value.job || !value.run) throw new WorkspaceStoreError("The admitted job record is incomplete.");
  const record = await readStandingResponsibility(actor, policy.id);
  return {
    policy: record,
    job: mapJob(value.job as DbRow),
    run: mapRun(value.run as DbRow),
    replayed: value.replayed === true,
  };
}

export async function readStandingRuns(actor: WorkspaceActor, standingId: string): Promise<StandingRunsRecord> {
  const policy = await readStandingResponsibility(actor, standingId);
  const client = db();
  const [jobsResult, runsResult] = await Promise.all([
    client.from("standing_responsibility_jobs").select("*").eq("standing_responsibility_id", policy.id).order("created_at", { ascending: false }),
    client.from("standing_responsibility_runs").select("*").eq("standing_responsibility_id", policy.id).order("created_at", { ascending: false }),
  ]);
  if (jobsResult.error) databaseError(jobsResult.error, "The accepted jobs could not be loaded.");
  if (runsResult.error) databaseError(runsResult.error, "The ongoing runs could not be loaded.");
  const jobs = (Array.isArray(jobsResult.data) ? jobsResult.data : []).map((row) => mapJob(row as DbRow));
  const runs = (Array.isArray(runsResult.data) ? runsResult.data : []).map((row) => mapRun(row as DbRow));
  const receiptsResult = runs.length
    ? await client.from("standing_responsibility_receipts").select("*").in("run_id", runs.map((run) => run.id)).order("created_at", { ascending: true })
    : { data: [], error: null };
  if (receiptsResult.error) databaseError(receiptsResult.error, "The run receipts could not be loaded.");
  const receipts = (Array.isArray(receiptsResult.data) ? receiptsResult.data : []).map((row) => mapReceipt(row as DbRow));
  return {
    policy,
    jobs,
    runs: runs.map((run) => ({ ...run, receipts: receipts.filter((receipt) => receipt.runId === run.id) })),
  };
}

/** Read an already accepted trigger so replay stays idempotent after its
 * policy is paused or revoked. New admissions still pass through the SQL
 * policy/version checks. */
export async function readStandingRunForTrigger(
  actor: WorkspaceActor,
  standingId: string,
  triggerKey: string,
): Promise<{ job: StandingJob; run: StandingRun } | null> {
  const policy = await readStandingResponsibility(actor, standingId);
  const jobResult = await db().from("standing_responsibility_jobs").select("*")
    .eq("standing_responsibility_id", policy.id).eq("trigger_key", triggerKey).maybeSingle();
  if (jobResult.error) databaseError(jobResult.error, "The accepted job could not be checked.");
  if (!jobResult.data) return null;
  const job = mapJob(jobResult.data);
  const runResult = await db().from("standing_responsibility_runs").select("*").eq("job_id", job.id).maybeSingle();
  if (runResult.error) databaseError(runResult.error, "The ongoing run could not be checked.");
  if (!runResult.data) throw new WorkspaceStoreError("The accepted job has no ongoing run.");
  return { job, run: mapRun(runResult.data) };
}

export async function readStandingRun(actor: WorkspaceActor, runId: string): Promise<{ run: StandingRun; policy: StandingResponsibilityRecord }> {
  const id = z.string().uuid().parse(runId);
  const result = await db().from("standing_responsibility_runs").select("*").eq("id", id).maybeSingle();
  if (result.error) databaseError(result.error, "The ongoing run could not be opened.");
  if (!result.data) throw new WorkspaceAccessError();
  const run = mapRun(result.data);
  const policy = await readStandingResponsibility(actor, run.standingResponsibilityId);
  return { run, policy };
}

export interface RecordStandingRunInput {
  runId: string;
  status: StandingRunStatus;
  attempt: number;
  wakeAt?: string;
  lastError?: string;
  cancelledAt?: string;
  receipts: Array<{
    stepId: string;
    attempt: number;
    status: string;
    effect: "none" | "accepted" | "unknown";
    result?: unknown;
    reason?: string;
    finishedAt?: string;
  }>;
}

export async function recordStandingRun(actor: WorkspaceActor, input: RecordStandingRunInput): Promise<StandingRun> {
  const result = await db().rpc("record_standing_responsibility_run", {
    p_run_id: input.runId,
    p_user_id: actor.userId,
    p_verified_email: actor.verifiedEmail,
    p_status: input.status,
    p_attempt: input.attempt,
    p_wake_at: input.wakeAt ?? null,
    p_last_error: input.lastError ?? null,
    p_cancelled_at: input.cancelledAt ?? null,
    p_receipts: input.receipts,
  });
  if (result.error) databaseError(result.error, "The ongoing run receipt could not be confirmed.");
  const row = Array.isArray(result.data) ? result.data[0] : null;
  if (!row || typeof row !== "object") throw new WorkspaceStoreError("The ongoing run checkpoint was not returned.");
  return mapRun(row as DbRow);
}

export const __private = { mapPolicy, mapJob, mapRun, mapReceipt, triggerNextAt };

/** Resolve a finite job only inside the workspace its caller already opened. */
export async function readStandingRunForWork(actor: WorkspaceActor, workspaceId: string, finiteWorkId: string): Promise<StandingRun | null> {
  await assertWorkspaceMember(actor, workspaceId);
  const result = await db().from("standing_responsibility_runs").select("*")
    .eq("workspace_id", workspaceId).eq("finite_work_id", finiteWorkId).maybeSingle();
  if (result.error) databaseError(result.error, "The ongoing run could not be checked.");
  return result.data ? mapRun(result.data) : null;
}
