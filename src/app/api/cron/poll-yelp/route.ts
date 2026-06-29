import { NextResponse } from "next/server";
import { recordHeartbeat } from "@/lib/heartbeat";
import { mapPool } from "@/lib/concurrency";
import { getAllTenants } from "@/lib/tenants";
import { getConnection, updateLastSynced } from "@/lib/connections";
import { addEvent } from "@/lib/events";
import { addReview } from "@/lib/reviews";
import { getRedis } from "@/lib/redis";

// Cap matches the platform function ceiling — this cron iterates tenants and
// would otherwise die mid-batch at scale on a lower default.
export const maxDuration = 300;

const YELP_API_BASE = "https://api.yelp.com/v3";

interface YelpReview {
  id: string;
  rating: number;
  text: string;
  time_created: string;
  user: { name: string };
}

interface YelpReviewsResponse {
  reviews: YelpReview[];
  total: number;
}

function seenReviewsKey(tenantId: string): string {
  // New key (string[] set), distinct from the old single-id `yelp:lastReview:*`
  // which simply expires.
  return `yelp:seenReviews:${tenantId}`;
}

async function fetchYelpReviews(apiKey: string, businessId: string): Promise<YelpReview[]> {
  const res = await fetch(`${YELP_API_BASE}/businesses/${businessId}/reviews?limit=20&sort_by=date`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Yelp API error: ${res.status}`);
  const data: YelpReviewsResponse = await res.json();
  return data.reviews;
}

export async function GET() {
  // Auth handled by proxy (CRON_SECRET check)

  const tenants = await getAllTenants();
  const active = tenants.filter((t) => t.active);
  const redis = getRedis();

  let totalNew = 0;
  const results: { tenant: string; newReviews: number }[] = [];
  const errors: string[] = [];

await mapPool(active, 8, async (tenant) => {
    try {
      const connection = await getConnection(tenant.id, "yelp");
      if (!connection || connection.status !== "connected") return;

      const apiKey = connection.accessToken;
      const businessId = connection.apiKey;
      if (!apiKey || !businessId) return;

      const reviews = await fetchYelpReviews(apiKey, businessId);
      if (reviews.length === 0) return;

      // Set-based dedup (matches Google) — membership, not order. The old
      // single-lastSeenId + break double-counted every review if that id was
      // deleted or the API reordered (the break never fired).
      let seenIds = new Set<string>();
      if (redis) {
        const cached = await redis.get<string[]>(seenReviewsKey(tenant.id));
        if (cached) seenIds = new Set(cached);
      }
      const newReviews = reviews.filter((r) => !seenIds.has(r.id));

      for (const review of newReviews) {
        await addEvent({
          tenantId: tenant.id,
          source: "yelp",
          type: "review",
          title: `New Yelp review from ${review.user.name}`,
          body: review.text,
          status: "pending",
          metadata: {
            rating: review.rating,
            reviewId: review.id,
            author: review.user.name,
            date: review.time_created,
          },
        });

        // Mirror into the reviews table the dashboard Reviews tab reads. The
        // events queue alone left that tab empty (audit: reviews disconnect).
        // Best-effort + gated on new-only above, so it doesn't break the poll.
        await addReview(tenant.id, {
          source: "yelp",
          author: review.user.name,
          rating: review.rating,
          text: review.text,
          date: review.time_created,
          externalId: review.id,
        }).catch((err) =>
          // The code comment calls this the "reviews disconnect" — don't make it
          // invisible. The event was already queued; this just mirrors to the table.
          console.error(`[poll-yelp] addReview failed for ${tenant.id}/${review.id}:`, err),
        );
      }

      // Cache the CURRENT review-id snapshot (30-day TTL), unconditionally —
      // refreshing the window even when nothing was new keeps dedup honest.
      if (redis) {
        await redis.set(
          seenReviewsKey(tenant.id),
          reviews.map((r) => r.id),
          { ex: 60 * 60 * 24 * 30 },
        );
      }

      await updateLastSynced(tenant.id, "yelp");

      totalNew += newReviews.length;
      results.push({ tenant: tenant.id, newReviews: newReviews.length });
    } catch (err) {
      const msg = `${tenant.id}: ${err instanceof Error ? err.message : "Unknown error"}`;
      console.error(`[poll-yelp] Failed for tenant ${tenant.id}:`, err);
      errors.push(msg);
    }
  });

  if (errors.length > 0 && process.env.SLACK_WEBHOOK_URL) {
    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `Yelp poll: ${errors.length} tenant(s) failed - ${errors.join(", ")}`,
      }),
    }).catch(() => {});
  }

  await recordHeartbeat("poll-yelp", { ok: errors.length === 0, processed: results.length, failed: errors.length });

  return NextResponse.json({ processed: results.length, totalNew, failed: errors.length, results, errors });
}
