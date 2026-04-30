import { NextResponse } from "next/server";
import { getAllTenants } from "@/lib/tenants";
import { getConnection, updateLastSynced } from "@/lib/connections";
import { addEvent } from "@/lib/events";
import { getRedis } from "@/lib/redis";

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

function lastReviewKey(tenantId: string): string {
  return `yelp:lastReview:${tenantId}`;
}

async function fetchYelpReviews(apiKey: string, businessId: string): Promise<YelpReview[]> {
  const res = await fetch(`${YELP_API_BASE}/businesses/${businessId}/reviews?limit=20&sort_by=date`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Yelp API error: ${res.status}`);
  const data: YelpReviewsResponse = await res.json();
  return data.reviews;
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenants = await getAllTenants();
  const active = tenants.filter((t) => t.active);
  const redis = getRedis();

  let totalNew = 0;
  const results: { tenant: string; newReviews: number }[] = [];
  const errors: string[] = [];

  for (const tenant of active) {
    try {
      const connection = await getConnection(tenant.id, "yelp");
      if (!connection || connection.status !== "connected") continue;

      const apiKey = connection.accessToken;
      const businessId = connection.apiKey;
      if (!apiKey || !businessId) continue;

      const reviews = await fetchYelpReviews(apiKey, businessId);
      if (reviews.length === 0) continue;

      const lastSeenId = redis ? await redis.get<string>(lastReviewKey(tenant.id)) : null;
      const newReviews: YelpReview[] = [];

      for (const review of reviews) {
        if (review.id === lastSeenId) break;
        newReviews.push(review);
      }

      for (const review of newReviews.reverse()) {
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
      }

      if (newReviews.length > 0 && redis) {
        await redis.set(lastReviewKey(tenant.id), reviews[0].id);
      }

      await updateLastSynced(tenant.id, "yelp");

      totalNew += newReviews.length;
      results.push({ tenant: tenant.id, newReviews: newReviews.length });
    } catch (err) {
      const msg = `${tenant.id}: ${err instanceof Error ? err.message : "Unknown error"}`;
      console.error(`[poll-yelp] Failed for tenant ${tenant.id}:`, err);
      errors.push(msg);
    }
  }

  if (errors.length > 0 && process.env.SLACK_WEBHOOK_URL) {
    fetch(process.env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `Yelp poll: ${errors.length} tenant(s) failed - ${errors.join(", ")}`,
      }),
    }).catch(() => {});
  }

  return NextResponse.json({ processed: results.length, totalNew, failed: errors.length, results, errors });
}
