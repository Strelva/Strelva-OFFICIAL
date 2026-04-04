import { NextResponse } from "next/server";
import Stripe from "stripe";
import { setSubscriptionOverride } from "@/lib/storage";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-03-31.basil" as Stripe.LatestApiVersion,
  });
}

export async function POST(req: Request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
  const body = await req.text();
  const sig = req.headers.get("stripe-signature") || "";

  let event: Stripe.Event;

  try {
    event = webhookSecret
      ? stripe.webhooks.constructEvent(body, sig, webhookSecret)
      : JSON.parse(body) as Stripe.Event;
  } catch (err) {
    console.error("[billing webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const obj = event.data.object as unknown as { metadata?: Record<string, string> };
  const tenantId = obj.metadata?.tenantId ?? null;

  switch (event.type) {
    case "invoice.paid":
      if (tenantId) await setSubscriptionOverride(tenantId, "active");
      break;

    case "invoice.payment_failed":
      if (tenantId) await setSubscriptionOverride(tenantId, "past_due");
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
      if (tenantId) await setSubscriptionOverride(tenantId, "cancelled");
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
