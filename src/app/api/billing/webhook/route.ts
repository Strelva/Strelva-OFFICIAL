import { NextResponse } from "next/server";
import Stripe from "stripe";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-03-31.basil" as Stripe.LatestApiVersion,
  });
}

/** Handles Stripe webhook events for REB subscription lifecycle.
 *
 *  Note: subscriptionStatus lives in src/lib/tenants.ts as static config.
 *  For a fully dynamic system, move tenant config to a database.
 *  At <20 clients, updating the config and redeploying is acceptable.
 *  This webhook logs events so Laney can act on them manually. */
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
      console.log(`[billing] Invoice paid for tenant: ${tenantId}`);
      // Subscription is healthy — no action needed at <20 clients
      break;

    case "invoice.payment_failed":
      console.error(`[billing] Payment FAILED for tenant: ${tenantId}. Action required.`);
      // Notify via Slack if configured
      if (process.env.SLACK_WEBHOOK_URL) {
        fetch(process.env.SLACK_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: `⚠️ Payment failed for tenant *${tenantId}*. Check Stripe dashboard.`,
          }),
        }).catch(() => {});
      }
      break;

    case "customer.subscription.deleted":
      console.log(`[billing] Subscription cancelled for tenant: ${tenantId}`);
      if (process.env.SLACK_WEBHOOK_URL) {
        fetch(process.env.SLACK_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: `🚨 Subscription cancelled for tenant *${tenantId}*. Update tenants.ts and redeploy.`,
          }),
        }).catch(() => {});
      }
      break;

    default:
      // Unhandled event type — ignore
      break;
  }

  return NextResponse.json({ received: true });
}
