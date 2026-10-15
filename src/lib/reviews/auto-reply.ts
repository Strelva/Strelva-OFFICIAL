import { googleReviewContentLive } from "@/platform/infra/google-review-content";
import { workspacePorts } from "../workspace-ports";
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
 *                For a business with a workspace, STRELVA_AUTO_POST_DECISION_RECORD
 *                records the post as a Needs you policy decision first, and a
 *                decision the owner holds open blocks it.
 */

import type { TenantConfig, UnifiedEvent } from "../types";
import { getEventsRaw, addEvent, updateEvent } from "../events";
import { AUTO_REPLY_ACTOR, resolveEventAction } from "../event-actions";
import { getAllTenants } from "../tenants";
import { getReplyVoice } from "./reply-voice";
import { getReviews } from "../reviews";
import { draftReviewReplyWithProvenance, storeRecentReply, isReviewReplyDeclined } from "../review-replies";
import { mapPool } from "../concurrency";
import { autoReplyAllowed } from "./auto-reply-rule";

export { AUTO_REPLY_MIN_RATING, autoReplyAllowed } from "./auto-reply-rule";

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
    if (!(await (await workspacePorts().tenantReviewReplies()).listingDraftingAllowed(t.id))) return;

    const [reviews, pending] = await Promise.all([
      getReviews(t.id).catch(() => []),
      getEventsRaw(t.id, { status: "pending", limit: 200 }).catch(() => [] as UnifiedEvent[]),
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
      if (r.source !== "google" || !googleReviewContentLive(r.providerContent, nowMs)) continue;
      const reviewId = r.externalId ?? r.id;
      if (alreadyDrafted.has(reviewId)) continue;
      // A prior owner dismissal is a durable per-review veto — never re-draft it.
      if (await isReviewReplyDeclined(t.id, reviewId)) continue;
      try {
        const draft = await draftReviewReplyWithProvenance(
          { reviewId, reviewerName: r.author, rating: r.rating, comment: r.text },
          t,
        );
        const reply = draft.text;
        await addEvent({
          tenantId: t.id,
          source: "ai",
          type: "review",
          title: `Drafted reply for ${r.author}'s ${r.rating}-star review`,
          body: reply,
          status: "pending",
          metadata: {
            kind: "review_reply_draft",
            providerContent: r.providerContent,
            reviewId,
            rating: r.rating,
            author: r.author,
            draftedReply: reply,
            replyGeneration: draft.generation,
            // 1 and 2 star replies always go to the owner, even in auto mode.
            ...(voice.mode === "auto" && draft.generation === "model" && autoReplyAllowed(r.rating)
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

/** STRELVA_AUTO_POST_DECISION_RECORD (off by default): needs the policy decision migration. */
function autoPostDecisionRecordEnabled(): boolean {
  return process.env.STRELVA_AUTO_POST_DECISION_RECORD === "1";
}

/**
 * Post one due reply. For a business with a workspace the post goes through a
 * policy decision (route handle_after_notice, decided by the notice setting),
 * so What changed shows it once; otherwise the direct resolver runs as before.
 * `hold` means nothing was posted and nothing failed: this attempt is already
 * recorded, or the owner holds the reply open.
 */
async function autoPostThroughDecision(tenantId: string, event: UnifiedEvent): Promise<{ changed: boolean; hold?: boolean }> {
  const direct = () => resolveEventAction(tenantId, event.id, "approved", AUTO_REPLY_ACTOR);
  if (!autoPostDecisionRecordEnabled()) return direct();
  try {
    const recorded = await (await workspacePorts().tenantEventDecisions()).recordAutoPostPolicyDecision(tenantId, event);
    if (recorded === "direct") return direct();
    switch (recorded.status) {
      case "done":
      case "done_unverified": return { changed: true };
      case "already_handled":
      case "owner_decides": return { changed: false, hold: true };
      case "unsupported": return direct();
      default: return { changed: false };
    }
  } catch {
    // The record could not be written (for example the migration is not applied): nothing posted yet, so take the direct path.
    return direct();
  }
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
    const pending = await getEventsRaw(t.id, { status: "pending", limit: 200 }).catch(
      () => [] as UnifiedEvent[],
    );
    for (const e of pending) {
      if (e.metadata?.kind !== "review_reply_draft" || !googleReviewContentLive(e.metadata.providerContent, nowMs)) continue;
      if (e.metadata?.replyGeneration !== "model") continue; // unknown and template drafts need the owner
      if (e.metadata?.autoPostFailed === true) continue; // gave up after the cap
      // A draft stamped before the rating rule still goes to the owner.
      if (!autoReplyAllowed(e.metadata?.rating)) continue;
      const at = e.metadata?.autoPostAt;
      if (typeof at !== "string") continue; // approve-mode drafts carry no timer
      const due = new Date(at).getTime();
      if (Number.isNaN(due) || due > nowMs) continue; // still inside the window
      let ok = false;
      try {
        const result = await autoPostThroughDecision(t.id, e);
        if (result.hold) continue;
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

/**
 * An agency or Strelva operator held automatic replies (or paused the client):
 * take the post timer off every model draft still waiting. The drafts stay
 * pending, so the owner decides each one. Best-effort; returns how many it changed.
 */
export async function withdrawPendingAutoPosts(
  tenantId: string,
  input: { by: "agency" | "operator" },
  nowMs = Date.now(),
): Promise<number> {
  const pending = await getEventsRaw(tenantId, { status: "pending", limit: 200 });
  let withdrawn = 0;
  for (const e of pending) {
    if (e.metadata?.kind !== "review_reply_draft" || typeof e.metadata?.autoPostAt !== "string") continue;
    const { event, changed } = await updateEvent(e.id, (ev) => {
      const { autoPostAt: _autoPostAt, ...metadata } = ev.metadata ?? {};
      return { ...ev, metadata: { ...metadata, autoPostWithdrawnAt: new Date(nowMs).toISOString(), autoPostWithdrawnBy: input.by } };
    });
    if (event && changed) withdrawn += 1;
  }
  return withdrawn;
}
