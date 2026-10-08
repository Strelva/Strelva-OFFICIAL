import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import type { WorkspaceActor } from "@/platform/workspaces/types";

export const bookingEmailState = z.enum(["inherit", "on", "off"]);
type Db = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };
async function call(name: string, args: Record<string, unknown>, db: Db | null = getSupabase() as unknown as Db | null) {
  if (!db) throw new Error("Booking email settings are unavailable.");
  const result = await db.rpc(name, args);
  if (result.error) throw new Error("Booking email settings could not be confirmed.");
  return result.data;
}
/** Fail closed. Redis workspace overrides never arm a native business. */
export async function businessBookingEmailEnabled(workspaceId: string, db?: Db | null): Promise<boolean> {
  try {
    const state = await call("read_business_booking_email", { p_workspace_id: z.string().uuid().parse(workspaceId) }, db);
    return bookingEmailState.parse(state) === "on";
  } catch { return false; }
}
/** Operator identity is checked again in SQL. Setting and actor receipt commit together. */
export async function setBusinessBookingEmail(actor: WorkspaceActor, workspaceId: string, state: unknown, reason: unknown, db?: Db | null) {
  return z.object({ state: bookingEmailState, eventId: z.string().uuid(), actorId: z.string().uuid() }).parse(await call("set_business_booking_email", {
    p_workspace_id: z.string().uuid().parse(workspaceId), p_user_id: z.string().uuid().parse(actor.userId),
    p_verified_email: z.string().email().parse(actor.verifiedEmail), p_state: bookingEmailState.parse(state),
    p_reason: z.string().trim().min(1).max(500).parse(reason),
  }, db));
}
export async function readBusinessBookingEmailHistory(actor: WorkspaceActor, workspaceId: string, db?: Db | null) {
  return z.array(z.record(z.string(), z.unknown())).parse(await call("read_business_booking_email_history", { p_workspace_id: z.string().uuid().parse(workspaceId), p_user_id: actor.userId, p_verified_email: actor.verifiedEmail }, db));
}
