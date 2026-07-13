/**
 * Google Reviews Polling Cron
 *
 * Polls Google Business Profile reviews for all tenants with Google connections.
 * Runs daily at 6am UTC via Vercel Cron.
 *
 * Required env:
 * - CRON_SECRET: Bearer token for authorization
 * - GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET: For token refresh
 */

import { NextResponse } from "next/server";
import { recordHeartbeat } from "@/lib/heartbeat";
import { mapPool } from "@/lib/concurrency";
import { getAllTenants } from "@/lib/tenants";
import { getConnection, saveConnection, updateLastSynced } from "@/lib/connections";
import { alert } from "@/lib/monitoring";
import { addEvent } from "@/lib/events";
import { addReview } from "@/lib/reviews";
import { getRedis } from "@/lib/redis";
import { draftReviewReply, storeRecentReply } from "@/lib/review-replies";
import { getReplyVoice, defaultReplyVoice } from "@/lib/reviews/reply-voice";
import { AUTO_POST_DELAY_MS } from "@/lib/reviews/auto-reply";
import { buildApproveUrl } from "@/lib/approve-link";
import { getTenantDashboardUrl } from "@/lib/tenant-urls";
import { maybeAlertNewReview } from "@/lib/review-alert";
import type { Connection, TenantConfig } from "@/lib/types";
import { requireCronRequest } from "@/lib/cron-auth";

// Cap matches the platform function ceiling — this cron iterates tenants and
// would otherwise die mid-batch at scale on a lower default.
export const maxDuration = 300;

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

interface GoogleReview {
  name: string;
  reviewId: string;
  reviewer: {
    displayName: string;
  };
  starRating: "ONE" | "TWO" | "THREE" | "FOUR" | "FIVE";
  comment?: string;
  createTime: string;
  updateTime: string;
}

interface GoogleReviewsResponse {
  reviews?: GoogleReview[];
  nextPageToken?: string;
}

function starRatingToNumber(rating: GoogleReview["starRating"]): number {
  const map = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
  return map[rating] ?? 0;
}

function lastReviewsKey(tenantId: string): string {
  return `google-reviews:last:${tenantId}`;
}

async function refreshAccessToken(connection: Connection): Promise<string | null> {
  if (!connection.refreshToken) return null;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: connection.refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) {
      console.error(`[poll-google-reviews] Token refresh failed for ${connection.tenantId}:`, await res.text());
      return null;
    }

    const data = await res.json();
    const newAccessToken = data.access_token as string;
    const expiresIn = data.expires_in as number;

    // Update connection with new token
    await saveConnection({
      ...connection,
      accessToken: newAccessToken,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    });

    return newAccessToken;
  } catch (err) {
    console.error(`[poll-google-reviews] Token refresh error for ${connection.tenantId}:`, err);
    return null;
  }
}

async function getValidAccessToken(connection: Connection): Promise<string | null> {
  // Check if token is expired or about to expire (5 min buffer)
  if (connection.expiresAt) {
    const expiresAt = new Date(connection.expiresAt).getTime();
    const buffer = 5 * 60 * 1000;
    if (Date.now() + buffer > expiresAt) {
      return refreshAccessToken(connection);
    }
  }
  return connection.accessToken;
}

async function fetchGoogleReviews(
  accessToken: string,
  accountId: string,
  locationId: string
): Promise<GoogleReview[]> {
  const url = `https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationId}/reviews`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Google API error: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as GoogleReviewsResponse;
  return data.reviews ?? [];
}

async function pollTenant(tenant: TenantConfig): Promise<number> {
  const tenantId = tenant.id;
  const connection = await getConnection(tenantId, "google");
  if (!connection || connection.status !== "connected") return 0;

  // Get valid access token (refresh if needed)
  const accessToken = await getValidAccessToken(connection);
  if (!accessToken) {
    // Transition from connected -> error (we only get here if it was connected).
    // Alert once on the transition so a client's review sync can't die silently.
    await saveConnection({
      ...connection,
      status: "error",
    });
    alert("google_reviews_token_refresh_failed", "high", {
      tenantId,
      hint: "Client's Google connection needs re-auth — reviews sync is stopped.",
    });
    return 0;
  }

  // Get account/location IDs from Redis (stored during OAuth callback)
  const redis = getRedis();
  if (!redis) {
    console.warn(`[poll-google-reviews] Redis not available for ${tenantId}`);
    return 0;
  }

  const metadata = await redis.get<{ accountId?: string; locationId?: string }>(`google-meta:${tenantId}`);
  const accountId = metadata?.accountId;
  const locationId = metadata?.locationId;

  if (!accountId || !locationId) {
    console.warn(`[poll-google-reviews] Missing accountId/locationId for ${tenantId}`);
    return 0;
  }

  // Fetch reviews
  const reviews = await fetchGoogleReviews(accessToken, accountId, locationId);

  // Get last known review IDs
  let lastReviewIds: Set<string> = new Set();
  const cached = await redis.get<string[]>(lastReviewsKey(tenantId));
  if (cached) lastReviewIds = new Set(cached);

  // Find new reviews
  const newReviews = reviews.filter((r) => !lastReviewIds.has(r.reviewId));

  // Track new reviewIds whose reviews-table mirror (addReview) failed this poll
  // so we can EXCLUDE them from the seen-set write below — a transient mirror
  // failure must leave the id unseen so the next poll retries it. Otherwise the
  // review lands in the activity feed but is lost from the Reviews tab forever.
  const mirrorFailed = new Set<string>();

  // Emit events for new reviews and queue drafted replies for human approval.
  // Review replies are customer-facing copy — ALWAYS pending (never auto-published).
  for (const review of newReviews) {
    const rating = starRatingToNumber(review.starRating);

    await addEvent({
      tenantId,
      source: "google",
      type: "review",
      title: `New ${rating}-star Google review from ${review.reviewer.displayName}`,
      body: review.comment || "(no comment)",
      status: "pending",
      metadata: {
        reviewId: review.reviewId,
        rating,
        author: review.reviewer.displayName,
        createdAt: review.createTime,
      },
    });

    // Mirror into the reviews table the dashboard Reviews tab reads. The events
    // queue alone left that tab empty (audit: reviews disconnect). Best-effort +
    // gated on new-only above, so a write blip never blocks the poll.
    await addReview(tenantId, {
      source: "google",
      author: review.reviewer.displayName,
      rating,
      text: review.comment || "",
      date: review.createTime,
      externalId: review.reviewId,
    }).catch((err) => {
      // Do NOT mark this reviewId seen — leave it out of the cursor so the next
      // poll re-mirrors it. Losing a review from the Reviews tab is worse than a
      // duplicate activity event on retry.
      mirrorFailed.add(review.reviewId);
      console.error(`[poll-google-reviews] addReview failed for ${tenantId}/${review.reviewId}:`, err);
    });

    // Draft a filter-safe reply and queue it per the client's reply mode.
    // off → don't touch their reviews. approve → pending for their OK. auto →
    // pending WITH an autoPostAt so the auto-post cron publishes it after the
    // safety window (cancellable until then). Fire-and-recover: a draft failure
    // must not block the review event.
    let draftedReply: string | undefined;
    let draftEventId: string | undefined;
    const replyMode = (await getReplyVoice(tenantId).catch(() => defaultReplyVoice())).mode;
    if (replyMode !== "off") {
      try {
        draftedReply = await draftReviewReply(
          {
            reviewId: review.reviewId,
            reviewerName: review.reviewer.displayName,
            rating,
            comment: review.comment,
          },
          tenant
        );

        const draftEvent = await addEvent({
          tenantId,
          source: "ai",
          type: "review",
          title: `Drafted reply for ${review.reviewer.displayName}'s ${rating}-star review`,
          body: draftedReply,
          // Pending either way — auto mode publishes via the cron after the
          // window, never bypassing the governed approval path.
          status: "pending",
          metadata: {
            kind: "review_reply_draft",
            reviewId: review.reviewId,
            rating,
            author: review.reviewer.displayName,
            draftedReply,
            reviewCreatedAt: review.createTime,
            ...(replyMode === "auto"
              ? { autoPostAt: new Date(Date.now() + AUTO_POST_DELAY_MS).toISOString() }
              : {}),
          },
        });
        draftEventId = draftEvent.id;

        // Store in recent-replies for near-duplicate detection on future drafts.
        await storeRecentReply(tenantId, draftedReply);
      } catch (err) {
        console.error(
          `[poll-google-reviews] Reply drafting failed for ${tenantId} reviewId=${review.reviewId}:`,
          err
        );
      }
    }

    // Alert the owner (once per review, client-gated). When a reply draft exists,
    // carry one-click Approve / Not-yet links that resolve that pending draft
    // through the governed approval path. Best-effort — never blocks the poll.
    try {
      const origin = getTenantDashboardUrl(tenant, "/");
      const approveUrl = draftEventId
        ? buildApproveUrl(origin, { eventId: draftEventId, tenantId, action: "approve" })
        : undefined;
      const notYetUrl = draftEventId
        ? buildApproveUrl(origin, { eventId: draftEventId, tenantId, action: "not-yet" })
        : undefined;
      await maybeAlertNewReview({
        tenant,
        reviewId: review.reviewId,
        review: { author: review.reviewer.displayName, rating, text: review.comment },
        reviewsUrl: getTenantDashboardUrl(tenant, "/dashboard/reviews"),
        draftedReply,
        approveUrl,
        notYetUrl,
        logPrefix: "[cron poll-google-reviews]",
      });
    } catch (err) {
      console.error(`[poll-google-reviews] Owner alert failed for ${tenantId}/${review.reviewId}:`, err);
    }
  }

  // Update cache with the current review IDs, minus any whose Reviews-tab mirror
  // failed this poll. Previously-seen ids stay (they aren't re-mirrored, so they
  // can't be in mirrorFailed); only newly-seen ids that mirrored cleanly are
  // persisted, so a failed mirror is retried next poll instead of lost.
  if (reviews.length > 0) {
    const seenReviewIds = reviews
      .map((r) => r.reviewId)
      .filter((id) => !mirrorFailed.has(id));
    await redis.set(
      lastReviewsKey(tenantId),
      seenReviewIds,
      { ex: 60 * 60 * 24 * 30 } // 30 days TTL
    );
  }

  // Update last synced timestamp
  await updateLastSynced(tenantId, "google");

  return newReviews.length;
}

export async function GET(request: Request) {
  const denied = requireCronRequest(request);
  if (denied) return denied;

  const tenants = await getAllTenants();
  const active = tenants.filter((t) => t.active);

  let totalNewReviews = 0;
  const processed: string[] = [];
  const errors: string[] = [];

  await mapPool(active, 8, async (tenant) => {
    try {
      const newCount = await pollTenant(tenant);
      if (newCount > 0) {
        totalNewReviews += newCount;
        processed.push(`${tenant.id}: ${newCount} new`);
      }
    } catch (err) {
      const msg = `${tenant.id}: ${err instanceof Error ? err.message : "Unknown error"}`;
      console.error(`[poll-google-reviews] Failed for tenant ${tenant.id}:`, err);
      errors.push(msg);
    }
  });

  // Notify Slack on errors
  if (errors.length > 0 && process.env.SLACK_WEBHOOK_URL) {
    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `Google Reviews cron: ${errors.length} tenant(s) failed - ${errors.join(", ")}`,
      }),
    }).catch(() => {});
  }

  await recordHeartbeat("poll-google-reviews", { ok: errors.length === 0, processed: processed.length, failed: errors.length });

  return NextResponse.json({
    newReviews: totalNewReviews,
    processed: processed.length,
    failed: errors.length,
    details: { processed, errors },
  });
}
