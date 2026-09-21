import { getSupabase } from "@/lib/db/client";
import { getWork, saveWork, assertCanSaveWork } from "@/platform/workspaces/repository";
import { WORKSPACE_EXIT_STOPPED_MESSAGE, WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { responsibilitySchema, type Responsibility } from "./engine";
import { z } from "zod";

export async function readResponsibility(actor: WorkspaceActor, workId: string) {
  const saved = await getWork(actor, z.string().uuid().parse(workId));
  if (!saved || saved.productId !== "operations" || saved.resourceKind !== "responsibility") throw new WorkspaceAccessError();
  return { ...saved, payload: responsibilitySchema.parse(saved.payload) };
}
export async function insertResponsibility(actor: WorkspaceActor, workspaceId: string, payload: Responsibility) {
  await assertCanSaveWork(actor, workspaceId);
  return saveWork(actor, workspaceId, { productId: "operations", resourceKind: "responsibility", title: payload.title, payload });
}
export async function persistResponsibility(actor: WorkspaceActor, workId: string, workspaceId: string, expectedRevision: number, payload: Responsibility) {
  const client = getSupabase();
  if (!client) throw new WorkspaceStoreError("Work storage is unavailable.");
  const rpc = client as unknown as { rpc(name: string, args: Record<string, unknown>): Promise<{ data: Array<{ payload: unknown }> | null; error: { message: string } | null }> };
  const { data, error } = await rpc.rpc("update_work_responsibility", { p_work_id: workId, p_workspace_id: workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_expected_revision: expectedRevision, p_payload: payload });
  if (error?.message.includes("workspace_access_denied")) throw new WorkspaceAccessError();
  if (error?.message.includes("workspace_exit_future_work_blocked")) throw new WorkspaceConflictError(WORKSPACE_EXIT_STOPPED_MESSAGE);
  if (error?.message.includes("responsibility_revision_conflict")) throw new WorkspaceConflictError("This work changed. Reload its latest state.");
  if (error?.message.includes("standing_execution_blocked")) {
    throw new WorkspaceConflictError("This ongoing responsibility is paused, revoked, or no longer current.");
  }
  if (error || !data?.[0]) throw new WorkspaceStoreError("The work checkpoint could not be confirmed.");
  return responsibilitySchema.parse(data[0].payload);
}
