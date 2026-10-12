import { z } from "zod";
import { paymentRequestSchema } from "./contracts";

/** Issued, immutable terms; defaults must never invent a payment policy. */
export const publicPaymentRequestSchema = paymentRequestSchema.extend({
  cancellationPolicy: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type PublicPaymentRequest = z.infer<typeof publicPaymentRequestSchema>;

export function hasPaymentTerms(request: PublicPaymentRequest): boolean {
  const hasRefundPolicy = typeof request.cancellationPolicy?.refundable === "boolean";
  return request.kind === "deposit" ? hasRefundPolicy : hasRefundPolicy || !!request.acceptedTerms?.trim();
}
