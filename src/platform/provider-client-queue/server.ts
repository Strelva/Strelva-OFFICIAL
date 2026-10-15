import { getSupabase } from "@/platform/infra/db/client";
import { WorkspaceAccessError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { providerQueuePageSchema, type ProviderQueueCursor } from "./contracts";
/** STRELVA_ONE_QUEUE (off by default): the agency Queue also lists its clients' Strelva reviews drafts and Requests waiting for its acceptance. */
export function oneQueueEnabled(): boolean {
  return process.env.STRELVA_ONE_QUEUE === "1";
}
type Db = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }> };
export async function readProviderClientQueue(actor: WorkspaceActor, agencyWorkspaceId: string, cursor: ProviderQueueCursor | null, db: Db | null = getSupabase() as unknown as Db | null) {
  if (!db) throw new WorkspaceStoreError("The client queue is unavailable.");
  const { data, error } = await db.rpc(oneQueueEnabled() ? "read_provider_client_queue_v3" : "read_provider_client_queue_v2", {
    p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_agency_workspace_id: agencyWorkspaceId,
    p_after_at: cursor?.at ?? null, p_after_key: cursor?.key ?? null, p_limit: 50,
  });
  if (error?.message?.includes("provider_queue_access_denied")) throw new WorkspaceAccessError();
  if (error) throw new WorkspaceStoreError("The client queue could not be read.");
  const result = providerQueuePageSchema.safeParse(data);
  if (!result.success || result.data.agencyWorkspaceId !== agencyWorkspaceId) throw new WorkspaceStoreError("The client queue could not be read.");
  return result.data;
}
