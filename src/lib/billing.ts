import Stripe from "stripe";
import { getTenantDashboardUrl } from "./tenant-urls";
import { updateTenant } from "./tenants";
import type { TenantConfig } from "./types";
import type { CommercialPlanKey } from "./types";

/**
 * Single source of truth for the Stripe API version used across all billing
 * routes. Import and pass to every `new Stripe(key, { apiVersion })` call so
 * a version bump is a one-line change here, not a 7-file search.
 */
export const STRIPE_API_VERSION = "2026-03-25.dahlia" as Stripe.LatestApiVersion;

export class BillingConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingConfigurationError";
  }
}

/**
 * Construct a Stripe client. Throws a BillingConfigurationError (not the `!`
 * assertion's TypeError) when STRIPE_SECRET_KEY is absent, so callers that
 * forget to guard get a legible error rather than a confusing null-deref crash.
 */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new BillingConfigurationError(
      "Stripe not configured. Set STRIPE_SECRET_KEY.",
    );
  }
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION });
}

export interface TenantSubscriptionCheckoutInput {
  tenant: TenantConfig;
  customerEmail?: string;
  customerName?: string;
  successUrl?: string;
  cancelUrl?: string;
  /** Override the recurring price. Defaults to STRIPE_SCAFFOLD_PRICE_ID. */
  priceId?: string;
  planKey?: CommercialPlanKey;
  planMonthlyCents?: number;
  planCurrency?: string;
}

export interface TenantSubscriptionCheckoutResult {
  checkoutUrl: string;
  stripeCustomerId: string;
}

export async function createTenantSubscriptionCheckout(
  input: TenantSubscriptionCheckoutInput,
): Promise<TenantSubscriptionCheckoutResult> {
  const priceId = input.priceId || process.env.STRIPE_SCAFFOLD_PRICE_ID;
  if (!priceId) {
    throw new BillingConfigurationError(
      "Stripe not configured. Set STRIPE_SCAFFOLD_PRICE_ID.",
    );
  }

  // getStripe() throws BillingConfigurationError when STRIPE_SECRET_KEY is absent.
  const stripe = getStripe();
  const tenant = input.tenant;
  let customerId = tenant.stripeCustomerId;

  if (!customerId) {
    const customer = await stripe.customers.create(
      {
        email: input.customerEmail || tenant.ownerEmail,
        name: input.customerName || tenant.ownerName,
        metadata: { tenantId: tenant.id },
      },
      // Idempotency key keyed on the tenant — two concurrent checkouts for the
      // same tenant return the SAME Stripe customer instead of creating a
      // duplicate (the second updateTenant would orphan the first).
      { idempotencyKey: `tenant-customer-${tenant.id}` },
    );
    customerId = customer.id;
    await updateTenant(tenant.id, { stripeCustomerId: customerId });
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    client_reference_id: tenant.id,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url:
      input.successUrl || getTenantDashboardUrl(tenant, "/dashboard?checkout=success"),
    cancel_url:
      input.cancelUrl || getTenantDashboardUrl(tenant, "/dashboard/settings?checkout=cancelled"),
    metadata: {
      tenantId: tenant.id,
      ...(input.planKey ? { planKey: input.planKey } : {}),
      ...(input.planMonthlyCents !== undefined
        ? { planMonthlyCents: String(input.planMonthlyCents) }
        : {}),
      planCurrency: input.planCurrency ?? "usd",
    },
    subscription_data: {
      metadata: {
        tenantId: tenant.id,
        ...(input.planKey ? { planKey: input.planKey } : {}),
        ...(input.planMonthlyCents !== undefined
          ? { planMonthlyCents: String(input.planMonthlyCents) }
          : {}),
        planCurrency: input.planCurrency ?? "usd",
      },
    },
  });

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL.");
  }

  return {
    checkoutUrl: session.url,
    stripeCustomerId: customerId,
  };
}
