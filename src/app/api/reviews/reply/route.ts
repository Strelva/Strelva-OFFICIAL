/**
 * POST /api/reviews/reply
 *
 * Handles an owner's reply to a single review. Auth-gated like the other
 * dashboard review routes (verifyAuth + requireTenantAccess) and tenant-scoped
 * via headers, so a request can only touch its own tenant's reviews.
 *
 * When the review came from Google and the tenant's GBP connection is live,
 * the reply is actually PUBLISHED to the Google listing — through the same
 * governed review_reply_draft → event-actions path the approval queue uses.
 * The owner writing and submitting the reply IS the approval, so this route
 * approves the draft event with the owner as actor, keeping the audit trail
 * and the resolve-on-success (not verified) non-idempotency guard intact. A
 * failed publish leaves the draft pending in the queue and saves nothing
 * locally — the card must never claim a reply is handled when it isn't live.
 *
 * For non-Google sources (or when GBP isn't connected) it falls back to the
 * original behavior: persist the reply text via the shared `replyToReview`
 * path so the dashboard shows the locked "Your reply" state and the owner can
 * copy it into the platform by hand.
 *
 * Body: { reviewId: string, reply: string }
 * Returns: { review: ReviewItem, published: boolean } on success.
 */

import { NextResponse } from "next/server";
import { verifyAuth, requireTenantAccess } from "@/platform/infra/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { readJsonObject } from "@/lib/request-body";
import { submitOwnerReviewReply } from "@/lib/reviews/owner-reply";
import { sessionTenantDecider } from "@/lib/operator-decisions";

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

  // An operator replies as the operator, audited (src/lib/operator-decisions.ts).
  const decider = await sessionTenantDecider(tenant);
  if (!decider) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await submitOwnerReviewReply(tenant, reviewId, reply, decider);
  if (result.status === "not_found") {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }
  if (result.status === "owner_decides") {
    return NextResponse.json({ error: "The owner decides this reply. Nothing was posted." }, { status: 403 });
  }
  if (result.status === "publish_failed") {
    return NextResponse.json(
      { error: "Could not publish the reply to Google", published: false },
      { status: 502 },
    );
  }
  return NextResponse.json({ review: result.review, published: result.published });
}
