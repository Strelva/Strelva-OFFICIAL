import { z } from "zod";
import { nativeRpc, tokenHash } from "@/platform/bookings/native";
import { inquiryReceiptSchema } from "./public-visitor-contracts";

/** Capture request time as server-read input; visitor views render that snapshot. */
export async function readVisitorPresentationTime(): Promise<number> { return Date.now(); }

const confirmationSchema = z.object({
  businessName: z.string().trim().min(1), start: z.string().datetime({ offset: true }), end: z.string().datetime({ offset: true }),
  state: z.enum(["held", "confirming", "placed", "cancelled"]),
  bookingStatus: z.enum(["held", "requested", "confirmed", "declined", "cancelled", "completed"]).nullable(),
  timeZone: z.string().default("UTC"), expiresAt: z.string().datetime({ offset: true }).optional(),
});
export async function readVisitorConfirmation(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const parsed = confirmationSchema.safeParse(await nativeRpc("read_public_booking_confirmation", { p_hash: tokenHash(token) }));
  return parsed.success ? parsed.data : null;
}
export async function readVisitorInquiryReceipt(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const parsed = inquiryReceiptSchema.safeParse(await nativeRpc("read_public_inquiry_booking_receipt", { p_hash: tokenHash(token) }));
  return parsed.success ? parsed.data : null;
}
