import { getSupabase } from "@/platform/infra/db/client";
import { WorkspaceAccessError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { agencyClientHomeSchema } from "./agency-client-home";
type Db = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }> };
export async function readAgencyClientHome(actor: WorkspaceActor, workspaceId: string, db: Db | null = getSupabase() as unknown as Db | null) {
  if (!db) throw new WorkspaceStoreError("The shared client Home store is unavailable.");
  const { data, error } = await db.rpc("read_agency_client_home", { p_workspace_id: workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail });
  if (error?.message?.includes("access_denied")) throw new WorkspaceAccessError();
  const parsed = agencyClientHomeSchema.safeParse(data);
  if (error || !parsed.success || parsed.data.workspaceId !== workspaceId) throw new WorkspaceStoreError("The shared client Home could not be read.");
  return parsed.data;
}
