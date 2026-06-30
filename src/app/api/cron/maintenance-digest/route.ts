import { NextResponse } from "next/server";
import { mapPool } from "@/lib/concurrency";
import { recordHeartbeat } from "@/lib/heartbeat";
import { getActiveTenants } from "@/lib/tenants";
import {
  buildMaintenanceDigest,
  saveMaintenanceDigest,
  getMaintenanceDigest,
} from "@/lib/maintenance-digest";

// Auth handled by the proxy (CRON_SECRET check).
export const maxDuration = 300;

/**
 * Weekly: propose the upkeep each active site needs and queue it for operator
 * review (the autonomous-maintenance digest). Runs Monday before the weekly
 * report so the operator can greenlight the week's work up front.
 */
export async function GET() {
  const tenants = await getActiveTenants();
  let generated = 0;

  await mapPool(tenants, 8, async (tenant) => {
    try {
      // Don't clobber a digest the operator hasn't decided on yet.
      const existing = await getMaintenanceDigest(tenant.id);
      if (existing && existing.status === "pending") return;

      const digest = await buildMaintenanceDigest(tenant.id, tenant.siteName || tenant.id);
      if (digest.items.length === 0) return;
      await saveMaintenanceDigest(digest);
      generated++;
    } catch {
      // One tenant's failure never sinks the batch.
    }
  });

  await recordHeartbeat("maintenance-digest", { ok: true, processed: generated });
  return NextResponse.json({ generated });
}
