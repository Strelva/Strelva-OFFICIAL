import { NextResponse } from "next/server";
import { checkHeartbeats } from "@/lib/heartbeat";
import { alertOnce } from "@/lib/monitoring";
import { requireCronRequest } from "@/lib/cron-auth";

// Cap matches the platform function ceiling — this cron iterates tenants and
// would otherwise die mid-batch at scale on a lower default.
export const maxDuration = 300;

/**
 * Cron watchdog. Runs every 30 min (vercel.json), checks that every known cron
 * has a fresh heartbeat, and alerts (deduped) on any stale one — so a silently-
 * dead cron is noticed in minutes, not from an angry customer. CRON_SECRET-gated
 * by the proxy (isCronRoute matches /api/cron/*).
 */
export async function GET(request: Request) {
  const denied = requireCronRequest(request);
  if (denied) return denied;

  const statuses = await checkHeartbeats();
  const stale = statuses.filter((s) => s.stale);
  for (const s of stale) {
    await alertOnce(
      "cron_stale",
      "high",
      { cron: s.cron, lastSeen: s.lastSeen ?? "never", ageSeconds: s.ageSeconds ?? -1 },
      6 * 3600 // re-page at most every 6h per cron
    );
  }
  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    total: statuses.length,
    stale: stale.length,
    statuses,
  });
}
