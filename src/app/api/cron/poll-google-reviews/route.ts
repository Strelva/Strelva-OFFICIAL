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
import { getAllTenants } from "@/lib/tenants";
import { getConnection, saveConnection, updateLastSynced } from "@/lib/connections";
import { addEvent } from "@/lib/events";
import { getRedis } from "@/lib/redis";
import type { Connection } from "@/lib/types";

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

async function pollTenant(tenantId: string): Promise<number> {
  const connection = await getConnection(tenantId, "google");
  if (!connection || connection.status !== "connected") return 0;

  // Get valid access token (refresh if needed)
  const accessToken = await getValidAccessToken(connection);
  if (!accessToken) {
    // Mark connection as error
    await saveConnection({
      ...connection,
      status: "error",
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

  // Emit events for new reviews
  for (const review of newReviews) {
    await addEvent({
      tenantId,
      source: "google",
      type: "review",
      title: `New ${starRatingToNumber(review.starRating)}-star Google review from ${review.reviewer.displayName}`,
      body: review.comment || "(no comment)",
      status: "pending",
      metadata: {
        reviewId: review.reviewId,
        rating: starRatingToNumber(review.starRating),
        author: review.reviewer.displayName,
        createdAt: review.createTime,
      },
    });
  }

  // Update cache with all current review IDs
  if (reviews.length > 0) {
    await redis.set(
      lastReviewsKey(tenantId),
      reviews.map((r) => r.reviewId),
      { ex: 60 * 60 * 24 * 30 } // 30 days TTL
    );
  }

  // Update last synced timestamp
  await updateLastSynced(tenantId, "google");

  return newReviews.length;
}

export async function GET() {
  // Auth handled by middleware (CRON_SECRET check)

  const tenants = await getAllTenants();
  const active = tenants.filter((t) => t.active);

  let totalNewReviews = 0;
  const processed: string[] = [];
  const errors: string[] = [];

  for (const tenant of active) {
    try {
      const newCount = await pollTenant(tenant.id);
      if (newCount > 0) {
        totalNewReviews += newCount;
        processed.push(`${tenant.id}: ${newCount} new`);
      }
    } catch (err) {
      const msg = `${tenant.id}: ${err instanceof Error ? err.message : "Unknown error"}`;
      console.error(`[poll-google-reviews] Failed for tenant ${tenant.id}:`, err);
      errors.push(msg);
    }
  }

  // Notify Slack on errors
  if (errors.length > 0 && process.env.SLACK_WEBHOOK_URL) {
    fetch(process.env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `Google Reviews cron: ${errors.length} tenant(s) failed - ${errors.join(", ")}`,
      }),
    }).catch(() => {});
  }

  return NextResponse.json({
    newReviews: totalNewReviews,
    processed: processed.length,
    failed: errors.length,
    details: { processed, errors },
  });
}
