/**
 * The "auto-post" half of done-for-you review replies.
 *
 * The review pollers already draft a filter-safe reply for every new review and
 * queue it as a pending `review_reply_draft` (see poll-google-reviews). This adds
 * the client-controlled behaviour on top, driven by their ReplyVoice mode:
 *
 *   • off      — the poller skips drafting entirely.
 *   • approve  — the draft sits pending for the owner to approve (default).
 *   • auto     — the draft carries an `autoPostAt` (now + safety window); this
 *                cron publishes it once the window elapses, through the SAME
 *                governed path (resolveEventAction → "approved") a manual
 *                approval uses. Edited or dismissed before then ⇒ no longer
 *                pending ⇒ never fires. No new external-write path is created.
 */

import type { TenantConfig, UnifiedEvent } from "../types";
import { getEvents, addEvent } from "../events";
import { resolveEventAction } from "../event-actions";
import { getAllTenants } from "../tenants";
import { getReplyVoice } from "./reply-voice";
import { getReviews } from "../reviews";
import { draftReviewReply, storeRecentReply } from "../review-replies";

/** The catch-window between "drafted" and "auto-posted" — long enough for the
 *  owner to veto a bad AI reply, short enough that the reply is still timely. */
export const AUTO_POST_DELAY_MS = 12 * 60 * 60 * 1000;

function hasReply(reply: string | undefined | null): boolean {
  return typeof reply === "string" && reply.trim().length > 0;
}

/**
 * Draft replies for the backlog of unreplied reviews — the ones that predate a
 * client turning replies on, so the reviews page reads "handled", not a to-do.
 * New reviews are drafted by the pollers; this catches up the rest, capped per
 * tenant per run so it drains over a few cron cycles instead of one Gemini
 * stampede. Mode-aware: off skips, auto stamps the same safety-window timer.
 */
export async function draftReplyBacklog(
  nowMs: number,
  capPerTenant = 5,
): Promise<{ drafted: number }> {
  const tenants = await getAllTenants().catch(() => [] as TenantConfig[]);
  let drafted = 0;

  for (const t of tenants) {
    if (t.active === false) continue;
    const voice = await getReplyVoice(t.id).catch(() => null);
    if (!voice || voice.mode === "off") continue;

    const [reviews, pending] = await Promise.all([
      getReviews(t.id).catch(() => []),
      getEvents(t.id, { status: "pending", limit: 200 }).catch(() => [] as UnifiedEvent[]),
    ]);
    const alreadyDrafted = new Set(
      pending
        .filter((e) => e.metadata?.kind === "review_reply_draft")
        .map((e) => e.metadata?.reviewId),
    );

    let n = 0;
    for (const r of reviews) {
      if (n >= capPerTenant) break;
      if (hasReply(r.reply)) continue;
      const reviewId = r.externalId ?? r.id;
      if (alreadyDrafted.has(reviewId)) continue;
      try {
        const reply = await draftReviewReply(
          { reviewId, reviewerName: r.author, rating: r.rating, comment: r.text },
          t,
        );
        await addEvent({
          tenantId: t.id,
          source: "ai",
          type: "review",
          title: `Drafted reply for ${r.author}'s ${r.rating}-star review`,
          body: reply,
          status: "pending",
          metadata: {
            kind: "review_reply_draft",
            reviewId,
            rating: r.rating,
            author: r.author,
            draftedReply: reply,
            ...(voice.mode === "auto"
              ? { autoPostAt: new Date(nowMs + AUTO_POST_DELAY_MS).toISOString() }
              : {}),
          },
        });
        await storeRecentReply(t.id, reply).catch(() => {});
        drafted += 1;
        n += 1;
      } catch {
        // one review failing to draft must not stall the rest
      }
    }
  }

  return { drafted };
}

/** Publish any auto-mode drafts whose safety window has elapsed. Best-effort,
 *  per-tenant isolated — one failure never blocks the rest. */
export async function runDueAutoPosts(nowMs: number): Promise<{ posted: number; failed: number }> {
  const tenants = await getAllTenants().catch(() => [] as TenantConfig[]);
  let posted = 0;
  let failed = 0;

  for (const t of tenants) {
    if (t.active === false) continue;
    // Re-check the live mode: a client who switched off "auto" after a draft was
    // stamped must NOT have it auto-post. The stale autoPostAt is ignored then.
    const mode = (await getReplyVoice(t.id).catch(() => null))?.mode;
    if (mode !== "auto") continue;
    const pending = await getEvents(t.id, { status: "pending", limit: 200 }).catch(
      () => [] as UnifiedEvent[],
    );
    for (const e of pending) {
      if (e.metadata?.kind !== "review_reply_draft") continue;
      const at = e.metadata?.autoPostAt;
      if (typeof at !== "string") continue; // approve-mode drafts carry no timer
      const due = new Date(at).getTime();
      if (Number.isNaN(due) || due > nowMs) continue; // still inside the window
      try {
        await resolveEventAction(t.id, e.id, "approved");
        posted += 1;
      } catch {
        failed += 1;
      }
    }
  }

  return { posted, failed };
}
