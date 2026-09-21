import { randomUUID } from "node:crypto";
import { getSupabase } from "@/lib/db/client";
import { assertCanSaveWork, getWork } from "./repository";
import { WORKSPACE_EXIT_STOPPED_MESSAGE, WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor, type SaveWorkInput } from "./types";

export interface WorkspaceOperation {
  id: string; workspace_id: string; created_by: string; product_id: string;
  input: Record<string, unknown>; status: "running" | "ready" | "failed" | "completed";
  result: unknown; work_id: string | null; attempts: number;
}
export class WorkspaceOperationPendingError extends Error {
  constructor() { super("This assessment is still running. Wait two minutes, then recover it."); this.name = "WorkspaceOperationPendingError"; }
}
export async function operationRequest(actor: WorkspaceActor, workspaceId: string, id: string, action: string, extra: Record<string, unknown> = {}): Promise<WorkspaceOperation> {
  const db = getSupabase();
  if (!db) throw new WorkspaceStoreError("Assessment storage is unavailable");
  // Additive RPC schema is kept local until deployment regenerates database types.
  const { data, error } = await (db as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: WorkspaceOperation[] | null; error: { message: string } | null }> }).rpc("workspace_operation", {
    p_action: action, p_id: id, p_workspace_id: workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, ...extra,
  });
  if (error?.message.includes("workspace_access_denied")) throw new WorkspaceAccessError();
  if (error?.message.includes("workspace_exit_future_work_blocked")) throw new WorkspaceConflictError(WORKSPACE_EXIT_STOPPED_MESSAGE);
  if (error?.message.includes("operation_in_progress")) throw new WorkspaceOperationPendingError();
  if (error?.message.includes("operation_input_conflict") || error?.message.includes("operation_attempt_limit")) throw new WorkspaceConflictError();
  if (error || !data?.[0]) throw new WorkspaceStoreError("Assessment state could not be confirmed");
  return data[0];
}

/** Checkpoint before the atomic result commit; recovery never re-scores a ready result. */
export async function runWorkspaceOperation({ actor, workspaceId, id, work, run }: {
  actor: WorkspaceActor; workspaceId: string; id: string;
  work: Omit<SaveWorkInput, "payload"> & { input: Record<string, unknown> };
  run: () => Promise<unknown>;
}) {
  const lease = randomUUID();
  let op = await operationRequest(actor, workspaceId, id, "claim", { p_product_id: work.productId, p_input: work.input, p_lease_id: lease });
  if (op.status === "running") {
    try {
      await assertCanSaveWork(actor, workspaceId);
      const result = await run();
      op = await operationRequest(actor, workspaceId, id, "checkpoint", { p_lease_id: lease, p_result: result });
    } catch (error) {
      await operationRequest(actor, workspaceId, id, "fail", { p_lease_id: lease }).catch(() => {});
      throw error;
    }
  }
  if (op.status === "ready") op = await operationRequest(actor, workspaceId, id, "complete", { p_resource_kind: work.resourceKind, p_title: work.title || "Assessment" });
  const saved = op.work_id ? await getWork(actor, op.work_id) : null;
  if (!saved) throw new WorkspaceStoreError("Completed assessment is unavailable");
  return saved;
}
