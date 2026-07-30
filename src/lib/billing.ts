import Stripe from "stripe";
import { getTenantDashboardUrl } from "./tenant-urls";
import { updateTenant } from "./tenants";
import type { TenantConfig } from "./types";
import type { CommercialPlanKey } from "./types";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-03-25.dahlia" as Stripe.LatestApiVersion,
  });
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
  /** Free trial length in days, wired to subscription_data.trial_period_days (e.g. Door 1's 3 months included). */
  trialPeriodDays?: number;
}

export interface TenantSubscriptionCheckoutResult {
  checkoutUrl: string;
  stripeCustomerId: string;
}

export class BillingConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingConfigurationError";
  }
}

export async function createTenantSubscriptionCheckout(
  input: TenantSubscriptionCheckoutInput,
): Promise<TenantSubscriptionCheckoutResult> {
  const priceId = input.priceId || process.env.STRIPE_SCAFFOLD_PRICE_ID;
  if (!process.env.STRIPE_SECRET_KEY || !priceId) {
    throw new BillingConfigurationError(
      "Stripe not configured. Set STRIPE_SECRET_KEY and STRIPE_SCAFFOLD_PRICE_ID.",
    );
  }

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
      ...(input.trialPeriodDays && input.trialPeriodDays > 0
        ? { trial_period_days: input.trialPeriodDays }
        : {}),
    },
    allow_promotion_codes: true,
  });

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL.");
  }

  return {
    checkoutUrl: session.url,
    stripeCustomerId: customerId,
  };
}
