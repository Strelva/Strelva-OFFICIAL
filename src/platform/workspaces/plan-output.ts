import { getSupabase } from "@/lib/db/client";
import {
  WorkspaceAccessError,
  WorkspaceConflictError,
  WorkspaceStoreError,
  type WorkspaceActor,
} from "./types";

type DbRow = Record<string, unknown>;
type DbError = { code?: string; message?: string } | null;

/**
 * The plan-output repository is intentionally narrower than saveWork. The
 * database function validates the saved plan and inserts the native work and
 * receipt in one transaction, so a retried request cannot create a second
 * document or tracker.
 */
export interface PersistWorkPlanOutputInput {
  actor: WorkspaceActor;
  workspaceId: string;
  planWorkId: string;
  planRevision: number;
  outputId: string;
  operationId: string;
  idempotencyKey: string;
  inputDigest: string;
  nativeProductId: string;
  nativeResourceKind: string;
  nativeTitle: string;
  nativePayload: unknown;
  nativeInput: unknown;
  expectedSourceReferences?: readonly {
    workId: string;
    productId: string;
    resourceKind: string;
    revision: number | null;
    updatedAt: string;
  }[];
}

export interface PersistedWorkPlanOutput {
  executionId: string;
  planWorkId: string;
  outputId: string;
  planRevision: number;
  status: "completed";
  replayed: boolean;
  nativeWorkId: string;
  nativeProductId: string;
  nativeResourceKind: string;
  receipt: unknown;
  createdAt: string;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function dbError(error: DbError): never {
  const detail = `${error?.code ?? ""} ${error?.message ?? ""}`;
  if (detail.includes("workspace_access_denied")) throw new WorkspaceAccessError();
  if (detail.includes("work_plan_revision_conflict") ||
      detail.includes("work_plan_output_invalid") ||
      detail.includes("work_plan_output_unsupported") ||
      detail.includes("work_plan_output_idempotency_conflict")) {
    throw new WorkspaceConflictError();
  }
  throw new WorkspaceStoreError("The saved plan output could not be confirmed.");
}

function mapRow(row: DbRow): PersistedWorkPlanOutput {
  const executionId = asString(row.execution_id || row.id);
  const planWorkId = asString(row.plan_work_id);
  const outputId = asString(row.output_id);
  const planRevision = asNumber(row.plan_revision);
  const nativeWorkId = asString(row.native_work_id);
  const nativeProductId = asString(row.native_product_id);
  const nativeResourceKind = asString(row.native_resource_kind);
  const createdAt = asString(row.created_at);
  if (!executionId || !planWorkId || !outputId || planRevision === null || !nativeWorkId ||
      !nativeProductId || !nativeResourceKind || !createdAt || !row.receipt) {
    throw new WorkspaceStoreError("The saved plan output receipt is malformed.");
  }
  return {
    executionId,
    planWorkId,
    outputId,
    planRevision,
    status: "completed",
    replayed: row.replayed === true,
    nativeWorkId,
    nativeProductId,
    nativeResourceKind,
    receipt: row.receipt,
    createdAt,
  };
}

type PlanOutputKey = Pick<
  PersistWorkPlanOutputInput,
  "actor" | "workspaceId" | "planWorkId" | "planRevision" | "outputId" | "operationId" | "idempotencyKey" | "inputDigest"
>;

function keyArgs(input: PlanOutputKey): Record<string, unknown> {
  return {
    p_plan_work_id: input.planWorkId,
    p_workspace_id: input.workspaceId,
    p_user_id: input.actor.userId,
    p_verified_email: input.actor.verifiedEmail,
    p_plan_revision: input.planRevision,
    p_output_id: input.outputId,
    p_operation_id: input.operationId,
    p_idempotency_key: input.idempotencyKey,
    p_input_digest: input.inputDigest,
  };
}

function rpcArgs(input: PersistWorkPlanOutputInput): Record<string, unknown> {
  return keyArgs(input);
}

export async function persistWorkPlanOutput(input: PersistWorkPlanOutputInput): Promise<PersistedWorkPlanOutput> {
  const client = getSupabase();
  if (!client) throw new WorkspaceStoreError("Workspace storage is not configured");
  const rpc = client as unknown as {
    rpc(name: string, args: Record<string, unknown>): Promise<{ data: DbRow[] | null; error: DbError }>;
  };
  const { data, error } = await rpc.rpc("execute_work_plan_output", {
    ...rpcArgs(input),
    p_native_product_id: input.nativeProductId,
    p_native_resource_kind: input.nativeResourceKind,
    p_native_title: input.nativeTitle,
    p_native_payload: input.nativePayload,
    p_native_input: input.nativeInput,
    p_source_references: input.expectedSourceReferences ?? [],
  });
  if (error) dbError(error);
  if (!data?.[0]) throw new WorkspaceStoreError("The saved plan output could not be confirmed.");
  return mapRow(data[0]);
}

/** Read a completed receipt before freshness checks so safe retries remain idempotent. */
export async function readWorkPlanOutput(input: PlanOutputKey): Promise<PersistedWorkPlanOutput | null> {
  const client = getSupabase();
  if (!client) throw new WorkspaceStoreError("Workspace storage is not configured");
  const rpc = client as unknown as {
    rpc(name: string, args: Record<string, unknown>): Promise<{ data: DbRow[] | null; error: DbError }>;
  };
  const { data, error } = await rpc.rpc("read_work_plan_output", keyArgs(input));
  if (error) dbError(error);
  if (!data?.[0]) return null;
  return mapRow({ ...data[0], replayed: true });
}

/** Load durable output receipts for a saved plan without exposing saved work. */
export async function listWorkPlanOutputs(input: {
  actor: WorkspaceActor;
  workspaceId: string;
  planWorkId: string;
}): Promise<PersistedWorkPlanOutput[]> {
  const client = getSupabase();
  if (!client) throw new WorkspaceStoreError("Workspace storage is not configured");
  const rpc = client as unknown as {
    rpc(name: string, args: Record<string, unknown>): Promise<{ data: DbRow[] | null; error: DbError }>;
  };
  const { data, error } = await rpc.rpc("list_work_plan_outputs", {
    p_plan_work_id: input.planWorkId,
    p_workspace_id: input.workspaceId,
    p_user_id: input.actor.userId,
    p_verified_email: input.actor.verifiedEmail,
  });
  if (error) dbError(error);
  return (data ?? []).map((row) => mapRow({ ...row, replayed: true }));
}
