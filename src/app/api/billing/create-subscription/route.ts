import { NextResponse } from "next/server";
import Stripe from "stripe";
import { isSuperAdmin } from "@/lib/auth";
import { readJsonObject } from "@/lib/request-body";
import { getTenantConfig, updateTenant } from "@/lib/tenants";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-03-31.basil" as Stripe.LatestApiVersion,
  });
}

function getRequestOrigin(req: Request): string {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || url.host;
  const proto = req.headers.get("x-forwarded-proto") || url.protocol.replace(":", "") || "https";
  return `${proto}://${host}`;
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
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
  const body = await readJsonObject(req);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { tenantId, customerEmail: rawCustomerEmail, customerName } = body;
  const normalizedTenantId = typeof tenantId === "string" ? tenantId.trim() : "";
  const customerEmail = normalizeEmail(rawCustomerEmail);
  const normalizedCustomerName = typeof customerName === "string" ? customerName.trim() : "";

  if (!normalizedTenantId || !customerEmail) {
    return NextResponse.json(
      { error: "tenantId and customerEmail are required" },
      { status: 400 }
    );
  }

  const tenantConfig = await getTenantConfig(normalizedTenantId);
  if (!tenantConfig) {
    return NextResponse.json({ error: `Unknown tenant: ${normalizedTenantId}` }, { status: 400 });
  }

  // Reuse existing Stripe customer or create one
  let customerId = tenantConfig.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: customerEmail,
      name: normalizedCustomerName || tenantConfig.ownerName,
      metadata: { tenantId: normalizedTenantId },
    });
    customerId = customer.id;
    // Persist the new Stripe customer ID to tenant config
    await updateTenant(normalizedTenantId, { stripeCustomerId: customerId });
  }

  const origin = getRequestOrigin(req);

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: SCAFFOLD_MONTHLY_PRICE, quantity: 1 }],
    success_url: `${origin}/admin?subscription=success&tenant=${normalizedTenantId}`,
    cancel_url: `${origin}/admin?subscription=cancelled&tenant=${normalizedTenantId}`,
    metadata: { tenantId: normalizedTenantId },
  });

  return NextResponse.json({
    checkoutUrl: session.url,
    stripeCustomerId: customerId,
  });
}
