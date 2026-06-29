/**
 * Daily proof-signal rollup (Workstream E).
 *
 * Reads per-tenant agent-call counts from Redis for the prior day and
 * posts one Slack line per tenant broken down by "by owner" / "by Jacob".
 * This is the daily grade on whether owners are texting the agent
 * unprompted (the core bet).
 *
 * Auth: handled by proxy (CRON_SECRET check).
 * Schedule: see vercel.json.
 */

import { NextResponse } from "next/server";
import { recordHeartbeat } from "@/lib/heartbeat";
import { mapPool } from "@/lib/concurrency";
import { getAllTenants } from "@/lib/tenants";
import { postSlack, readAndResetDailyCounts } from "@/lib/proof-signals";

// Cap matches the platform function ceiling — this cron iterates tenants and
// would otherwise die mid-batch at scale on a lower default.
export const maxDuration = 300;

function yesterdayKey(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  // Auth handled by proxy (CRON_SECRET check)

  const day = yesterdayKey();
  const tenants = await getAllTenants();
  const active = tenants.filter((t) => t.active && t.subscriptionStatus !== "cancelled");

  const lines: string[] = [];
  let totalOwner = 0;
  let totalJacob = 0;

  await mapPool(active, 8, async (tenant) => {
    const { owner, jacob } = await readAndResetDailyCounts(tenant.id, day);
    totalOwner += owner;
    totalJacob += jacob;
    // Only report tenants with any activity — a zero line per tenant
    // would nuke the Slack channel once we have more than a few clients.
    if (owner === 0 && jacob === 0) return;
    lines.push(`• *${tenant.siteName}* — ${owner} by owner, ${jacob} by Jacob`);
  });

  if (lines.length === 0) {
    postSlack(`[Daily agent rollup ${day}] No agent activity across ${active.length} active tenants.`);
  } else {
    const header = `[Daily agent rollup ${day}] ${totalOwner} owner calls, ${totalJacob} Jacob calls across ${lines.length} tenant(s):`;
    postSlack([header, ...lines].join("\n"));
  }

  await recordHeartbeat("daily-summary", { ok: true, processed: active.length });

  return NextResponse.json({
    day,
    tenantsChecked: active.length,
    tenantsWithActivity: lines.length,
    totalOwner,
    totalJacob,
  });
}
