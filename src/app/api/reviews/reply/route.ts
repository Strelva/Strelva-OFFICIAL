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
import { addEvent, getEventRaw, getEvents, updateEvent } from "@/lib/events";
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
  // Use a large limit so the scan window covers the full 90-day event retention
  // depth. getEventsRaw scans `limit * 2` raw zset entries before filtering to
  // `limit`, so 5 000 here covers 10 000 raw entries — well beyond what any
  // single tenant can accumulate within the TTL window. Without a wide enough
  // window the existing draft falls outside the scan and we create a duplicate.
  const pending = await getEvents(tenant, { status: "pending", limit: 5000 });
  const existing = pending.find(
    (e) =>
      e.type === "review" &&
      e.metadata?.kind === "review_reply_draft" &&
      e.metadata?.reviewId === gbpReviewId,
  );

  let eventId: string;
  if (existing) {
    const updated = await updateEvent(existing.id, (event) => ({
      ...event,
      body: reply,
      metadata: { ...event.metadata, draftedReply: reply },
    }));
    // If the owner's final text didn't land (lost the write lock to a concurrent
    // updater), resolving now would publish the STALE draft to Google. Bail so
    // the caller surfaces a retryable failure instead of silently diverging the
    // dashboard from the live listing.
    if (!updated.changed) return false;
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
  if (result.changed) return true;
  // "already_resolved" is ambiguous: it fires for BOTH a concurrent approve
  // (published to Google) AND a concurrent dismiss (nothing reached Google).
  // Re-read the event and treat it as published ONLY when it actually resolved
  // to "approved" — otherwise the card would falsely lock to "Your reply" with
  // no reply live on the listing.
  if (result.reason === "already_resolved") {
    // Redis-authoritative re-read: under READ_PG, getEvent could serve a
    // stale-pending PG twin and misreport a live published reply as a failure.
    const latest = await getEventRaw(eventId);
    return latest?.status === "approved";
  }
  return false;
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
