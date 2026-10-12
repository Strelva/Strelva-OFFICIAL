import { StNotice, StTextButton } from "@/components/ui/strelva/Kit";
import type { CheckoutAvailability } from "@/platform/connect/checkout-availability";

export const UNRELEASED_CHECKOUT: CheckoutAvailability = { status: "coming_soon" };

export function AgencyCheckoutStatus({ availability, paymentsHref }: { availability: CheckoutAvailability; paymentsHref?: string }) {
  if (availability.status === "ready") return null;
  return <StNotice>
    {availability.status === "coming_soon" ? "Payments · Coming soon. Retail terms can be prepared and reviewed; checkout is not available yet." : availability.status === "setup_required" ? "Checkout is unavailable until the agency finishes its merchant account setup." : "Payment readiness could not be confirmed. Checkout is unavailable; reload to check again."}
    {availability.status === "setup_required" && paymentsHref ? <StTextButton href={paymentsHref}>Set up agency payments</StTextButton> : null}
  </StNotice>;
}
