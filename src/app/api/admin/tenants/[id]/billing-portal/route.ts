import { NextResponse } from "next/server";
import Stripe from "stripe";
import { isSuperAdmin, getActorContext } from "@/lib/auth";
import { getTenantConfig } from "@/lib/tenants";
import { logAuditEvent } from "@/lib/storage";
import { trackError } from "@/lib/monitoring";

/**
 * Generates a Stripe Customer Portal session URL for a specific tenant so the
 * operator can view invoices, payment method, and cancel/manage the sub via
 * Stripe's hosted UI.
 *
 * The existing /api/billing/portal route is gated to the TENANT'S own session
 * (requireTenantPermission → reads tenant from request headers). This wrapper
 * is operator-only (super-admin) and resolves the tenant from the URL param,
 * so the operator can open the portal for any client.
 *
 * POST — no body required. Returns { portalUrl: string }. Super-admin only.
 */

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

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

  const { id } = await params;
  const config = await getTenantConfig(id);
  if (!config) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  if (!config.stripeCustomerId) {
    return NextResponse.json(
      { error: "This client has no Stripe customer — they have not subscribed yet." },
      { status: 400 },
    );
  }

  const stripe = getStripe();
  const origin = getRequestOrigin(req);

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: config.stripeCustomerId,
      // Return the operator back to this client's admin detail page.
      return_url: `${origin}/admin/clients/${id}`,
    });

    await logAuditEvent({
      tenant: id,
      action: "billing.portal-link.generated",
      targetType: "tenant",
      targetId: id,
      actor: await getActorContext(id),
      metadata: {},
    }).catch(() => {});

    return NextResponse.json({ portalUrl: session.url });
  } catch (err) {
    trackError(err, { op: "admin.billing.portal", tenantId: id });
    return NextResponse.json({ error: "Could not open the Stripe billing portal" }, { status: 502 });
  }
}
