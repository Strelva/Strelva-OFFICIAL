import { NextResponse } from "next/server";
import Stripe from "stripe";
import { updateTenant } from "@/lib/tenants";
import { getRedis } from "@/lib/redis";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-03-31.basil" as Stripe.LatestApiVersion,
  });
}

// Simple in-memory store for processed event IDs (idempotency)
// In production with multiple instances, use Redis or database
const processedEvents = new Set<string>();
const MAX_PROCESSED_EVENTS = 10000;
const PROCESSED_EVENT_TTL_SECONDS = 60 * 60 * 24 * 30;

async function claimStripeEvent(eventId: string): Promise<boolean> {
  const redis = getRedis();
  if (redis) {
    try {
      const key = `stripe:event:${eventId}`;
      const claimed = await redis.set(key, "1", {
        nx: true,
        ex: PROCESSED_EVENT_TTL_SECONDS,
      });
      return claimed === "OK";
    } catch {
      // Fall through to local process memory if Redis is unavailable.
    }
  }

  if (processedEvents.has(eventId)) return false;

  if (processedEvents.size >= MAX_PROCESSED_EVENTS) {
    const iterator = processedEvents.values();
    for (let i = 0; i < 1000; i++) {
      const next = iterator.next();
      if (next.done) break;
      processedEvents.delete(next.value);
    }
  }
  processedEvents.add(eventId);
  return true;
}

function extractTenantId(object: unknown): string | null {
  if (!object || typeof object !== "object") return null;
  const obj = object as {
    metadata?: Record<string, string>;
    subscription_details?: { metadata?: Record<string, string> };
    lines?: { data?: Array<{ metadata?: Record<string, string> }> };
  };

  return (
    obj.metadata?.tenantId ||
    obj.subscription_details?.metadata?.tenantId ||
    obj.lines?.data?.find((line) => line.metadata?.tenantId)?.metadata?.tenantId ||
    null
  );
}

async function applyTenantSubscriptionStatus(
  tenantId: string | null,
  patch: Parameters<typeof updateTenant>[1],
  event: Stripe.Event
) {
  if (!tenantId) {
    console.warn(`[billing webhook] ${event.type} missing tenantId metadata`);
    return;
  }

  const redis = getRedis();
  if (redis) {
    try {
      const key = `stripe:tenant:last_event:${tenantId}`;
      const lastCreated = await redis.get<number>(key);
      if (typeof lastCreated === "number" && event.created < lastCreated) {
        console.warn(`[billing webhook] Ignoring out-of-order ${event.type} for ${tenantId}`);
        return;
      }
      await redis.set(key, event.created);
    } catch {
      // Redis ordering guard failure should not block Stripe processing.
    }
  }

  await updateTenant(tenantId, patch);
}

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

  const claimed = await claimStripeEvent(event.id);
  if (!claimed) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const tenantId = extractTenantId(event.data.object);

  switch (event.type) {
    case "checkout.session.completed": {
      await applyTenantSubscriptionStatus(tenantId, { subscriptionStatus: "active" }, event);
      break;
    }

    case "invoice.paid":
      await applyTenantSubscriptionStatus(tenantId, {
        subscriptionStatus: "active",
        subscriptionPastDueSince: undefined, // Clear grace period timestamp
      }, event);
      break;

    case "invoice.payment_failed":
      await applyTenantSubscriptionStatus(tenantId, {
        subscriptionStatus: "past_due",
        subscriptionPastDueSince: new Date().toISOString(),
      }, event);
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
      await applyTenantSubscriptionStatus(tenantId, { subscriptionStatus: "cancelled" }, event);
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
