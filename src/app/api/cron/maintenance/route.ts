import { NextResponse } from "next/server";
import { getAllTenants } from "@/lib/tenants";
import { pruneOldEvents } from "@/lib/events";

export async function GET() {
  const tenants = await getAllTenants();
  const active = tenants.filter((t) => t.active);

  let totalPruned = 0;
  const errors: string[] = [];

  for (const tenant of active) {
    try {
      const pruned = await pruneOldEvents(tenant.id);
      totalPruned += pruned;
    } catch (err) {
      errors.push(`${tenant.id}: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  }

  if (errors.length > 0 && process.env.SLACK_WEBHOOK_URL) {
    fetch(process.env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `Maintenance cron: ${errors.length} tenant(s) failed event pruning`,
      }),
    }).catch(() => {});
  }

  return NextResponse.json({
    tenants: active.length,
    eventsPruned: totalPruned,
    errors: errors.length,
  });
}
