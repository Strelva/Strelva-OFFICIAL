import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { accessReviewSchema, accessReviewScopeSchema, accessReviewRevokeSchema, type AccessReviewScope, type AccessReviewRevoke } from "./contracts";
export type AccessReviewDb = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }> };
function reviewDb(): AccessReviewDb {
  const db = getSupabase();
  if (!db) throw new WorkspaceStoreError("Access review storage is unavailable.");
  return db as unknown as AccessReviewDb;
}
function identity(actor: WorkspaceActor) {
  return { p_user_id: z.string().uuid().parse(actor.userId), p_verified_email: z.string().trim().toLowerCase().email().parse(actor.verifiedEmail) };
}
async function call(db: AccessReviewDb, name: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(name, args);
  if (error) {
    if (/access_review_denied|access_denied|assignment_denied/.test(error.message ?? "")) throw new WorkspaceAccessError();
    if (/access_review_protected/.test(error.message ?? "")) throw new WorkspaceConflictError("Owners are protected. Use ownership transfer before removing an owner.");
    if (/provider_change_completion_required/.test(error.message ?? "")) throw new WorkspaceConflictError("Complete the provider change notice before ending this provider.");
    throw new WorkspaceStoreError("The access change could not be confirmed.");
  }
  return data;
}
export async function readAccessReview(actor: WorkspaceActor, raw: AccessReviewScope, db = reviewDb()) {
  const scope = accessReviewScopeSchema.parse(raw);
  const data = accessReviewSchema.safeParse(await call(db, "read_access_review", { ...identity(actor), p_workspace_id: scope.workspaceId, p_organization: scope.organization }));
  if (!data.success || data.data.workspaceId !== scope.workspaceId || data.data.actorUserId !== actor.userId || data.data.organization !== scope.organization
    || !data.data.units.some(unit => unit.workspaceId === scope.workspaceId)
    || new Set(data.data.units.map(unit => unit.workspaceId)).size !== data.data.units.length
    || data.data.units.some(unit => new Set(unit.entries.map(entry => `${entry.kind}:${entry.id}`)).size !== unit.entries.length)
    || (!scope.organization && (data.data.units.length !== 1 || data.data.units[0]?.workspaceId !== scope.workspaceId))) throw new WorkspaceStoreError("The access review response was malformed.");
  return data.data;
}
export async function revokeAccessReview(actor: WorkspaceActor, raw: AccessReviewRevoke, db = reviewDb()) {
  const input = accessReviewRevokeSchema.parse(raw);
  const value = await call(db, "revoke_access_review_entry", { ...identity(actor), p_workspace_id: input.workspaceId, p_business_id: input.businessId, p_organization: input.organization, p_kind: input.kind, p_record_id: input.recordId });
  const result = z.object({ ok: z.literal(true), changed: z.boolean() }).strict().safeParse(value);
  if (!result.success) throw new WorkspaceStoreError("The access change response was malformed.");
  return result.data;
}
