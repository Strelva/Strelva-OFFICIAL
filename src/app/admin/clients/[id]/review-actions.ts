"use server";

/**
 * "Draft reply" for a single review from the operator's ReviewIntelPanel.
 *
 * Re-verifies super-admin independently (the /admin layout gate does NOT protect
 * a server action's POST surface), then routes through the SAME governed
 * `review_reply_draft` path the review poller and the portfolio "Draft these"
 * button use: draft a filter-safe reply and queue it as a PENDING event. It
 * NEVER publishes to Google — the real write happens later on approval in
 * `event-actions.ts`. Idempotent: skips a review that already has a pending draft.
 */

import { isSuperAdmin } from "@/lib/auth";
import { getReviews } from "@/lib/reviews";
import { getTenantConfig } from "@/lib/tenants";
import { draftReviewReply, storeRecentReply } from "@/lib/review-replies";
import { addEvent, getEvents } from "@/lib/events";
import type { UnifiedEvent } from "@/lib/types";

export interface DraftReplyResult {
  ok: boolean;
  drafted: boolean;
  reason?:
    | "unauthorized"
    | "bad_input"
    | "tenant_not_found"
    | "review_not_found"
    | "already_replied"
    | "already_drafted"
    | "draft_failed";
}

export async function draftReviewReplyForReview(
  tenantId: string,
  reviewId: string,
): Promise<DraftReplyResult> {
  if (!(await isSuperAdmin())) return { ok: false, drafted: false, reason: "unauthorized" };
  if (typeof tenantId !== "string" || !tenantId || typeof reviewId !== "string" || !reviewId) {
    return { ok: false, drafted: false, reason: "bad_input" };
  }

  const tenant = await getTenantConfig(tenantId).catch(() => null);
  if (!tenant) return { ok: false, drafted: false, reason: "tenant_not_found" };

  const reviews = await getReviews(tenantId).catch(() => []);
  const review = reviews.find((r) => r.id === reviewId || r.externalId === reviewId);
  if (!review) return { ok: false, drafted: false, reason: "review_not_found" };
  if (review.reply && review.reply.trim()) {
    return { ok: true, drafted: false, reason: "already_replied" };
  }

  // Match the poller's convention: prefer the provider id for the dedupe key.
  const targetId = review.externalId ?? review.id;
  const pending = await getEvents(tenantId, { status: "pending", limit: 200 }).catch(
    () => [] as UnifiedEvent[],
  );
  const alreadyDrafted = pending.some(
    (e) =>
      e.type === "review" &&
      e.metadata?.kind === "review_reply_draft" &&
      e.metadata?.reviewId === targetId,
  );
  if (alreadyDrafted) return { ok: true, drafted: false, reason: "already_drafted" };

  try {
    const draftedReply = await draftReviewReply(
      { reviewId: targetId, reviewerName: review.author, rating: review.rating, comment: review.text },
      tenant,
    );
    await addEvent({
      tenantId,
      source: "ai",
      type: "review",
      title: `Drafted reply for ${review.author}'s ${review.rating}-star review`,
      body: draftedReply,
      // Always pending — a human must approve before it publishes to Google.
      status: "pending",
      metadata: {
        kind: "review_reply_draft",
        reviewId: targetId,
        rating: review.rating,
        author: review.author,
        draftedReply,
      },
    });
    await storeRecentReply(tenantId, draftedReply).catch(() => {});
    return { ok: true, drafted: true };
  } catch {
    return { ok: false, drafted: false, reason: "draft_failed" };
  }
}
