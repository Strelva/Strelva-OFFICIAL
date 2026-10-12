import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { heldRequestSchema, type HeldRequest } from "./contracts";

/**
 * Held requests (20261024100000): a request typed at setup when no agency
 * works with the business is kept on the business, visible to its members,
 * and filed to the agency the owner brings in once it accepts. Nothing here
 * sends anything. SQL owns every authority check.
 */
type Db = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }> };
let override: Db | null | undefined;
export function setHeldRequestDb(db: Db | null | undefined) { override = db; }
function db(): Db {
  const client = override !== undefined ? override : getSupabase() as unknown as Db | null;
  if (!client) throw new WorkspaceStoreError("Your requests are unavailable right now. Nothing changed.");
  return client;
}
const list = z.array(heldRequestSchema);
const shape = (items: z.infer<typeof list>): HeldRequest[] => items.map(({ id, text, status, heldAt, requestId, agencyName }) => ({ id, text, status, heldAt, requestId, agencyName }));

async function call(name: string, args: Record<string, unknown>): Promise<HeldRequest[]> {
  const { data, error } = await db().rpc(name, args);
  if (error) {
    const message = error.message ?? "";
    if (/access_denied|owner_required/.test(message)) throw new WorkspaceAccessError("Only the business owner changes a held request.");
    if (/held_request_not_found/.test(message)) throw new WorkspaceConflictError("That request was already sent or withdrawn.");
    throw new WorkspaceStoreError("Your requests couldn't be read. Nothing changed.");
  }
  return shape(list.parse(data));
}

export function readHeldRequests(actor: WorkspaceActor, workspaceId: string): Promise<HeldRequest[]> {
  return call("read_business_held_requests", { p_user_id: actor.userId, p_verified_email: actor.verifiedEmail.trim().toLowerCase(), p_workspace_id: workspaceId });
}

export function withdrawHeldRequest(actor: WorkspaceActor, workspaceId: string, heldRequestId: string): Promise<HeldRequest[]> {
  return call("decide_business_held_request", {
    p_user_id: actor.userId, p_verified_email: actor.verifiedEmail.trim().toLowerCase(), p_workspace_id: workspaceId,
    p_held_id: heldRequestId, p_action: "withdraw", p_agency_id: null,
  });
}
