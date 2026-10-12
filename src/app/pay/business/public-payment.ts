import type { PublicPaymentRequest } from "@/platform/connect/public-payment";
export { hasPaymentTerms, publicPaymentRequestSchema, type PublicPaymentRequest } from "@/platform/connect/public-payment";

export function paymentRefundTerms(request: PublicPaymentRequest): string | null {
  const refundable = request.cancellationPolicy?.refundable;
  if (typeof refundable !== "boolean") return null;
  const subject = request.kind === "deposit" ? "This deposit" : "This payment";
  const cancelled = request.kind === "deposit" ? "booking" : "work";
  return refundable ? `${subject} is eligible for a refund if the ${cancelled} is cancelled. Contact ${request.businessName || "the business"} to arrange it.` : `${subject} is non-refundable if the ${cancelled} is cancelled.`;
}
