import { z } from "zod";

/** Browser-safe visitor state; the server owns every transition. */
export const inquiryReceiptSchema = z.object({
  status: z.enum(["held", "requested", "confirmed", "declined", "cancelled", "completed", "no_show"]),
  start: z.string().datetime({ offset: true }), timeZone: z.string(),
  confirmUntil: z.string().datetime({ offset: true }).nullable(),
});
export type InquiryReceipt = z.infer<typeof inquiryReceiptSchema>;
export function bookingReceiptLabel(status: InquiryReceipt["status"], businessName?: string) {
  return status === "held" ? "Check your email to confirm" : status === "requested" ? `Waiting on ${businessName?.trim() || "the business"}` : status === "confirmed" ? "Confirmed" : status === "completed" ? "Completed" : status === "no_show" ? "Appointment missed" : "Cancelled";
}
