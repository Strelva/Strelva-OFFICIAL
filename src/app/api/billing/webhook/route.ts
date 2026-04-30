import { NextResponse } from "next/server";
import Stripe from "stripe";
import { updateTenant } from "@/lib/tenants";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-03-31.basil" as Stripe.LatestApiVersion,
  });
}

// Simple in-memory store for processed event IDs (idempotency)
// In production with multiple instances, use Redis or database
const processedEvents = new Set<string>();
const MAX_PROCESSED_EVENTS = 10000;

export async function POST(req: Request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[billing webhook] STRIPE_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const stripe = getStripe();
  const body = await req.text();
  const sig = req.headers.get("stripe-signature") || "";

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error("[billing webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Idempotency: skip duplicate events
  if (processedEvents.has(event.id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  // Prevent unbounded memory growth
  if (processedEvents.size >= MAX_PROCESSED_EVENTS) {
    const iterator = processedEvents.values();
    for (let i = 0; i < 1000; i++) {
      processedEvents.delete(iterator.next().value as string);
    }
  }
  processedEvents.add(event.id);

  const obj = event.data.object as unknown as { metadata?: Record<string, string> };
  const tenantId = obj.metadata?.tenantId ?? null;

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as unknown as {
        metadata?: Record<string, string>;
        subscription?: string;
      };
      const sessionTenantId = session.metadata?.tenantId;
      if (sessionTenantId) {
        await updateTenant(sessionTenantId, { subscriptionStatus: "active" });
      }
      break;
    }

    case "invoice.paid":
      if (tenantId) await updateTenant(tenantId, {
        subscriptionStatus: "active",
        subscriptionPastDueSince: undefined, // Clear grace period timestamp
      });
      break;

    case "invoice.payment_failed":
      if (tenantId) await updateTenant(tenantId, {
        subscriptionStatus: "past_due",
        subscriptionPastDueSince: new Date().toISOString(),
      });
      if (process.env.SLACK_WEBHOOK_URL) {
        fetch(process.env.SLACK_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: `Payment failed for tenant *${tenantId}*. Check Stripe dashboard.`,
          }),
        }).catch(() => {});
      }
      break;

    case "customer.subscription.deleted":
      if (tenantId) await updateTenant(tenantId, { subscriptionStatus: "cancelled" });
      if (process.env.SLACK_WEBHOOK_URL) {
        fetch(process.env.SLACK_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: `Subscription cancelled for tenant *${tenantId}*.`,
          }),
        }).catch(() => {});
      }
      break;

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
