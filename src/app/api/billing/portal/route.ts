import { NextResponse } from "next/server";
import Stripe from "stripe";
import { verifyAuth, requireTenantAccess } from "@/lib/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getTenantConfig } from "@/lib/tenants";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-03-31.basil" as Stripe.LatestApiVersion,
  });
}

/** Generates a Stripe Customer Portal link so clients can manage their billing. */
export async function POST(req: Request) {
  const authed = await verifyAuth();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

  const tenant = await getTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;

  const config = await getTenantConfig(tenant);

  if (!config?.stripeCustomerId) {
    return NextResponse.json(
      { error: "No billing account found for this tenant" },
      { status: 404 }
    );
  }

  const stripe = getStripe();
  const origin = req.headers.get("origin") || "https://scaffoldweb.com";

  const session = await stripe.billingPortal.sessions.create({
    customer: config.stripeCustomerId,
    return_url: `${origin}/dashboard`,
  });

  return NextResponse.json({ portalUrl: session.url });
}
