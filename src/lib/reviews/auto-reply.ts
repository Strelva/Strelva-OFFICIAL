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
import { getEvents, addEvent, updateEvent } from "../events";
import { resolveEventAction } from "../event-actions";
import { getAllTenants } from "../tenants";
import { getReplyVoice } from "./reply-voice";
import { getReviews } from "../reviews";
import { draftReviewReply, storeRecentReply, isReviewReplyDeclined } from "../review-replies";
import { mapPool } from "../concurrency";

/** Tenant-level concurrency for the auto-reply crons. A serial per-tenant loop
 *  with up-to-2 Gemini calls each blows Vercel's 300s budget past ~30 tenants;
 *  the inner per-review work stays serial to avoid a burst on one tenant. */
const AUTO_REPLY_CONCURRENCY = 6;

/** The catch-window between "drafted" and "auto-posted" — long enough for the
 *  owner to veto a bad AI reply, short enough that the reply is still timely. */
export const AUTO_POST_DELAY_MS = 12 * 60 * 60 * 1000;

/** Stop auto-posting a draft after this many failed publish attempts. Without a
 *  cap, a draft with a broken publish precondition (dead GBP connection, or a
 *  non-Google review that can never resolve) retries every cron run forever,
 *  each failure emitting a new pending alert event + Slack ping. */
export const MAX_AUTO_POST_ATTEMPTS = 3;

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

  await mapPool(tenants, AUTO_REPLY_CONCURRENCY, async (t) => {
   try {
    if (t.active === false) return;
    const voice = await getReplyVoice(t.id).catch(() => null);
    if (!voice || voice.mode === "off") return;

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
      // Only Google reviews can be published back through the GBP API. Drafting
      // for Yelp/manual reviews queues a reply whose id can never resolve, so it
      // fails every auto-post run forever (alert-event + Slack spam).
      if (r.source !== "google") continue;
      const reviewId = r.externalId ?? r.id;
      if (alreadyDrafted.has(reviewId)) continue;
      // A prior owner dismissal is a durable per-review veto — never re-draft it.
      if (await isReviewReplyDeclined(t.id, reviewId)) continue;
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
   } catch {
     // per-tenant isolated — one tenant's failure never aborts the pool
   }
  });

  return { drafted };
}

/** Publish any auto-mode drafts whose safety window has elapsed. Best-effort,
 *  per-tenant isolated — one failure never blocks the rest. */
export async function runDueAutoPosts(nowMs: number): Promise<{ posted: number; failed: number }> {
  const tenants = await getAllTenants().catch(() => [] as TenantConfig[]);
  let posted = 0;
  let failed = 0;

  await mapPool(tenants, AUTO_REPLY_CONCURRENCY, async (t) => {
   try {
    if (t.active === false) return;
    // Re-check the live mode: a client who switched off "auto" after a draft was
    // stamped must NOT have it auto-post. The stale autoPostAt is ignored then.
    const mode = (await getReplyVoice(t.id).catch(() => null))?.mode;
    if (mode !== "auto") return;
    const pending = await getEvents(t.id, { status: "pending", limit: 200 }).catch(
      () => [] as UnifiedEvent[],
    );
    for (const e of pending) {
      if (e.metadata?.kind !== "review_reply_draft") continue;
      if (e.metadata?.autoPostFailed === true) continue; // gave up after the cap
      const at = e.metadata?.autoPostAt;
      if (typeof at !== "string") continue; // approve-mode drafts carry no timer
      const due = new Date(at).getTime();
      if (Number.isNaN(due) || due > nowMs) continue; // still inside the window
      let ok = false;
      try {
        const result = await resolveEventAction(t.id, e.id, "approved");
        ok = result.changed;
      } catch {
        ok = false;
      }
      if (ok) {
        posted += 1;
        continue;
      }
      failed += 1;
      // Bound the retries: after MAX_AUTO_POST_ATTEMPTS, stop auto-posting this
      // draft (it stays pending for manual handling) so a broken publish
      // precondition can't spam the queue + Slack on every 3h run forever.
      const attempts =
        (typeof e.metadata?.autoPostAttempts === "number" ? e.metadata.autoPostAttempts : 0) + 1;
      await updateEvent(e.id, (ev) => ({
        ...ev,
        metadata: {
          ...ev.metadata,
          autoPostAttempts: attempts,
          ...(attempts >= MAX_AUTO_POST_ATTEMPTS ? { autoPostFailed: true } : {}),
        },
      })).catch(() => {});
    }
   } catch {
     // per-tenant isolated — one tenant's failure never aborts the pool
   }
  });

  return { posted, failed };
}
