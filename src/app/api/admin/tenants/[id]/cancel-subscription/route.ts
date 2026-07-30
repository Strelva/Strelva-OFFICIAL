import { NextResponse } from "next/server";
import Stripe from "stripe";
import { isSuperAdmin, getActorContext } from "@/lib/auth";
import { getTenantConfig } from "@/lib/tenants";
import { logAuditEvent } from "@/lib/storage";
import { trackError } from "@/lib/monitoring";

/**
 * Soft-cancels a tenant's Stripe subscription by setting cancel_at_period_end=true.
 * The client retains access until the current billing period ends — no immediate
 * cut-off. Stripe fires a customer.subscription.deleted webhook at period end, which
 * the billing webhook handles to write subscriptionStatus="cancelled".
 *
 * This is a SOFT cancel only. Hard immediate deletion is intentionally not supported
 * here; use the Stripe portal or Stripe dashboard for that edge case.
 *
 * POST — no body required. Returns { cancelled: true, cancelAt: string (ISO) }.
 * Super-admin only.
 */

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-03-25.dahlia" as Stripe.LatestApiVersion,
  });
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  if (!config.stripeSubscriptionId) {
    return NextResponse.json(
      { error: "This client has no active Stripe subscription on record." },
      { status: 400 },
    );
  }

  const stripe = getStripe();

  try {
    const subscription = await stripe.subscriptions.update(config.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    const cancelAt =
      subscription.cancel_at != null
        ? new Date(subscription.cancel_at * 1000).toISOString()
        : null;

    await logAuditEvent({
      tenant: id,
      action: "billing.subscription.cancel-scheduled",
      targetType: "tenant",
      targetId: id,
      actor: await getActorContext(id),
      metadata: {
        subscriptionId: config.stripeSubscriptionId,
        cancelAt,
      },
    }).catch(() => {});

    return NextResponse.json({ cancelled: true, cancelAt });
  } catch (err) {
    trackError(err, { op: "admin.billing.cancel-subscription", tenantId: id });
    return NextResponse.json({ error: "Could not schedule cancellation in Stripe" }, { status: 502 });
  }
}
