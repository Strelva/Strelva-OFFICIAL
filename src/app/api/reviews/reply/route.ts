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
import { verifyAuth, requireTenantAccess } from "@/lib/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getReviews, replyToReview } from "@/lib/reviews";
import { getConnection } from "@/lib/connections";
import { addEvent, getEvents, updateEvent } from "@/lib/events";
import { resolveEventAction } from "@/lib/event-actions";
import { logActivity } from "@/lib/storage";
import { readJsonObject } from "@/lib/request-body";
import type { ReviewItem } from "@/lib/types";

/**
 * Publish the owner's reply to Google via the governed approval machinery.
 * Reuses the pending review_reply_draft event the review poller queued for
 * this review when one exists (updated to the owner's final text) so the
 * queue never keeps a stale duplicate draft; otherwise queues a fresh one.
 * Returns true only when Google accepted the write (resolveEventAction gates
 * resolution on `published`, not `verified` — see AGENTS.md).
 */
async function publishReplyViaApproval(
  tenant: string,
  review: ReviewItem,
  gbpReviewId: string,
  reply: string,
): Promise<boolean> {
  const pending = await getEvents(tenant, { status: "pending", limit: 1000 });
  const existing = pending.find(
    (e) =>
      e.type === "review" &&
      e.metadata?.kind === "review_reply_draft" &&
      e.metadata?.reviewId === gbpReviewId,
  );

  let eventId: string;
  if (existing) {
    await updateEvent(existing.id, (event) => ({
      ...event,
      body: reply,
      metadata: { ...event.metadata, draftedReply: reply },
    }));
    eventId = existing.id;
  } else {
    const created = await addEvent({
      tenantId: tenant,
      source: "ai",
      type: "review",
      title: `Reply to ${review.author}'s ${review.rating}-star review`,
      body: reply,
      status: "pending",
      metadata: {
        kind: "review_reply_draft",
        reviewId: gbpReviewId,
        rating: review.rating,
        author: review.author,
        draftedReply: reply,
      },
    });
    eventId = created.id;
  }

  const result = await resolveEventAction(tenant, eventId, "approved");
  // "already_resolved" only occurs AFTER a successful publish in the
  // review_reply_draft branch (a concurrent resolve won the claim), so the
  // reply is live on Google either way.
  return result.changed || result.reason === "already_resolved";
}

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

  const review = (await getReviews(tenant)).find((r) => r.id === reviewId);
  if (!review) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  let published = false;
  if (review.source === "google" && review.externalId) {
    const connection = await getConnection(tenant, "google");
    if (connection?.status === "connected") {
      published = await publishReplyViaApproval(tenant, review, review.externalId, reply);
      if (!published) {
        // Nothing reached Google and the draft event is still pending in the
        // review queue. Save nothing locally — an unpublished reply must not
        // flip the card to the "Your reply" state.
        return NextResponse.json(
          { error: "Could not publish the reply to Google", published: false },
          { status: 502 },
        );
      }
    }
  }

  const updated = await replyToReview(tenant, reviewId, reply);
  if (!updated) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  try {
    await logActivity(
      {
        text: published
          ? `Replied to ${updated.author}'s ${updated.rating}-star review on Google`
          : `Replied to ${updated.author}'s ${updated.rating}-star review`,
        time: new Date().toISOString(),
        type: "review-reply",
        actor: "user",
      },
      tenant,
    );
  } catch {}

  return NextResponse.json({ review: updated, published });
}
