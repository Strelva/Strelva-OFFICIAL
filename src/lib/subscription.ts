import { NextResponse } from "next/server";
import { isDevAccessBypassEnabled } from "./dev-access";
import { getTenantConfig } from "./tenants";

type SubscriptionStatus = "active" | "trialing" | "past_due" | "cancelled" | "none";

/** Grace period for past_due status in days. After this, access is blocked. */
const PAST_DUE_GRACE_DAYS = 3;

/**
 * Admin-side billing is "on" only when STRIPE_SCAFFOLD_PRICE_ID is configured.
 * While client sites are free and admin pricing is undecided, this returns
 * false and subscription gates short-circuit to "active" so the dashboard
 * isn't locked out for tenants that never paid.
 */
export function isBillingEnabled(): boolean {
  return Boolean(process.env.STRIPE_SCAFFOLD_PRICE_ID);
}

export async function getEffectiveSubscriptionStatus(tenant: string): Promise<SubscriptionStatus> {
  if (isDevAccessBypassEnabled()) return "active";
  if (!isBillingEnabled()) return "active";

  const config = await getTenantConfig(tenant);
  if (config?.planOverride === "founder_comp" || tenant === "gldf" || tenant === "rohlax") {
    return "active";
  }
  return config?.subscriptionStatus ?? "none";
}

/**
 * Check if a past_due subscription is still within the grace period.
 * Returns true if within grace period (access allowed), false otherwise.
 */
export async function isWithinPastDueGrace(tenant: string): Promise<boolean> {
  const config = await getTenantConfig(tenant);
  if (config?.subscriptionStatus !== "past_due") return false;

  const pastDueSince = config.subscriptionPastDueSince;
  if (!pastDueSince) {
    // No timestamp recorded — be lenient and allow access
    return true;
  }

  const pastDueDate = new Date(pastDueSince);
  const now = new Date();
  const daysSincePastDue = (now.getTime() - pastDueDate.getTime()) / (1000 * 60 * 60 * 24);

  return daysSincePastDue <= PAST_DUE_GRACE_DAYS;
}

export async function requireActiveSubscription(tenant: string): Promise<NextResponse | null> {
  if (isDevAccessBypassEnabled()) return null;
  if (!isBillingEnabled()) return null;

  const status = await getEffectiveSubscriptionStatus(tenant);

  // Only active and trialing have full access
  if (status === "active" || status === "trialing") {
    return null;
  }

  // past_due gets a 3-day grace period
  if (status === "past_due") {
    const withinGrace = await isWithinPastDueGrace(tenant);
    if (withinGrace) {
      return null;
    }
    return NextResponse.json(
      { error: "Payment past due", portalUrl: "/api/billing/portal" },
      { status: 402 }
    );
  }

  // none or cancelled — no access
  return NextResponse.json(
    { error: "Subscription required", portalUrl: "/api/billing/portal" },
    { status: 402 }
  );
}
