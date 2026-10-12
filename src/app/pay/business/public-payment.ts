import { z } from "zod";
import { paymentRequestSchema } from "@/platform/connect/contracts";

/** The token read carries issued, immutable terms; no defaults invent a policy. */
export const publicPaymentRequestSchema = paymentRequestSchema.extend({
  cancellationPolicy: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type PublicPaymentRequest = z.infer<typeof publicPaymentRequestSchema>;

export function hasPaymentTerms(request: PublicPaymentRequest): boolean {
  const hasRefundPolicy = typeof request.cancellationPolicy?.refundable === "boolean";
  return request.kind === "deposit" ? hasRefundPolicy : hasRefundPolicy || !!request.acceptedTerms?.trim();
}

export function paymentRefundTerms(request: PublicPaymentRequest): string | null {
  const refundable = request.cancellationPolicy?.refundable;
  if (typeof refundable !== "boolean") return null;
  const subject = request.kind === "deposit" ? "This deposit" : "This payment";
  const cancelled = request.kind === "deposit" ? "booking" : "work";
  return refundable ? `${subject} is eligible for a refund if the ${cancelled} is cancelled. Contact ${request.businessName || "the business"} to arrange it.` : `${subject} is non-refundable if the ${cancelled} is cancelled.`;
}
