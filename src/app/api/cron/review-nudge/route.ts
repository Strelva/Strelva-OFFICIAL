/**
 * Review-request cadence cron.
 *
 * Occasionally nudges active clients with their review link so they forward it
 * to a few happy customers — the single highest-leverage local-SEO action an
 * owner can take. The SCHEDULE is weekly, but the true cadence is set by the
 * per-tenant throttle below: a client hears from us about reviews at most once
 * every ~30 days. We only nudge when a review URL is actually derivable from the
 * tenant's configured Google Place ID — no place ID, no nudge (we never invent a
 * link).
 *
 * Auth: handled by proxy (CRON_SECRET check).
 * Schedule: see vercel.json.
 */

import { NextResponse } from "next/server";
import { recordHeartbeat } from "@/lib/heartbeat";
import { mapPool } from "@/lib/concurrency";
import { getAllTenants, isActiveTenant } from "@/lib/tenants";
import { getRedis } from "@/lib/redis";
import { sendReviewRequestEmail } from "@/lib/delivery-email";
import type { TenantConfig } from "@/lib/types";

// Cap matches the platform function ceiling — this cron iterates tenants and
// would otherwise die mid-batch at scale on a lower default.
export const maxDuration = 300;

/**
 * At most one review nudge per tenant per this window. The cron runs weekly, so
 * this gate — not the schedule — is what makes the nudge feel occasional rather
 * than nagging.
 */
const MIN_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

function reviewNudgeSentKey(tenantId: string): string {
  // reb: prefix per the repo's persistent-key convention (AGENTS.md).
  return `reb:review-nudge-sent:${tenantId}`;
}

/**
 * The client's review link, derived from the Google Place ID they've configured.
 * This is the canonical Google "write a review" deep link — we do NOT invent a
 * URL: no place ID on file ⇒ null ⇒ the tenant is skipped.
 */
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
  let skippedThrottled = 0;
  let skippedNotSent = 0;

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

    // Throttle needs the persistent last-sent marker. Without Redis we can't
    // dedupe, so we don't send — a missed nudge beats nagging every run.
    if (!redis) {
      skippedThrottled++;
      return;
    }
    const last = await redis.get<number>(reviewNudgeSentKey(tenant.id)).catch(() => null);
    if (typeof last === "number" && now - last < MIN_INTERVAL_MS) {
      skippedThrottled++;
      return;
    }

    const ok = await sendReviewRequestEmail({
      email,
      businessName: tenant.siteName,
      reviewUrl,
      ownerName: tenant.ownerName?.trim() || undefined,
      logPrefix: "[cron review-nudge]",
    });

    // Only stamp the throttle when a send actually happened. When the client
    // email pause is on, sendReviewRequestEmail returns false WITHOUT sending —
    // leaving the marker unset so the nudge fires the day email is switched on,
    // not 30 days later.
    if (ok) {
      await redis.set(reviewNudgeSentKey(tenant.id), now).catch(() => {});
      sent++;
    } else {
      skippedNotSent++;
    }
  });

  await recordHeartbeat("review-nudge", { ok: true, processed: tenants.length });

  return NextResponse.json({
    ok: true,
    tenants: tenants.length,
    sent,
    skippedNoUrl,
    skippedNoEmail,
    skippedThrottled,
    skippedNotSent,
  });
}
