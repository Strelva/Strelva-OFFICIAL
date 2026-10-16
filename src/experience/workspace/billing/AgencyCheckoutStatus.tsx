import { XaTextLink } from "@/components/ui/strelva/Xa";
import type { CheckoutAvailability } from "@/platform/connect/checkout-availability";
import styles from "@/experience/workspace/money/money.module.css";

export const UNRELEASED_CHECKOUT: CheckoutAvailability = {
  status: "coming_soon",
};

/**
 * Why checkout is not offered yet, in one plain sentence beside the price it
 * would charge. No dot: this is a fact about the price, not a status. With
 * `agencyName` it speaks to the owner about that agency; without it, to the
 * agency itself. Ready says nothing.
 */
export function AgencyCheckoutStatus({
  availability,
  paymentsHref,
  agencyName,
}: {
  availability: CheckoutAvailability;
  paymentsHref?: string;
  agencyName?: string;
}) {
  if (availability.status === "ready") return null;
  return (
    <p className={styles.note}>
      {availability.status === "coming_soon"
        ? agencyName
          ? `${agencyName} can charge this once checkout opens.`
          : "Checkout opens later. Retail prices can be set and agreed now."
        : availability.status === "setup_required"
          ? `Checkout waits until ${agencyName ?? "the agency"} finishes its Stripe setup.`
          : "Payment readiness could not be confirmed, so checkout is off. Reload to check again."}
      {availability.status === "setup_required" && paymentsHref ? (
        <>
          {" "}
          <XaTextLink href={paymentsHref}>Set up agency payments</XaTextLink>
        </>
      ) : null}
    </p>
  );
}
