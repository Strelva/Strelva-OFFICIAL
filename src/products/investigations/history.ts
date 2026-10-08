import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { WorkspaceAccessError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { investigationRunSchema } from "./contracts";
export type InvestigationRun = z.infer<typeof investigationRunSchema>;
export interface InvestigationHistory {
  find(actor: WorkspaceActor, workId: string, requestId: string): Promise<InvestigationRun | null>;
  page(actor: WorkspaceActor, workId: string, before: number | null, limit: number): Promise<Array<{ revision: number; run: InvestigationRun }>>;
}
async function read(actor: WorkspaceActor, workId: string, requestId: string | null, before: number | null, limit: number) {
  const db = getSupabase();
  if (!db) throw new WorkspaceStoreError("Investigation history is unavailable.");
  const { data, error } = await (db as unknown as { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }> }).rpc("read_investigation_runs", { p_work_id: workId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_request_id: requestId, p_before_revision: before, p_limit: limit });
  if (error?.message?.includes("workspace_access_denied")) throw new WorkspaceAccessError();
  if (error) throw new WorkspaceStoreError("Investigation history could not be read.");
  return z.array(z.object({ revision: z.number().int().nonnegative(), run: investigationRunSchema })).parse(data);
}
export const investigationHistory: InvestigationHistory = {
  async find(actor, id, requestId) { return (await read(actor, id, requestId, null, 1))[0]?.run ?? null; },
  page: (actor, id, before, limit) => read(actor, id, null, before, limit),
};
