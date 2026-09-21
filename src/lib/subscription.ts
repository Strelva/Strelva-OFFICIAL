import { NextResponse } from "next/server";
import { isDevAccessBypassEnabled } from "./dev-access";
import { getTenantConfig } from "./tenants";
import { resolveBillingType } from "./billing-type";

type SubscriptionStatus = "active" | "trialing" | "past_due" | "cancelled" | "none";

/** Grace period for past_due status in days. After this, access is blocked. */
const PAST_DUE_GRACE_DAYS = 3;

/**
 * Admin-side billing is "on" only when STRIPE_SCAFFOLD_PRICE_ID is configured.
 * If recurring billing is deliberately disabled, subscription gates
 * short-circuit to "active" so existing tenants are not unexpectedly locked
 * out. This fallback is not a public free-site offer.
 */
export function isBillingEnabled(): boolean {
  return Boolean(process.env.STRIPE_SCAFFOLD_PRICE_ID);
}

/**
 * Tenants grandfathered past the subscription gate, from
 * STRIPE_BILLING_GRANDFATHER_TENANTS (comma-separated tenant ids).
 * Inert while billing is off (the gate short-circuits before this is read).
 * Set it in the SAME deploy that sets STRIPE_SCAFFOLD_PRICE_ID, listing all
 * existing tenants, so nobody gets 402'd the moment billing flips on.
 */
let grandfatherCache: { raw: string; set: Set<string> } | null = null;

function getGrandfatheredTenants(): Set<string> {
  const raw = process.env.STRIPE_BILLING_GRANDFATHER_TENANTS || "";
  if (grandfatherCache && grandfatherCache.raw === raw) return grandfatherCache.set;
  const set = new Set(
    raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
  );
  grandfatherCache = { raw, set };
  return set;
}

/** A grandfathered tenant has full access but pays $0 — never counts as revenue. */
export function isGrandfathered(tenant: string): boolean {
  return getGrandfatheredTenants().has(tenant);
}

let warnedEmptyGrandfather = false;

export async function getEffectiveSubscriptionStatus(tenant: string): Promise<SubscriptionStatus> {
  if (isDevAccessBypassEnabled()) return "active";
  if (!isBillingEnabled()) return "active";

  const grandfathered = getGrandfatheredTenants();
  // Cliff foot-gun guard: billing on + an empty grandfather list means every
  // pre-existing tenant without an active subscription gets 402'd. check:prod
  // enforces this at deploy time; warn loudly at runtime too in case it's ever
  // reached (e.g. the env was cleared post-deploy).
  if (grandfathered.size === 0 && !warnedEmptyGrandfather) {
    warnedEmptyGrandfather = true;
    console.warn(
      "[subscription] Billing is ENABLED but STRIPE_BILLING_GRANDFATHER_TENANTS is empty — existing tenants without an active subscription will be 402'd. Set the grandfather list in the same deploy that enables billing."
    );
  }
  if (grandfathered.has(tenant)) {
    return "active";
  }

  const config = await getTenantConfig(tenant);
  if (config?.planOverride === "founder_comp") {
    return "active";
  }
  // A comped case study is fully set up and must have access. This is the
  // first-class replacement for the legacy founder_comp flag (both operator
  // write surfaces set billingType, not planOverride) — the gate has to honor
  // it or a deliberately-comped client 402s. resolveBillingType also maps a
  // legacy founder_comp row to case_study, so this subsumes the check above.
  if (config && resolveBillingType(config) === "case_study") {
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
