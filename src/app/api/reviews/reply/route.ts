/**
 * POST /api/reviews/reply
 *
 * Persists an owner's reply to a single review so it shows the locked "Your
 * reply" state in the dashboard — the same write the AI agent's
 * `reply_to_review` tool performs. Auth-gated like the other dashboard review
 * routes (verifyAuth + requireTenantAccess) and tenant-scoped via headers, so
 * a request can only touch its own tenant's reviews.
 *
 * Reuses the shared `replyToReview` persistence path from `@/lib/reviews`
 * (Postgres / Sanity / dev-file behind the same data-source flags the agent
 * uses) and logs the same review-reply activity, attributed to the dashboard
 * user (not the AI).
 *
 * Body: { reviewId: string, reply: string }
 * Returns: { review: ReviewItem } on success.
 */

import { NextResponse } from "next/server";
import { verifyAuth, requireTenantAccess } from "@/lib/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { replyToReview } from "@/lib/reviews";
import { logActivity } from "@/lib/storage";
import { readJsonObject } from "@/lib/request-body";

export async function POST(req: Request) {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenant = await getTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;

  const body = await readJsonObject(req).catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const reviewId = typeof body.reviewId === "string" ? body.reviewId.trim() : "";
  const reply = typeof body.reply === "string" ? body.reply.trim() : "";

  if (!reviewId || !reply) {
    return NextResponse.json(
      { error: "reviewId and reply are required" },
      { status: 400 },
    );
  }

  const updated = await replyToReview(tenant, reviewId, reply);
  if (!updated) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  try {
    await logActivity(
      {
        text: `Replied to ${updated.author}'s ${updated.rating}-star review`,
        time: new Date().toISOString(),
        type: "review-reply",
        actor: "user",
      },
      tenant,
    );
  } catch {}

  return NextResponse.json({ review: updated });
}
