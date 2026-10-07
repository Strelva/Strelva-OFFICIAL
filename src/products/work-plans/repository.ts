import { getSupabase } from "@/platform/infra/db/client";
import { systemsReleasedFor } from "@/platform/systems-release";
import { assertCanMakeSystems } from "@/platform/workspaces/repository";
import { WorkspaceAccessError, WorkspaceStoreError, WorkspaceConflictError, type SavedWork, type SaveWorkInput } from "@/platform/workspaces/types";
import { getWork, type WorkspaceActor } from "@/platform/workspaces";
import { WORK_PLAN_PRODUCT_ID, WORK_PLAN_RESOURCE_KIND, workPlanSchema, type WorkPlanRecord } from "./contracts";
import { WorkPlanNotFoundError } from "./errors";

export async function readWorkPlan(input: {
  actor: WorkspaceActor;
  workspaceId: string;
  workId: string;
}): Promise<WorkPlanRecord> {
  const maker = await systemsReleasedFor(input.actor, input.workspaceId);
  const work = maker ? await makerPlanRpc("read_system_work_plan", input.actor, input.workspaceId, { p_work_id: input.workId }) : await getWork(input.actor, input.workId);
  if (!work || work.workspaceId !== input.workspaceId ||
    work.productId !== WORK_PLAN_PRODUCT_ID || work.resourceKind !== WORK_PLAN_RESOURCE_KIND) {
    throw new WorkPlanNotFoundError();
  }
  const plan = workPlanSchema.safeParse(work.payload);
  if (!plan.success) throw new WorkPlanNotFoundError("The saved plan is malformed or unavailable");
  return { work, plan: plan.data };
}

async function makerPlanRpc(name: string, actor: WorkspaceActor, workspaceId: string, args: Record<string, unknown>): Promise<SavedWork | null> {
  await assertCanMakeSystems(actor, workspaceId);
  const client = getSupabase();
  if (!client) throw new WorkspaceStoreError("Workspace storage is not configured");
  const rpc = client as unknown as { rpc(name: string, args: Record<string, unknown>): Promise<{ data: Record<string, unknown>[] | null; error: { message?: string } | null }> };
  const { data, error } = await rpc.rpc(name, { p_workspace_id: workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, ...args });
  if (error?.message?.includes("workspace_make_systems_required")) { await assertCanMakeSystems(actor, workspaceId); throw new WorkspaceAccessError(); }
  if (error?.message?.includes("workspace_access_denied") || error?.message?.includes("workspace_membership_required")) throw new WorkspaceAccessError();
  if (error?.message?.includes("workspace_exit_future_work_blocked") || error?.message?.includes("saved_work_limit")) throw new WorkspaceConflictError();
  if (error) throw new WorkspaceStoreError("The work plan could not be confirmed");
  const row = data?.[0];
  if (!row) return null;
  return { id: String(row.id), workspaceId: String(row.workspace_id), productId: String(row.product_id), resourceKind: String(row.resource_kind), title: typeof row.title === "string" ? row.title : null, payload: row.payload, input: row.input, sourceWorkId: typeof row.source_work_id === "string" ? row.source_work_id : null, createdBy: String(row.created_by), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}

/** Maker plan storage rechecks identity, delegation, capacity and exit inside SQL. */
export async function saveMakerWorkPlan(actor: WorkspaceActor, workspaceId: string, work: SaveWorkInput): Promise<SavedWork> {
  const saved = await makerPlanRpc("save_system_work_plan", actor, workspaceId, { p_title: work.title, p_payload: work.payload, p_input: work.input ?? null });
  if (!saved) throw new WorkspaceStoreError("The work plan could not be confirmed");
  return saved;
}
