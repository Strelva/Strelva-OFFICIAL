import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/auth";
import { readJsonObject } from "@/lib/request-body";
import { getTenantConfig } from "@/lib/tenants";
import {
  BillingConfigurationError,
  createTenantSubscriptionCheckout,
} from "@/lib/billing";

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** Super-admin creates the monthly Strelva subscription checkout for a client tenant. */
export async function POST(req: Request) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_SCAFFOLD_PRICE_ID) {
    return NextResponse.json(
      { error: "Stripe not configured. Set STRIPE_SECRET_KEY and STRIPE_SCAFFOLD_PRICE_ID." },
      { status: 500 }
    );
  }

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

  try {
    // No successUrl/cancelUrl override: the CLIENT pays this checkout, so they
    // must land back on THEIR OWN dashboard. createTenantSubscriptionCheckout
    // defaults to getTenantDashboardUrl(tenant, "/dashboard?checkout=success").
    // The previous `${origin}/admin?...` sent the paying client to the operator
    // admin host, where they have no access — a Forbidden on the "you're
    // subscribed" moment.
    const result = await createTenantSubscriptionCheckout({
      tenant: tenantConfig,
      customerEmail,
      customerName: normalizedCustomerName || undefined,
    });

    return NextResponse.json({
      checkoutUrl: result.checkoutUrl,
      stripeCustomerId: result.stripeCustomerId,
    });
  } catch (err) {
    if (err instanceof BillingConfigurationError) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    throw err;
  }
}
