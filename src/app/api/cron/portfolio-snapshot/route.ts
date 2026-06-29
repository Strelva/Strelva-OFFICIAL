import { NextResponse } from "next/server";
import { recordHeartbeat } from "@/lib/heartbeat";
import { buildPortfolioSnapshot, setPortfolioSummary } from "@/lib/portfolio";

// Cap matches the platform function ceiling — this cron iterates tenants and
// would otherwise die mid-batch at scale on a lower default.
export const maxDuration = 300;

/**
 * Recompute the portfolio brain and warm the Redis cache so Mission Control and
 * the operator agent read an aggregate instead of fanning out per tenant on
 * every load. Auth is handled by the proxy (CRON_SECRET). Scheduled off-peak in
 * vercel.json to avoid the existing 6am poller stampede.
 */
export async function GET() {
  try {
    const snapshot = await buildPortfolioSnapshot();
    await setPortfolioSummary(snapshot);
    await recordHeartbeat("portfolio-snapshot", { ok: true, processed: snapshot.tenantCount });
    return NextResponse.json({
      ok: true,
      snapshotAt: snapshot.snapshotAt,
      tenants: snapshot.tenantCount,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[cron portfolio-snapshot] failed:", err);
    if (process.env.SLACK_WEBHOOK_URL) {
      // Await so the alert flushes before the function freezes on Vercel.
      await fetch(process.env.SLACK_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `⚠ portfolio-snapshot cron failed: ${msg}` }),
      }).catch(() => {});
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
