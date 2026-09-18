import { z } from "zod";
import { getSupabase } from "@/lib/db/client";
import { getWork } from "@/platform/workspaces/repository";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor, type SavedWork } from "@/platform/workspaces/types";
import type { WorkAuthority, WorkAuthoritySnapshot, WorkSource } from "./authority";

interface RpcClient {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>;
}
function client(): RpcClient {
  const db = getSupabase();
  if (!db) throw new WorkspaceStoreError("Work context storage is unavailable.");
  return db as unknown as RpcClient;
}
function identity(actor: WorkspaceActor) {
  return { p_user_id: z.string().uuid().parse(actor.userId), p_verified_email: z.string().email().parse(actor.verifiedEmail.toLowerCase()) };
}
function failed(error: { message: string } | null) {
  if (!error) return;
  if (/workspace_access_denied|work_grant_denied/.test(error.message)) throw new WorkspaceAccessError();
  if (/work_auxiliary_conflict|work_source_changed|work_grant_budget/.test(error.message)) throw new WorkspaceConflictError("This work, grant or source changed. Reload before continuing.");
  throw new WorkspaceStoreError("The work context operation could not be confirmed.");
}
function source(work: SavedWork): WorkSource {
  const payload = work.payload as { revision?: unknown } | null;
  return { id: work.id, workspaceId: work.workspaceId, title: work.title ?? "Untitled work", revision: payload?.revision == null ? new Date(work.updatedAt).toISOString() : String(payload.revision), payload: work.payload };
}
export const postgresWorkAuthority: WorkAuthority = {
  async read(actor, workId, domain) {
    const { data, error } = await client().rpc("read_work_auxiliary", { ...identity(actor), p_work_id: z.string().uuid().parse(workId), p_domain: domain });
    failed(error);
    const result = z.object({ work: z.object({ id: z.string(), workspaceId: z.string(), title: z.string(), revision: z.string(), payload: z.unknown() }), role: z.enum(["owner", "admin", "member"]).nullable(), payload: z.unknown().nullable() }).safeParse(data);
    if (!result.success) throw new WorkspaceStoreError("Work context is unreadable.");
    return result.data as WorkAuthoritySnapshot;
  },
  async commit(actor, workId, domain, expectedRevision, payload, intent, expectedWorkRevision) {
    const { error } = await client().rpc("commit_work_auxiliary", { ...identity(actor), p_work_id: z.string().uuid().parse(workId), p_domain: domain, p_expected_revision: expectedRevision, p_payload: payload, p_intent: intent, p_expected_work_revision: expectedWorkRevision });
    failed(error);
  },
  async grantedSource(actor, workId, sourceWorkId, operation) {
    const { data, error } = await client().rpc("read_work_granted_source", { ...identity(actor), p_work_id: z.string().uuid().parse(workId), p_source_work_id: z.string().uuid().parse(sourceWorkId), p_operation: operation });
    failed(error);
    const result = z.object({ id: z.string(), workspaceId: z.string(), title: z.string(), revision: z.string(), payload: z.unknown() }).safeParse(data);
    if (!result.success) throw new WorkspaceStoreError("The source could not be read.");
    return result.data as WorkSource;
  },
  async source(actor, sourceWorkId) {
    const work = await getWork(actor, z.string().uuid().parse(sourceWorkId));
    if (!work || work.productId === "product-learning") throw new WorkspaceAccessError();
    return source(work);
  },
};
