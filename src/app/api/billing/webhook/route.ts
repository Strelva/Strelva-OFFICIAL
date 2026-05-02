import { NextResponse } from "next/server";
import Stripe from "stripe";
import { updateTenant } from "@/lib/tenants";
import { getRedis } from "@/lib/redis";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-03-31.basil" as Stripe.LatestApiVersion,
  });
}

const PROCESSED_EVENT_TTL_SECONDS = 60 * 60 * 24 * 30;
const PROCESSING_STALE_MINUTES = 5;

interface EventRecord {
  status: "processing" | "processed" | "failed";
  startedAt?: number;
}

async function claimStripeEvent(eventId: string): Promise<"claimed" | "duplicate" | "retry"> {
  const redis = getRedis();
  if (!redis) {
    return "claimed";
  }

  const key = `stripe:event:${eventId}`;
  const lockKey = `stripe:event:lock:${eventId}`;

  try {
    const record: EventRecord = { status: "processing", startedAt: Date.now() };
    const claimed = await redis.set(key, record, {
      nx: true,
      ex: PROCESSED_EVENT_TTL_SECONDS,
    });

    if (claimed === "OK") {
      return "claimed";
    }

    const existing = await redis.get<EventRecord>(key);

    if (existing?.status === "processed") {
      return "duplicate";
    }

    if (existing?.status === "processing") {
      const staleThreshold = Date.now() - PROCESSING_STALE_MINUTES * 60 * 1000;
      if (existing.startedAt && existing.startedAt > staleThreshold) {
        return "retry";
      }

      const gotLock = await redis.set(lockKey, "1", { nx: true, ex: 60 });
      if (gotLock === "OK") {
        await redis.set(key, record, { ex: PROCESSED_EVENT_TTL_SECONDS });
        return "claimed";
      }
      return "retry";
    }

    if (existing?.status === "failed") {
      const gotLock = await redis.set(lockKey, "1", { nx: true, ex: 60 });
      if (gotLock === "OK") {
        await redis.set(key, record, { ex: PROCESSED_EVENT_TTL_SECONDS });
        return "claimed";
      }
      return "retry";
    }

    return "retry";
  } catch {
    return "claimed";
  }
}

async function markEventProcessed(eventId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const key = `stripe:event:${eventId}`;
  try {
    const record: EventRecord = { status: "processed" };
    await redis.set(key, record, { ex: PROCESSED_EVENT_TTL_SECONDS });
  } catch {}
}

async function markEventFailed(eventId: string, error: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const key = `stripe:event:${eventId}`;
  const errorKey = `stripe:event:error:${eventId}`;
  try {
    const record: EventRecord = { status: "failed" };
    await redis.set(key, record, { ex: PROCESSED_EVENT_TTL_SECONDS });
    await redis.set(errorKey, error, { ex: PROCESSED_EVENT_TTL_SECONDS });
  } catch {}
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

  const claimResult = await claimStripeEvent(event.id);
  if (claimResult === "duplicate") {
    return NextResponse.json({ received: true, duplicate: true });
  }
  if (claimResult === "retry") {
    return NextResponse.json({ received: true, retry: true });
  }

  const tenantId = extractTenantId(event.data.object);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        await applyTenantSubscriptionStatus(tenantId, { subscriptionStatus: "active" }, event);
        break;
      }

      case "invoice.paid":
        await applyTenantSubscriptionStatus(tenantId, {
          subscriptionStatus: "active",
          subscriptionPastDueSince: undefined,
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

    await markEventProcessed(event.id);
    return NextResponse.json({ received: true });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    await markEventFailed(event.id, errorMsg);
    console.error(`[billing webhook] Failed to process ${event.type} for ${tenantId}: ${errorMsg}`);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
