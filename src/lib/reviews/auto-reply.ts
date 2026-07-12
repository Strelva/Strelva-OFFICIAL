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
import { getEvents } from "../events";
import { resolveEventAction } from "../event-actions";
import { getAllTenants } from "../tenants";
import { getReplyVoice } from "./reply-voice";

/** The catch-window between "drafted" and "auto-posted" — long enough for the
 *  owner to veto a bad AI reply, short enough that the reply is still timely. */
export const AUTO_POST_DELAY_MS = 12 * 60 * 60 * 1000;

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
