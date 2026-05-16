import Stripe from "stripe";
import { getTenantDashboardUrl } from "./tenant-urls";
import { updateTenant } from "./tenants";
import type { TenantConfig } from "./types";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-03-31.basil" as Stripe.LatestApiVersion,
  });
}

export interface TenantSubscriptionCheckoutInput {
  tenant: TenantConfig;
  customerEmail?: string;
  customerName?: string;
  successUrl?: string;
  cancelUrl?: string;
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
  const priceId = process.env.STRIPE_SCAFFOLD_PRICE_ID;
  if (!process.env.STRIPE_SECRET_KEY || !priceId) {
    throw new BillingConfigurationError(
      "Stripe not configured. Set STRIPE_SECRET_KEY and STRIPE_SCAFFOLD_PRICE_ID.",
    );
  }

  const stripe = getStripe();
  const tenant = input.tenant;
  let customerId = tenant.stripeCustomerId;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: input.customerEmail || tenant.ownerEmail,
      name: input.customerName || tenant.ownerName,
      metadata: { tenantId: tenant.id },
    });
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
    metadata: { tenantId: tenant.id },
    subscription_data: {
      metadata: { tenantId: tenant.id },
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
