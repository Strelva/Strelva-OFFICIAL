import { NextResponse } from "next/server";
import { recordHeartbeat } from "@/lib/heartbeat";
import { mapPool } from "@/lib/concurrency";
import { getServiceHealth } from "@/lib/health";
import { alertOnce } from "@/lib/monitoring";
import { getAllTenants } from "@/lib/tenants";
import { pruneOldEvents } from "@/lib/events";
import { createDailySiteSnapshot } from "@/lib/storage";
import { queueRetentionReengagement } from "@/lib/retention";
import { requireCronRequest } from "@/lib/cron-auth";

// Cap matches the platform function ceiling — this cron iterates tenants and
// would otherwise die mid-batch at scale on a lower default.
export const maxDuration = 300;

export async function GET(request: Request) {
  const denied = requireCronRequest(request);
  if (denied) return denied;

  const tenants = await getAllTenants();
  const active = tenants.filter((t) => t.active);

  let totalPruned = 0;
  let snapshotsCreated = 0;
  let reengagementQueued = 0;
  const errors: string[] = [];

  await mapPool(active, 8, async (tenant) => {
    try {
      const pruned = await pruneOldEvents(tenant.id);
      totalPruned += pruned;
      const backup = await createDailySiteSnapshot(tenant.id);
      if (backup.created) snapshotsCreated += 1;
      const reengagement = await queueRetentionReengagement(tenant.id);
      if (reengagement.queued) reengagementQueued += 1;
    } catch (err) {
      errors.push(`${tenant.id}: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  });

  if (errors.length > 0 && process.env.SLACK_WEBHOOK_URL) {
    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `Maintenance cron: ${errors.length} tenant(s) failed maintenance work`,
      }),
    }).catch(() => {});
  }

  // Daily dependency probe. The maintenance cron is the one guaranteed daily
  // touchpoint, so use it to confirm Redis/Sanity/Clerk are reachable and page
  // (deduped) if a core dependency is down or degraded.
  let healthStatus = "unknown";
  try {
    const health = await getServiceHealth();
    healthStatus = health.status;
    if (health.status !== "healthy") {
      const broken = Object.entries(health.checks)
        .filter(([, c]) => c.status === "error")
        .map(([name]) => name);
      await alertOnce(
        "dependency_health_degraded",
        health.status === "down" ? "critical" : "high",
        { overall: health.status, failing: broken },
        3600
      );
    }
  } catch (err) {
    console.error("[cron maintenance] health probe failed:", err);
  }

  await recordHeartbeat("maintenance", { ok: errors.length === 0, processed: active.length, failed: errors.length });

  return NextResponse.json({
    tenants: active.length,
    health: healthStatus,
    eventsPruned: totalPruned,
    snapshotsCreated,
    reengagementQueued,
    errors: errors.length,
  });
}
