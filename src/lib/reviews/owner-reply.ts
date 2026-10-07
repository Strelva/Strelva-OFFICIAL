/**
 * An owner's reply to one review, shared by POST /api/reviews/reply (tenant
 * host) and POST /api/workspace/reviews/reply (the workspace home of
 * /dashboard/reviews). Callers authorize first; this only acts.
 *
 * A Google review on a connected listing is PUBLISHED through the governed
 * review_reply_draft -> event-actions path (the owner submitting the reply is
 * the approval). A failed publish saves nothing locally. Anything else keeps
 * the reply text so the owner can copy it into the platform by hand.
 */
import { getReviews, replyToReview } from "@/lib/reviews";
import { getConnection } from "@/lib/connections";
import { addEvent, getEventRaw, getEvents, updateEvent } from "@/lib/events";
import { resolveEventAction } from "@/lib/event-actions";
import { logActivity } from "@/lib/storage";
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
  actorId: string,
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

  const result = actorId === "user"
    ? await resolveEventAction(tenant, eventId, "approved")
    : await resolveEventAction(tenant, eventId, "approved", actorId);
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

export type OwnerReviewReplyResult =
  | { status: "replied"; review: ReviewItem; published: boolean }
  | { status: "not_found" }
  | { status: "publish_failed" };

export async function submitOwnerReviewReply(tenant: string, reviewId: string, reply: string, actorId = "user"): Promise<OwnerReviewReplyResult> {
  const review = (await getReviews(tenant)).find((r) => r.id === reviewId);
  if (!review) return { status: "not_found" };

  let published = false;
  if (review.source === "google" && review.externalId) {
    const connection = await getConnection(tenant, "google");
    if (connection?.status === "connected") {
      published = await publishReplyViaApproval(tenant, review, review.externalId, reply, actorId);
      // Nothing reached Google and the draft event is still pending in the
      // review queue. Save nothing locally: an unpublished reply must not
      // flip the card to the "Your reply" state.
      if (!published) return { status: "publish_failed" };
    }
  }

  const updated = await replyToReview(tenant, reviewId, reply);
  if (!updated) return { status: "not_found" };

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

  return { status: "replied", review: updated, published };
}
