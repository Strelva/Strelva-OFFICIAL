import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { checkHeartbeats, recordHeartbeat } from "@/platform/infra/heartbeat";
import { reportCronHeartbeat } from "@/platform/infra/monitoring";
import { requireCronRequest } from "@/lib/cron-auth";

// Cap matches the platform function ceiling — this cron iterates tenants and
// would otherwise die mid-batch at scale on a lower default.
export const maxDuration = 300;

/**
 * Cron watchdog. Runs every 30 min (vercel.json), checks that every known cron
 * has a fresh successful heartbeat, and alerts on failures or staleness — so a silently-
 * dead cron is noticed in minutes, not from an angry customer. CRON_SECRET-gated
 * by the proxy (isCronRoute matches /api/cron/*).
 */
export async function GET(request: Request) {
  const denied = requireCronRequest(request);
  if (denied) return denied;

  const statuses = await checkHeartbeats();
  const stale = statuses.filter((s) => s.stale);
  const failed = statuses.filter((s) => s.lastOk === false);
  const requestId = randomUUID();
  for (const status of statuses) await reportCronHeartbeat(status, requestId);
  // The watchdog is itself a registered cron. Record its own run, otherwise it
  // has no heartbeat and reports itself stale on every pass.
  await recordHeartbeat("heartbeat", { ok: true, processed: statuses.length });
  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    total: statuses.length,
    stale: stale.length,
    failed: failed.length,
    statuses,
  });
}
