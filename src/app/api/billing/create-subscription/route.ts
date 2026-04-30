import { NextResponse } from "next/server";
import Stripe from "stripe";
import { isSuperAdmin } from "@/lib/auth";
import { getTenantConfig, updateTenant } from "@/lib/tenants";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-03-31.basil" as Stripe.LatestApiVersion,
  });
}

/** Super-admin creates a $149/mo subscription checkout for a client tenant. */
export async function POST(req: Request) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const SCAFFOLD_MONTHLY_PRICE = process.env.STRIPE_SCAFFOLD_PRICE_ID;
  if (!process.env.STRIPE_SECRET_KEY || !SCAFFOLD_MONTHLY_PRICE) {
    return NextResponse.json(
      { error: "Stripe not configured. Set STRIPE_SECRET_KEY and STRIPE_SCAFFOLD_PRICE_ID." },
      { status: 500 }
    );
  }

  const stripe = getStripe();
  const { tenantId, customerEmail, customerName } = await req.json();

  if (!tenantId || !customerEmail) {
    return NextResponse.json(
      { error: "tenantId and customerEmail are required" },
      { status: 400 }
    );
  }

  const tenantConfig = await getTenantConfig(tenantId);
  if (!tenantConfig) {
    return NextResponse.json({ error: `Unknown tenant: ${tenantId}` }, { status: 400 });
  }

  // Reuse existing Stripe customer or create one
  let customerId = tenantConfig.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: customerEmail,
      name: customerName || tenantConfig.ownerName,
      metadata: { tenantId },
    });
    customerId = customer.id;
    // Persist the new Stripe customer ID to tenant config
    await updateTenant(tenantId, { stripeCustomerId: customerId });
  }

  const origin = req.headers.get("origin") || "https://scaffoldweb.com";

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: SCAFFOLD_MONTHLY_PRICE, quantity: 1 }],
    success_url: `${origin}/admin?subscription=success&tenant=${tenantId}`,
    cancel_url: `${origin}/admin?subscription=cancelled&tenant=${tenantId}`,
    metadata: { tenantId },
  });

  return NextResponse.json({
    checkoutUrl: session.url,
    stripeCustomerId: customerId,
  });
}
