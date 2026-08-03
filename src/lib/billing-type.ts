/**
 * Billing classification for managed clients.
 *
 * A tenant's `billingType` is the operator-set source of truth for how a client
 * is billed. This module resolves it (with back-compat for legacy rows that only
 * have subscriptionStatus/subscriptionPlan/planOverride), decides whether billing
 * is CONFIGURED (the only "none" case is a real open item), and computes the
 * monthly amount for MRR.
 *
 * Product note: billing being unconfigured is the ONLY billing state that should
 * flag a managed site. A client on a tier, a custom amount, or a comped case study
 * is fully set up — do not treat "no Stripe subscription" alone as a problem, since
 * many managed clients are billed off-platform (custom) or free (case study).
 */
import type { BillingType, CommercialPlanKey } from "@/lib/types";

/** Published monthly price per tier, in cents. */
export const TIER_PRICE_CENTS: Record<CommercialPlanKey, number> = {
  presence: 9900,
  growth: 19900,
  scale: 49900,
};

const TIER_LABEL: Record<CommercialPlanKey, string> = {
  presence: "Presence",
  growth: "Growth",
  scale: "Scale",
};

/** The billing-relevant fields, loosely typed so both TenantConfig and lighter
 *  projections (e.g. the portfolio MRR shape) satisfy it. */
export interface BillingFields {
  billingType?: BillingType | null;
  planOverride?: "founder_comp" | null;
  subscriptionPlan?: CommercialPlanKey | null;
  subscriptionStatus?: string | null;
  planMonthlyCents?: number | null;
}

/**
 * The tenant's effective billing type. Prefers the explicit `billingType`; falls
 * back to deriving one from legacy fields so pre-migration rows still read
 * sensibly. A row with nothing set resolves to "none".
 */
export function resolveBillingType(tenant: BillingFields): BillingType {
  if (tenant.billingType) return tenant.billingType;
  // Back-compat derivation for rows written before billingType existed.
  if (tenant.planOverride === "founder_comp") return "case_study";
  if (tenant.subscriptionPlan) return "tier";
  if (tenant.subscriptionStatus === "active" || tenant.subscriptionStatus === "trialing") return "tier";
  if ((tenant.planMonthlyCents ?? 0) > 0) return "custom";
  return "none";
}

/**
 * True when a client's billing is set up (tier / custom / case_study). Only
 * "none" is unconfigured. This is what launch/managed readiness should gate on —
 * NOT the presence of a live Stripe subscription.
 */
export function isBillingConfigured(tenant: BillingFields): boolean {
  return resolveBillingType(tenant) !== "none";
}

/**
 * Monthly amount for this tenant in cents, for MRR. Tier → the tier price;
 * custom → the entered amount; case_study/none → 0.
 */
export function billingMonthlyCents(tenant: BillingFields): number {
  const type = resolveBillingType(tenant);
  if (type === "tier") {
    const plan = tenant.subscriptionPlan;
    if (plan && TIER_PRICE_CENTS[plan] != null) return TIER_PRICE_CENTS[plan];
    if ((tenant.planMonthlyCents ?? 0) > 0) return tenant.planMonthlyCents!;
    // A tier client without a recorded plan key (e.g. a legacy active Stripe sub)
    // defaults to the anchor Growth price.
    return TIER_PRICE_CENTS.growth;
  }
  if (type === "custom") return tenant.planMonthlyCents ?? 0;
  return 0; // case_study, none
}

/** Short human label for the billing state, for admin display. */
export function billingLabel(tenant: BillingFields): string {
  const type = resolveBillingType(tenant);
  switch (type) {
    case "tier": {
      const plan = tenant.subscriptionPlan;
      const price = billingMonthlyCents(tenant);
      const label = plan ? TIER_LABEL[plan] : "Tier";
      return price ? `${label} · $${Math.round(price / 100)}/mo` : label;
    }
    case "custom": {
      const cents = tenant.planMonthlyCents ?? 0;
      return cents ? `Custom · $${Math.round(cents / 100)}/mo` : "Custom (amount not set)";
    }
    case "case_study":
      return "Legacy case study";
    case "none":
    default:
      return "No plan set";
  }
}
