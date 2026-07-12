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
import { runDueAutoPosts } from "@/lib/reviews/auto-reply";

export const maxDuration = 300;

export async function GET() {
  const result = await runDueAutoPosts(Date.now());
  await recordHeartbeat("review-auto-post", { ok: true, ...result });
  return NextResponse.json({ ranAt: new Date().toISOString(), ...result });
}
