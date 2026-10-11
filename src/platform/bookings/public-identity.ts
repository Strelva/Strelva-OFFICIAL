/** Public presentation is read by the private email token; opening never consumes it. */
import { z } from "zod";
import { nativeRpc, tokenHash } from "./native";
const confirmationIdentitySchema = z.object({
  businessName: z.string().trim().min(1), start: z.string(), end: z.string(),
  state: z.enum(["held", "confirming", "placed", "cancelled"]),
  bookingStatus: z.enum(["held", "requested", "confirmed", "declined", "cancelled", "completed"]).nullable(),
});
export async function readPublicBookingIdentity(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const raw = await nativeRpc("read_public_booking_confirmation", { p_hash: tokenHash(token) });
  const result = confirmationIdentitySchema.safeParse(raw);
  return result.success ? result.data : null;
}
