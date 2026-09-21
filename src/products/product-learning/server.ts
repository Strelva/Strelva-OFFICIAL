import { getSupabase } from "@/lib/db/client";
import { isSuperAdminUser } from "@/lib/db/repositories";
import { assertWorkspaceMember, getWork } from "@/platform/workspaces/repository";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError } from "@/platform/workspaces/types";
import { createLearningService, type LearningStore } from "./service";

/** A production build alone never enables internal R&D or grants staff access. */
export function productLearningEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.STRELVA_PRODUCT_LEARNING_RELEASE === "1";
}

const store: LearningStore = {
  async authorizeInternalMember(actor, workspaceId) {
    if (!productLearningEnabled() || !(await isSuperAdminUser(actor.userId))) throw new WorkspaceAccessError("Internal R&D access is required.");
    await assertWorkspaceMember(actor, workspaceId);
  },
  get: getWork,
  async create(actor, workspaceId, learning) {
    await this.authorizeInternalMember(actor, workspaceId);
    const db = getSupabase();
    if (!db) throw new WorkspaceStoreError("Learning storage is unavailable.");
    const rpc = db as unknown as { rpc(name: string, args: Record<string, unknown>): Promise<{ data: Array<{ id: string; payload: unknown; created_at: string; updated_at: string }> | null; error: { message: string } | null }> };
    const { data, error } = await rpc.rpc("create_product_learning_work", { p_workspace_id: workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_payload: learning });
    if (error?.message.includes("workspace_access_denied")) throw new WorkspaceAccessError();
    if (error?.message.includes("learning_revision_conflict")) throw new WorkspaceConflictError("This workspace has reached its saved work limit.");
    if (error || !data?.[0]) throw new WorkspaceStoreError("The research responsibility could not be saved.");
    const row = data[0];
    return { id: row.id, workspaceId, productId: "product-learning", resourceKind: "learning", title: learning.title, payload: row.payload, createdBy: actor.userId, createdAt: row.created_at, updatedAt: row.updated_at };
  },
  async replace(actor, work, expectedRevision, learning) {
    await this.authorizeInternalMember(actor, work.workspaceId);
    const db = getSupabase();
    if (!db) throw new WorkspaceStoreError("Learning storage is unavailable.");
    const rpc = db as unknown as { rpc(name: string, args: Record<string, unknown>): Promise<{ data: Array<{ payload: unknown; updated_at: string }> | null; error: { message: string } | null }> };
    const { data, error } = await rpc.rpc("update_product_learning_work", { p_work_id: work.id, p_workspace_id: work.workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_expected_revision: expectedRevision, p_payload: learning });
    if (error?.message.includes("workspace_access_denied")) throw new WorkspaceAccessError();
    if (error?.message.includes("learning_revision_conflict")) throw new WorkspaceConflictError("Learning evidence changed. Reload before continuing.");
    if (error || !data?.[0]) throw new WorkspaceStoreError("The learning change could not be confirmed.");
    return { ...work, payload: data[0].payload, updatedAt: data[0].updated_at };
  },
};
const service = createLearningService(store);
export const createWorkspaceLearning = service.create;
export const readWorkspaceLearning = service.read;
export const changeWorkspaceLearning = service.change;
export const collectWorkspaceLearning = service.collect;
