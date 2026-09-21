import { NextResponse } from "next/server";
import { getTenantFromHeaders } from "@/lib/tenant";
import { requireTenantPermission, getActorContext } from "@/lib/auth";
import { getTenantConfig } from "@/lib/tenants";
import {
  BillingConfigurationError,
  createTenantSubscriptionCheckout,
} from "@/lib/billing";

/**
 * Owner self-serve: the signed-in owner of a tenant starts their OWN monthly
 * management subscription at go-live. The separate build quote/payment is not
 * represented by this route. Scoped to the caller's tenant via
 * requireTenantPermission; the Stripe customer email comes from their auth, not request
 * input. Super admins create checkouts for other tenants via
 * /api/billing/create-subscription — this route is only ever the caller's own.
 */
export async function POST() {
  const tenant = await getTenantFromHeaders();
  // Starting the paid plan is an owner action (matches billing/portal +
  // offboarding), not any-member — a viewer/editor must not mint a checkout.
  const denied = await requireTenantPermission(tenant, "billing:manage");
  if (denied) return denied;

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_SCAFFOLD_PRICE_ID) {
    return NextResponse.json(
      { error: "Billing isn't set up yet — reach out to Strelva and we'll get you going." },
      { status: 503 },
    );
  }

  const config = await getTenantConfig(tenant);
  if (!config) {
    return NextResponse.json({ error: "Unknown tenant" }, { status: 400 });
  }

  const actor = await getActorContext(tenant);
  const customerEmail =
    actor.email && actor.email.includes("@") ? actor.email : config.ownerEmail || undefined;

  try {
    const result = await createTenantSubscriptionCheckout({
      tenant: config,
      customerEmail,
    });
    return NextResponse.json({ checkoutUrl: result.checkoutUrl });
  } catch (err) {
    if (err instanceof BillingConfigurationError) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    throw err;
  }
}
