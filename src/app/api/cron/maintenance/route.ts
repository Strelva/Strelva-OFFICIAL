import { NextResponse } from "next/server";
import { getAllTenants } from "@/lib/tenants";
import { pruneOldEvents } from "@/lib/events";
import { createDailySiteSnapshot } from "@/lib/storage";
import { queueRetentionReengagement } from "@/lib/retention";

export async function GET() {
  // Auth handled by proxy (CRON_SECRET check)

  const tenants = await getAllTenants();
  const active = tenants.filter((t) => t.active);

  let totalPruned = 0;
  let snapshotsCreated = 0;
  let reengagementQueued = 0;
  const errors: string[] = [];

  for (const tenant of active) {
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
  }

  if (errors.length > 0 && process.env.SLACK_WEBHOOK_URL) {
    fetch(process.env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `Maintenance cron: ${errors.length} tenant(s) failed maintenance work`,
      }),
    }).catch(() => {});
  }

  return NextResponse.json({
    tenants: active.length,
    eventsPruned: totalPruned,
    snapshotsCreated,
    reengagementQueued,
    errors: errors.length,
  });
}
