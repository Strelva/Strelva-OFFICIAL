import { z } from "zod";
import { baseSchema } from "./contracts";
export { baseSchema } from "./contracts";
import { getSupabase } from "@/lib/db/client";
import { assertWorkspaceMember, getWork, saveWork } from "@/platform/workspaces/repository";
import { WORKSPACE_EXIT_STOPPED_MESSAGE, WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type SavedWork, type SaveWorkInput, type WorkspaceActor } from "@/platform/workspaces/types";

/** Persistence port. Direct membership is rechecked at each mutation, including after provider reads. */
export interface BoundedStore {
  member(actor: WorkspaceActor, workspaceId: string): Promise<void>;
  read(actor: WorkspaceActor, workId: string): Promise<SavedWork | null>;
  create(actor: WorkspaceActor, workspaceId: string, input: SaveWorkInput): Promise<SavedWork>;
  update(actor: WorkspaceActor, work: SavedWork, expectedRevision: number, payload: unknown): Promise<SavedWork>;
}
export const boundedStore: BoundedStore = {
  member: assertWorkspaceMember, read: getWork, create: saveWork,
  async update(actor, work, expectedRevision, payload) {
    const db = getSupabase();
    if (!db) throw new WorkspaceStoreError("Work storage is unavailable.");
    const rpc = db as unknown as { rpc(name: string, args: Record<string, unknown>): Promise<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }> };
    const { data, error } = await rpc.rpc("update_bounded_product_work", { p_work_id: z.string().uuid().parse(work.id), p_workspace_id: work.workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_product_id: work.productId, p_expected_revision: expectedRevision, p_payload: payload });
    if (error?.message.includes("workspace_access_denied")) throw new WorkspaceAccessError();
    if (error?.message.includes("workspace_exit_future_work_blocked")) throw new WorkspaceConflictError(WORKSPACE_EXIT_STOPPED_MESSAGE);
    if (error?.message.includes("bounded_revision_conflict")) throw new WorkspaceConflictError("This work changed. Reload before trying again.");
    if (error || !data?.[0]) throw new WorkspaceStoreError("The change could not be confirmed.");
    return { ...work, payload: data[0].payload, title: String(data[0].title), updatedAt: String(data[0].updated_at) };
  },
};
export function initial(title: string, actor: WorkspaceActor) {
  return { version: 1 as const, revision: 0, title, createdBy: actor.userId, createdAt: new Date().toISOString(), history: [] };
}
export function advance<T extends z.infer<typeof baseSchema>>(value: T, expected: number, kind: string, actor: WorkspaceActor): T {
  if (value.revision !== expected) throw new WorkspaceConflictError("This work changed. Reload before trying again.");
  return { ...value, revision: expected + 1, history: [...value.history, { revision: expected + 1, kind, actorId: actor.userId, at: new Date().toISOString() }] };
}
export async function readBounded<T>(store: BoundedStore, actor: WorkspaceActor, workId: string, productId: string, schema: z.ZodType<T>): Promise<SavedWork & { payload: T }> {
  const work = await store.read(actor, workId);
  if (!work || work.productId !== productId) throw new WorkspaceAccessError();
  return { ...work, payload: schema.parse(work.payload) };
}
