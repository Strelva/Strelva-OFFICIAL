/**
 * Order-triggered review-request cron.
 *
 * When a storefront order lands (via the `/api/v1/track` beacon → src/lib/orders.ts),
 * the best moment to ask for a review is a few days later, once the customer has
 * the product in hand. This cron scans each active tenant's recent orders and, for
 * any order that has aged past the delay window, emails the OWNER their review
 * link (the existing `sendReviewRequestEmail`) so they can forward it to that
 * happy customer.
 *
 * Guards, mirroring the review-nudge cron:
 *  - Only tenants with a derivable review URL (a Google Place ID on config) — no
 *    place ID, no request (we never invent a link).
 *  - Client email pause is respected (the sender gates on emailSendingPaused()).
 *  - Per-order dedupe via a persistent Redis marker, set NX before the send and
 *    rolled back when the send is suppressed/failed — so a paused order still gets
 *    its request the day client email is switched on, and never twice.
 *
 * Auth: handled by proxy (CRON_SECRET check). Schedule: see vercel.json.
 */

import { NextResponse } from "next/server";
import { recordHeartbeat } from "@/lib/heartbeat";
import { mapPool } from "@/lib/concurrency";
import { getAllTenants, isActiveTenant } from "@/lib/tenants";
import { getRedis } from "@/lib/redis";
import { getOrders } from "@/lib/orders";
import { sendReviewRequestEmail } from "@/lib/delivery-email";
import type { TenantConfig } from "@/lib/types";

export const maxDuration = 300;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Wait this long after the order before asking for a review (customer has the
 *  product/service by now). Overridable so an operator can tune the cadence. */
const DELAY_DAYS = Number(process.env.REVIEW_REQUEST_DELAY_DAYS || 3);
/** Only act inside a bounded window past the delay so a first run (or a backlog)
 *  can't blast every order in the 90-day store at once. */
const WINDOW_DAYS = 7;
/** Marker outlives the 90-day order store so a re-seen order can't re-request. */
const SENT_TTL_SECONDS = 120 * 24 * 60 * 60;

function orderReviewSentKey(tenantId: string, orderId: string): string {
  // reb: prefix per the repo's persistent-key convention (AGENTS.md).
  return `reb:order-review-request-sent:${tenantId}:${orderId}`;
}

/** Canonical Google "write a review" deep link from the tenant's Place ID, or
 *  null when none is configured (⇒ skip; we never invent a URL). */
function resolveReviewUrl(tenant: TenantConfig): string | null {
  const placeId = tenant.reviewsConfig?.googlePlaceId?.trim();
  if (!placeId) return null;
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
}

export async function GET() {
  // Auth handled by proxy (CRON_SECRET check).
  const tenants = (await getAllTenants()).filter(isActiveTenant);
  const redis = getRedis();
  const now = Date.now();

  let sent = 0;
  let skippedNoUrl = 0;
  let skippedNoEmail = 0;
  let skippedNoRedis = 0;
  let skippedNotSent = 0;
  let ordersScanned = 0;

  await mapPool(tenants, 6, async (tenant) => {
    const email = tenant.ownerEmail?.trim();
    if (!email) {
      skippedNoEmail++;
      return;
    }

    const reviewUrl = resolveReviewUrl(tenant);
    if (!reviewUrl) {
      skippedNoUrl++;
      return;
    }

    // No dedup store → can't guarantee once-per-order, so don't send.
    if (!redis) {
      skippedNoRedis++;
      return;
    }

    const orders = await getOrders(tenant.id, 500);
    for (const order of orders) {
      const ageMs = now - new Date(order.createdAt).getTime();
      const ageDays = ageMs / DAY_MS;
      // Too fresh (still inside the delay) or too old (outside the window): skip.
      if (ageDays < DELAY_DAYS || ageDays > DELAY_DAYS + WINDOW_DAYS) continue;
      ordersScanned++;

      const key = orderReviewSentKey(tenant.id, order.id);
      const fresh = await redis.set(key, now, { nx: true, ex: SENT_TTL_SECONDS }).catch(() => null);
      if (!fresh) continue; // already requested for this order

      const ok = await sendReviewRequestEmail({
        email,
        businessName: tenant.siteName,
        reviewUrl,
        ownerName: tenant.ownerName?.trim() || undefined,
        logPrefix: "[cron order-review-request]",
      });

      if (ok) {
        sent++;
      } else {
        // Suppressed (client pause) or failed — release the marker so it retries.
        skippedNotSent++;
        await redis.del(key).catch(() => {});
      }
    }
  });

  await recordHeartbeat("order-review-request", { ok: true, processed: tenants.length });

  return NextResponse.json({
    ok: true,
    tenants: tenants.length,
    ordersScanned,
    sent,
    skippedNoUrl,
    skippedNoEmail,
    skippedNoRedis,
    skippedNotSent,
  });
}
