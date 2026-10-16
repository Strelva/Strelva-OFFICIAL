import { z } from "zod";
import { paymentRequestSchema } from "./contracts";

/** Issued, immutable terms; defaults must never invent a payment policy. */
/**
 * The business's own look on its payment page (additive, October 16). Read
 * only when the payment read carries it; a malformed value is dropped, never
 * a reason to refuse the page. No business-brand store feeds it yet, so live
 * pages show the business's name on neutral paper until one does.
 */
export const publicPaymentBrandSchema = z
  .object({
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
    logoUrl: z.string().url().startsWith("https://").nullable().optional(),
  })
  .nullable()
  .optional()
  .catch(null);
export const publicPaymentRequestSchema = paymentRequestSchema.extend({
  cancellationPolicy: z.record(z.string(), z.unknown()).nullable().optional(),
  brand: publicPaymentBrandSchema,
});
export type PublicPaymentRequest = z.infer<typeof publicPaymentRequestSchema>;

export function hasPaymentTerms(request: PublicPaymentRequest): boolean {
  const hasRefundPolicy = typeof request.cancellationPolicy?.refundable === "boolean";
  return request.kind === "deposit" ? hasRefundPolicy : hasRefundPolicy || !!request.acceptedTerms?.trim();
}
