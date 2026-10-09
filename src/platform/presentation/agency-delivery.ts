/** Display only: the legacy stored reason and outgoing command stay unchanged. */
export function agencyDeliveryReason(reason: string | null): string | null {
  return reason === "Customer stopped provider delivery." ? "Your business stopped agency delivery." : reason;
}
