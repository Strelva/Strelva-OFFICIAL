import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import type { WorkspaceActor } from "@/platform/workspaces/types";

export const listingControlSchema = z.object({
  workspaceId: z.string().uuid(), locationId: z.string(), paused: z.boolean(), accessPending: z.boolean(), updatedAt: z.string().nullable(),
});
export type ListingControl = z.infer<typeof listingControlSchema>;
type Db = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };

async function call(name: string, args: Record<string, unknown>, db: Db | null) {
  if (!db) throw new Error("Google listing controls are unavailable.");
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error("Google listing controls could not be saved or read.");
  return listingControlSchema.parse(data);
}

/** Service-only read: writers and pollers fail closed if the pause cannot be read. */
export function readListingControl(workspaceId: string, locationId: string, db: Db | null = getSupabase() as unknown as Db | null) {
  return call("read_google_listing_control", { p_workspace_id: workspaceId, p_location_id: locationId }, db);
}

/** Actor is rechecked by SQL. Pause does not disconnect Google or remove reviews. */
export function setListingPaused(actor: WorkspaceActor, workspaceId: string, locationId: string, paused: boolean, db: Db | null = getSupabase() as unknown as Db | null) {
  return call("set_google_listing_paused", { p_workspace_id: workspaceId, p_location_id: locationId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_paused: paused }, db);
}

/** Access observations never change lifecycle. They do not promise a retry clock. */
export function noteListingAccess(workspaceId: string, locationId: string, pending: boolean, db: Db | null = getSupabase() as unknown as Db | null) {
  return call("note_google_listing_access", { p_workspace_id: workspaceId, p_location_id: locationId, p_pending: pending }, db);
}
