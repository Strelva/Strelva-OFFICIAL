import type { BudgetExecution } from "./runtime";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/db/client";
import {
  JOB_ECONOMICS_POLICY,
  JobEconomicsAccessError,
  JobEconomicsConflictError,
  JobEconomicsNotFoundError,
  JobEconomicsPersistenceError,
  JobEconomicsPayerError,
  JobEconomicsTargetError,
  JobEconomicsValidationError,
  type JobEconomicsCommand,
  type JobEconomicsInspection,
  type JobEconomicsReservation,
  type JobEconomicsRecord,
  type JobEconomicsUsage,
} from "./types";
import { WORKSPACE_EXIT_STOPPED_MESSAGE } from "@/platform/workspaces/types";

type DbRow = Record<string, unknown>;
type DbTable = { Row: DbRow; Insert: DbRow; Update: DbRow; Relationships: [] };

type WorkEconomicsDatabase = {
  public: {
    Tables: {
      job_economics: DbTable;
      job_economics_usage: DbTable;
      job_economics_reservations: DbTable;
      job_economics_executions: DbTable;
    };
    Views: Record<string, never>;
    Functions: {
      job_economics_command: {
        Args: { p_command: unknown; p_actor_id: string; p_verified_email: string };
        Returns: DbRow[];
      };
      job_economics_create_with_payer_transition: {
        Args: { p_command: unknown; p_actor_id: string; p_verified_email: string };
        Returns: DbRow[];
      };
      job_economics_command_with_payer_authority: {
        Args: { p_command: unknown; p_actor_id: string; p_verified_email: string };
        Returns: DbRow[];
      };
      get_job_economics: {
        Args: { p_job_id: string; p_actor_id: string; p_verified_email: string };
        Returns: DbRow[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type WorkEconomicsDb = SupabaseClient<WorkEconomicsDatabase>;

function db(): WorkEconomicsDb {
  const client = getSupabase();
  if (!client) throw new JobEconomicsPersistenceError("Work economics storage is not configured.");
  return client as unknown as WorkEconomicsDb;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function intValue(value: unknown, field: string): number {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  throw new JobEconomicsPersistenceError(`Work economics storage returned an invalid ${field}.`);
}

function nullableInt(value: unknown, field: string): number | null {
  if (value === null) return null;
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  throw new JobEconomicsPersistenceError(`Work economics storage returned an invalid ${field}.`);
}

function booleanValue(value: unknown, field: string): boolean {
  if (typeof value === "boolean") return value;
  throw new JobEconomicsPersistenceError(`Work economics storage returned an invalid ${field}.`);
}

function mapJob(row: DbRow): JobEconomicsRecord {
  return {
    id: stringValue(row.id),
    workspaceId: nullableString(row.workspace_id),
    workId: nullableString(row.work_id),
    productId: stringValue(row.product_id) as JobEconomicsRecord["productId"],
    resourceKind: stringValue(row.resource_kind) as JobEconomicsRecord["resourceKind"],
    tenantId: nullableString(row.tenant_id),
    businessId: nullableString(row.business_id),
    requestId: nullableString(row.request_id),
    capabilityId: nullableString(row.capability_id),
    payerId: stringValue(row.payer_id),
    currency: stringValue(row.currency) as JobEconomicsRecord["currency"],
    estimateCents: nullableInt(row.estimate_cents, "estimate"),
    maxAuthorizedCents: intValue(row.max_authorized_cents, "maximum"),
    reservedCents: intValue(row.reserved_cents, "reservation"),
    usedCents: intValue(row.used_cents, "usage"),
    strelvaRetryCents: intValue(row.strelva_retry_cents, "Strelva retry usage"),
    actualCents: nullableInt(row.actual_cents, "actual"),
    actualKnown: booleanValue(row.actual_known, "actual-known marker"),
    status: stringValue(row.status) as JobEconomicsRecord["status"],
    createdBy: stringValue(row.created_by),
    acceptedBy: nullableString(row.accepted_by),
    acceptedAt: nullableString(row.accepted_at),
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at),
  };
}

function mapUsage(row: DbRow): JobEconomicsUsage {
  const amountCents = nullableInt(row.amount_cents, "usage amount");
  return {
    id: stringValue(row.id),
    jobId: stringValue(row.job_id),
    idempotencyKey: stringValue(row.idempotency_key),
    kind: stringValue(row.kind) as JobEconomicsUsage["kind"],
    attribution: stringValue(row.attribution) as JobEconomicsUsage["attribution"],
    amountCents,
    known: amountCents !== null,
    source: row.source === "runtime_reported" ? "runtime_reported" : "operator_reported",
    recordedBy: stringValue(row.recorded_by),
    createdAt: stringValue(row.created_at),
  };
}

function mapReservation(row: DbRow): JobEconomicsReservation {
  return {
    id: stringValue(row.id),
    jobId: stringValue(row.job_id),
    idempotencyKey: stringValue(row.idempotency_key),
    amountCents: intValue(row.amount_cents, "reservation amount"),
    createdBy: stringValue(row.created_by),
    createdAt: stringValue(row.created_at),
  };
}

export function mapBudgetExecution(value: unknown): BudgetExecution {
  if (!value || typeof value !== "object") throw new JobEconomicsPersistenceError("The execution receipt is missing.");
  const row = value as Record<string, unknown>;
  if (typeof row.job_id !== "string" || typeof row.execution_key !== "string"
    || typeof row.maximum_cents !== "number" || typeof row.created_by !== "string"
    || !["reserved", "running", "finished"].includes(String(row.status))
    || (row.amount_cents !== null && typeof row.amount_cents !== "number")
    || (row.billable_cents !== null && typeof row.billable_cents !== "number")) {
    throw new JobEconomicsPersistenceError("The execution receipt is invalid.");
  }
  return {
    jobId: row.job_id, executionKey: row.execution_key, maximumCents: row.maximum_cents,
    kind: row.kind as BudgetExecution["kind"], attribution: row.attribution as BudgetExecution["attribution"],
    status: row.status as BudgetExecution["status"], effect: row.effect as BudgetExecution["effect"],
    amountCents: row.amount_cents as number | null, billableCents: row.billable_cents as number | null,
    createdBy: row.created_by,
    reconciliationReference: typeof row.reconciliation_reference === "string" ? row.reconciliation_reference : null,
  };
}

async function inspectionForJob(client: WorkEconomicsDb, job: JobEconomicsRecord): Promise<JobEconomicsInspection> {
  const [usageResult, reservationResult, executionResult] = await Promise.all([
    client.from("job_economics_usage").select("*").eq("job_id", job.id).order("created_at", { ascending: true }),
    client.from("job_economics_reservations").select("*").eq("job_id", job.id).order("created_at", { ascending: true }),
    client.from("job_economics_executions").select("*").eq("job_id", job.id).order("created_at", { ascending: true }),
  ]);
  if (usageResult.error) throw new JobEconomicsPersistenceError("Work economics usage could not be read.", { cause: usageResult.error });
  if (reservationResult.error) throw new JobEconomicsPersistenceError("Work economics reservations could not be read.", { cause: reservationResult.error });
  if (executionResult.error) throw new JobEconomicsPersistenceError("Budget executions could not be read.", { cause: executionResult.error });
  return {
    job,
    executions: (executionResult.data ?? []).map(mapBudgetExecution),
    usage: (usageResult.data ?? []).map((item) => mapUsage(item as DbRow)),
    reservations: (reservationResult.data ?? []).map((item) => mapReservation(item as DbRow)),
    policy: JOB_ECONOMICS_POLICY,
  };
}

function failureDetail(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const value = error as { code?: unknown; message?: unknown; details?: unknown };
  return `${typeof value.code === "string" ? value.code : ""} ${typeof value.message === "string" ? value.message : ""} ${typeof value.details === "string" ? value.details : ""}`.toLowerCase();
}

function mapDatabaseError(error: unknown): never {
  const detail = failureDetail(error);
  if (detail.includes("workspace_exit_future_work_blocked")) throw new JobEconomicsConflictError(WORKSPACE_EXIT_STOPPED_MESSAGE);
  if (detail.includes("job_economics_identity_denied")) throw new JobEconomicsAccessError("A verified signed-in identity is required.");
  if (detail.includes("job_economics_workspace_denied")) throw new JobEconomicsAccessError();
  if (detail.includes("job_economics_payer_required")) throw new JobEconomicsPayerError();
  if (detail.includes("job_economics_target_not_found")) throw new JobEconomicsTargetError();
  if (detail.includes("job_economics_not_found")) throw new JobEconomicsNotFoundError();
  if (detail.includes("job_economics_idempotency_conflict")) throw new JobEconomicsConflictError("This usage key was already used with different usage data.");
  if (detail.includes("job_economics_existing_conflict")) throw new JobEconomicsConflictError("An active budget already exists for this work with different limits.");
  if (detail.includes("job_economics_reservation_exceeded")) throw new JobEconomicsConflictError("The requested reservation exceeds the authorized maximum.");
  if (detail.includes("job_economics_usage_exceeded")) throw new JobEconomicsConflictError("Measured usage exceeds the reserved budget.");
  if (detail.includes("job_economics_unknown_settlement")) throw new JobEconomicsConflictError("Unknown usage cannot be settled as a measured amount.");
  if (detail.includes("job_economics_settlement_mismatch")) throw new JobEconomicsConflictError("The measured settlement must equal known recorded usage.");
  if (detail.includes("job_economics_overage")) throw new JobEconomicsConflictError("The measured amount exceeds the authorized maximum.");
  if (detail.includes("job_economics_runtime_managed")) throw new JobEconomicsConflictError("Runtime execution owns usage for this budget.");
  if (detail.includes("job_economics_execution_unresolved")) throw new JobEconomicsConflictError("An action still has an unresolved execution.");
  if (detail.includes("job_economics_invalid_transition")) throw new JobEconomicsConflictError("This work economics record cannot take that action in its current state.");
  if (detail.includes("job_economics_command_invalid")) throw new JobEconomicsValidationError("The work economics command is invalid.");
  throw new JobEconomicsPersistenceError(undefined, { cause: error });
}

export async function commandJobEconomics(
  actor: { userId: string; verifiedEmail: string },
  command: JobEconomicsCommand,
): Promise<JobEconomicsRecord> {
  const functionName = command.action === "create"
    ? "job_economics_create_with_payer_transition"
    : "job_economics_command_with_payer_authority";
  const result = await db().rpc(functionName, {
    p_command: command as unknown,
    p_actor_id: actor.userId,
    p_verified_email: actor.verifiedEmail,
  });
  if (result.error) mapDatabaseError(result.error);
  const row = result.data?.[0];
  if (!row) throw new JobEconomicsPersistenceError("Work economics command returned no record.");
  return mapJob(row as DbRow);
}

export async function readJobEconomics(
  actor: { userId: string; verifiedEmail: string },
  jobId: string,
): Promise<JobEconomicsInspection | null> {
  const client = db();
  const result = await client.rpc("get_job_economics", {
    p_job_id: jobId,
    p_actor_id: actor.userId,
    p_verified_email: actor.verifiedEmail,
  });
  if (result.error) mapDatabaseError(result.error);
  const row = result.data?.[0];
  if (!row) return null;
  return inspectionForJob(client, mapJob(row as DbRow));
}

export interface JobEconomicsTargetQuery {
  workspaceId: string | null;
  workId: string | null;
  productId?: JobEconomicsRecord["productId"];
  resourceKind?: JobEconomicsRecord["resourceKind"];
  tenantId: string | null;
  businessId: string | null;
  requestId: string | null;
  capabilityId: string | null;
}

/** Find the latest ledger for a native reference after the service authorizes it. */
export async function findJobEconomics(
  target: JobEconomicsTargetQuery,
): Promise<JobEconomicsInspection | null> {
  const client = db();
  let query = client.from("job_economics").select("*");
  if (target.workspaceId && target.workId) {
    query = query.eq("workspace_id", target.workspaceId).eq("work_id", target.workId);
  } else if (target.workspaceId && target.productId === "work_plans" && target.resourceKind === "plan" && !target.workId) {
    query = query.eq("workspace_id", target.workspaceId).is("work_id", null)
      .eq("product_id", target.productId).eq("resource_kind", target.resourceKind);
  } else if (target.tenantId && target.businessId && target.requestId && target.capabilityId) {
    query = query.eq("tenant_id", target.tenantId)
      .eq("business_id", target.businessId)
      .eq("request_id", target.requestId)
      .eq("capability_id", target.capabilityId);
  } else {
    throw new JobEconomicsValidationError("A complete native work reference is required.");
  }
  const result = await query.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (result.error) throw new JobEconomicsPersistenceError("Work economics record could not be found.", { cause: result.error });
  if (!result.data) return null;
  return inspectionForJob(client, mapJob(result.data as DbRow));
}

export const __private = { mapJob, mapUsage, mapDatabaseError };
