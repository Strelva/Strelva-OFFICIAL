import { XaStatus, XaTextLink } from "@/components/ui/strelva/Xa";
import type { CheckoutAvailability } from "@/platform/connect/checkout-availability";
import styles from "@/experience/workspace/money/money.module.css";

export const UNRELEASED_CHECKOUT: CheckoutAvailability = { status: "coming_soon" };

/** Why checkout is not offered yet, said once beside the price it would charge. Ready says nothing. */
export function AgencyCheckoutStatus({ availability, paymentsHref }: { availability: CheckoutAvailability; paymentsHref?: string }) {
  if (availability.status === "ready") return null;
  return <p className={`${styles.note} ${styles.statusLine}`}>
    {availability.status === "coming_soon" ? <><XaStatus kind="draft" size="sm">Coming soon</XaStatus><span>Checkout opens later. Retail terms can be prepared and agreed now.</span></>
      : availability.status === "setup_required" ? "Checkout waits until the agency finishes its Stripe setup."
        : "Payment readiness could not be confirmed, so checkout is off. Reload to check again."}
    {availability.status === "setup_required" && paymentsHref ? <> <XaTextLink href={paymentsHref}>Set up agency payments</XaTextLink></> : null}
  </p>;
}
