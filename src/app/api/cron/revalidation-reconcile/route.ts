import { NextResponse } from "next/server";
import { recordHeartbeat } from "@/lib/heartbeat";
import { reconcileRevalidations } from "@/lib/revalidate-client";
import { requireCronRequest } from "@/lib/cron-auth";

// Cap matches the platform function ceiling — this cron iterates tenants and
// would otherwise die mid-batch at scale on a lower default.
export const maxDuration = 300;

export async function GET(request: Request) {
  const denied = requireCronRequest(request);
  if (denied) return denied;

  const results = await reconcileRevalidations();

  const counts = results.reduce(
    (acc, r) => { acc[r.action] = (acc[r.action] || 0) + 1; return acc; },
    {} as Record<string, number>,
  );
  const revalidated = counts.revalidated || 0;
  const failed = counts.failed || 0;

  if (failed > 0 && process.env.SLACK_WEBHOOK_URL) {
    const failedItems = results.filter((r) => r.action === "failed");
    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `Revalidation reconciliation: ${revalidated} re-synced, ${failed} failed — ${failedItems.map((f) => `${f.tenantId}: ${f.error}`).join(", ")}`,
      }),
    }).catch(() => {});
  }

  const status = failed === results.length && results.length > 0 ? 500 : 200;

  await recordHeartbeat("revalidation-reconcile", { ok: failed === 0, processed: results.length, failed });

  return NextResponse.json({
    total: results.length,
    revalidated,
    failed,
    skipped: counts.skipped || 0,
    up_to_date: counts.up_to_date || 0,
  }, { status });
}
