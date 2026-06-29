import { NextResponse } from "next/server";
import Stripe from "stripe";
import { updateTenant, getTenantConfig } from "@/lib/tenants";
import { getRedis } from "@/lib/redis";
import { isProductionEnv } from "@/lib/production-guard";
import { addEvent } from "@/lib/events";
import { logger } from "@/lib/logger";
import { alert } from "@/lib/monitoring";
import { recordBuildPayment as recordBuildPaymentPg } from "@/lib/db/repositories";
import { dualWritePgEnabled, buildPaymentToInsert } from "@/lib/db/dual-write";

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
    if (isProductionEnv()) {
      throw new Error("[PRODUCTION] Redis required for Stripe webhook idempotency");
    }
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
  } catch (err) {
    if (isProductionEnv()) {
      throw new Error(`[PRODUCTION] Redis idempotency check failed: ${err}`);
    }
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
  } catch (err) {
    // Don't let a Redis hiccup silently erase the payment-failure trail.
    logger.error("[billing/webhook] failed to record event failure", { eventId, err });
  }
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

/**
 * Pull the subscription id off an invoice. In Stripe API v21 the top-level
 * `invoice.subscription` field was removed; it now lives on the invoice parent's
 * subscription_details. Returns undefined for one-off invoices.
 */
function extractInvoiceSubscriptionId(invoice: Stripe.Invoice): string | undefined {
  const sub = invoice.parent?.subscription_details?.subscription;
  return typeof sub === "string" ? sub : sub?.id;
}

async function applyTenantSubscriptionStatus(
  tenantId: string | null,
  patch: Parameters<typeof updateTenant>[1],
  event: Stripe.Event
) {
  if (!tenantId) {
    // A signed subscription event with no tenantId metadata is NOT retryable —
    // the event is immutable, so throwing here would 500 and trigger a 3-day
    // Stripe retry storm that fails identically every time. Alert loudly (Slack
    // + Sentry) and let the caller ack 200, same as the unknown-tenant path.
    alert("billing_webhook_missing_tenant", "high", { eventType: event.type });
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
    } catch (err) {
      // The ordering guard is best-effort and must not block Stripe processing,
      // but a Redis failure on the money path should never be silent. (Double-
      // apply is still bounded by event idempotency.)
      alert("billing_webhook_ordering_guard_failed", "medium", {
        tenantId,
        eventType: event.type,
        error: String(err),
      });
    }
  }

  const updated = await updateTenant(tenantId, patch);
  if (!updated) {
    // updateTenant returns null for an unknown id. A legitimate, signed event
    // whose tenant was renamed/deleted would otherwise silently no-op here —
    // e.g. an invoice.paid that fails to keep a paying client active. This
    // won't self-heal on retry, so alert loudly (not just console) and let the
    // caller ack the event rather than triggering a 3-day Stripe retry storm.
    alert("billing_webhook_unknown_tenant", "high", {
      tenantId,
      eventType: event.type,
    });
  }
}

/**
 * Record a one-time build payment (mode: "payment" checkout). One-time payments
 * must NOT flip subscriptionStatus — that gate is for recurring billing only.
 * The Rohlax build payment (/pay/rohlax) lands here.
 *
 * Two trails are written:
 *   1. A durable, never-expiring Redis record keyed by session id
 *      (`reb:build-payment:{sessionId}`). This is the canonical money trail —
 *      it captures EVERY completed payment, including pre-tenant lead-slug-only
 *      checkouts that have no tenantId yet, and it never prunes (unlike the
 *      90-day tenant event queue).
 *   2. When a tenantId is present, the existing tenant event so the payment
 *      shows on that tenant's activity log.
 * Plus a Slack ping so a real charge is never silent.
 */
async function recordBuildPayment(
  tenantId: string | null,
  session: Stripe.Checkout.Session,
  event: Stripe.Event
) {
  const amountTotal = typeof session.amount_total === "number" ? session.amount_total : null;
  const currency = (session.currency || "usd").toUpperCase();
  const amountLabel =
    amountTotal !== null
      ? new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountTotal / 100)
      : "unknown amount";
  const paySlug =
    session.metadata?.paySlug ?? session.metadata?.payLink ?? session.metadata?.slug ?? null;
  const leadSlug = session.metadata?.leadSlug ?? null;

  // 1. Durable money trail — written for EVERY completed payment session,
  // tenant or not, with no TTL so it outlives the event queue's 90-day prune.
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(`reb:build-payment:${session.id}`, {
        sessionId: session.id,
        stripeEventId: event.id,
        paySlug,
        leadSlug,
        tenantId,
        amountCents: amountTotal,
        currency,
        paymentIntentId:
          typeof session.payment_intent === "string" ? session.payment_intent : undefined,
        customerEmail: session.customer_details?.email ?? undefined,
        createdAt: new Date(event.created * 1000).toISOString(),
      });
    } catch (err) {
      // Never fail the webhook over the trail (the payment already succeeded in
      // Stripe), but a LOST money record must be loud, not just a console line —
      // it's the canonical record reconciliation depends on.
      alert("billing_build_payment_trail_failed", "high", {
        sessionId: session.id,
        stripeEventId: event.id,
        error: String(err),
      });
      console.error(`[billing webhook] Failed to persist build-payment record for ${session.id}: ${err}`);
    }
  }

  // 1b. Postgres shadow-write of the money trail (Phase-2 dual-write). Null-safe
  // + never throws; Redis above stays the canonical record. Gated by DUAL_WRITE_PG.
  if (dualWritePgEnabled()) {
    await recordBuildPaymentPg(
      buildPaymentToInsert({
        sessionId: session.id,
        paySlug,
        leadSlug,
        tenantId,
        amountCents: amountTotal,
        currency,
        customerEmail: session.customer_details?.email ?? undefined,
        createdAt: new Date(event.created * 1000).toISOString(),
      })
    );
  }

  // 2. Slack ping so a live charge is never silent — even pre-tenant ones.
  if (process.env.SLACK_WEBHOOK_URL) {
    const who = tenantId ?? paySlug ?? leadSlug ?? "unknown payer";
    fetch(process.env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `💸 Build payment received — ${amountLabel} (${who}). Session ${session.id}.`,
      }),
    }).catch(() => {});
  }

  // 3. Tenant event (only when we know the tenant) for the activity log.
  if (tenantId) {
    try {
      await addEvent({
        tenantId,
        source: "stripe",
        type: "build_payment",
        title: `Build payment received — ${amountLabel}`,
        body: `One-time payment of ${amountLabel} completed for ${tenantId}.`,
        status: "auto_approved",
        metadata: {
          stripeSessionId: session.id,
          stripeEventId: event.id,
          amountTotal,
          currency,
          paymentIntentId:
            typeof session.payment_intent === "string" ? session.payment_intent : undefined,
          customerEmail: session.customer_details?.email ?? undefined,
        },
      });
    } catch (err) {
      console.error(`[billing webhook] Failed to record build-payment event for ${tenantId}: ${err}`);
    }
  } else {
    console.warn(
      `[billing webhook] ${event.type} one-time payment has no tenantId yet — durable record written under reb:build-payment:${session.id}`
    );
  }
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

  // Mode guard: never let a test-mode event mutate live tenant data (or vice
  // versa). The signature only proves the event matches STRIPE_WEBHOOK_SECRET;
  // it does NOT prove live vs test. Without this, a test-mode
  // subscription.deleted / payment_failed could 402 a real paying client.
  // Ack (200) so Stripe doesn't retry a deliberately-ignored event.
  const expectLive = (process.env.STRIPE_SECRET_KEY || "").startsWith("sk_live");
  if (event.livemode !== expectLive) {
    console.warn(
      `[billing webhook] Ignoring ${event.livemode ? "live" : "test"}-mode event in ${expectLive ? "live" : "test"} deploy: ${event.type}`
    );
    return NextResponse.json({ received: true, ignored: "mode-mismatch" });
  }

  // claimStripeEvent throws if Redis is unavailable in production (idempotency
  // can't be guaranteed). That throw is OUTSIDE the processing try/catch below,
  // so without this guard it becomes an unhandled 500 + stack leak and Stripe
  // retries the same failure for 3 days. Catch it: 503 tells Stripe to retry
  // later (when Redis is back) and alerts operators to the outage.
  let claimResult: "claimed" | "duplicate" | "retry";
  try {
    claimResult = await claimStripeEvent(event.id);
  } catch (err) {
    alert("billing_webhook_idempotency_unavailable", "critical", {
      eventType: event.type,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Idempotency store unavailable, retry" }, { status: 503 });
  }
  if (claimResult === "duplicate") {
    return NextResponse.json({ received: true, duplicate: true });
  }
  if (claimResult === "retry") {
    // Another worker holds the claim (still processing, or it crashed mid-write).
    // Returning 200 would tell Stripe "done" and it would never redeliver — so a
    // crashed first attempt silently drops the event. Return 503 so Stripe
    // retries; the idempotency claim resolves to "duplicate" once the in-flight
    // attempt actually finishes, or re-claims it if that attempt died.
    return NextResponse.json({ error: "Processing in progress, retry" }, { status: 503 });
  }

  const tenantId = extractTenantId(event.data.object);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription") {
          const subscriptionId =
            typeof session.subscription === "string" ? session.subscription : undefined;
          // Reflect the subscription's ACTUAL status. A trial checkout yields a
          // "trialing" sub (no charge yet) — it must not count as active MRR. It
          // still grants dashboard access (requireActiveSubscription allows
          // trialing) and flips to "active" when the trial's first invoice.paid
          // fires. Best-effort: fall back to "active" if the lookup fails.
          let subscriptionStatus: "active" | "trialing" = "active";
          if (subscriptionId) {
            try {
              const sub = await stripe.subscriptions.retrieve(subscriptionId);
              if (sub.status === "trialing") subscriptionStatus = "trialing";
            } catch {
              // keep "active" — a paid checkout completed
            }
          }
          await applyTenantSubscriptionStatus(
            tenantId,
            {
              subscriptionStatus,
              ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
              subscriptionStartedAt: new Date(event.created * 1000).toISOString(),
            },
            event
          );
        } else if (session.mode === "payment") {
          // One-time charge, e.g. the Rohlax build payment. Do NOT flip
          // subscription status; record a build-payment trail. A mode:"setup"
          // session moves no money (amount_total is null), so it must NOT be
          // logged as a payment — skip it.
          await recordBuildPayment(tenantId, session, event);
        }
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = extractInvoiceSubscriptionId(invoice);
        await applyTenantSubscriptionStatus(tenantId, {
          subscriptionStatus: "active",
          subscriptionPastDueSince: undefined,
          ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
        }, event);
        break;
      }

      case "invoice.payment_failed": {
        // Preserve the FIRST failure's timestamp across a continuous past-due
        // streak — resetting it on every failure would let a customer with
        // payments spaced just under 3 days apart dodge the grace window forever
        // and keep free access. invoice.paid clears it, so a recovered-then-failed
        // sub correctly starts a fresh streak.
        const existing = tenantId ? await getTenantConfig(tenantId).catch(() => null) : null;
        await applyTenantSubscriptionStatus(tenantId, {
          subscriptionStatus: "past_due",
          subscriptionPastDueSince: existing?.subscriptionPastDueSince || new Date().toISOString(),
        }, event);
        // alert() now routes to Slack AND Sentry — a failed customer payment
        // must not be invisible if Sentry is unconfigured (it usually is).
        alert("billing_payment_failed", "critical", {
          tenantId: tenantId ?? "unknown",
          hint: "Check the Stripe dashboard.",
        });
        break;
      }

      case "customer.subscription.deleted":
        await applyTenantSubscriptionStatus(tenantId, { subscriptionStatus: "cancelled" }, event);
        alert("billing_subscription_cancelled", "high", { tenantId: tenantId ?? "unknown" });
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
