/**
 * Auto-post cron for done-for-you review replies.
 *
 * Clients on "auto" reply mode get their AI-drafted reply posted automatically
 * once its safety window elapses (see reviews/auto-reply.ts). This publishes
 * through the SAME governed path a manual approval uses — it never invents a new
 * external-write path. A draft edited or dismissed before its window simply
 * isn't pending anymore, so it won't fire.
 *
 * Auth: proxy (CRON_SECRET). Schedule: vercel.json (every 3h).
 */

import { NextResponse } from "next/server";
import { recordHeartbeat } from "@/lib/heartbeat";
import { runDueAutoPosts, draftReplyBacklog } from "@/lib/reviews/auto-reply";
import { requireCronRequest } from "@/lib/cron-auth";

export const maxDuration = 300;

export async function GET(request: Request) {
  const denied = requireCronRequest(request);
  if (denied) return denied;

  const now = Date.now();
  // Catch up any unreplied backlog first (so it's drafted + queued), then fire
  // the auto-mode drafts whose window has elapsed.
  const backlog = await draftReplyBacklog(now);
  const posted = await runDueAutoPosts(now);
  const result = { drafted: backlog.drafted, ...posted };
  await recordHeartbeat("review-auto-post", { ok: true, ...result });
  return NextResponse.json({ ranAt: new Date().toISOString(), ...result });
}
