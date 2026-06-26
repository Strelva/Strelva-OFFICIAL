import { NextResponse } from "next/server";
import { recordHeartbeat } from "@/lib/heartbeat";
import { scanAllTenants } from "@/lib/scan";

export const maxDuration = 300;

/**
 * Portfolio scan cron — re-runs the SEO + site-health scan for every active
 * tenant on a schedule so the Mission Control overview grades stay current
 * without anyone clicking. Per-tenant failures (e.g. dead DNS) are collected,
 * not fatal. Auth is handled by the proxy (CRON_SECRET check).
 */
export async function GET() {
  // Cap how many tenants one daily run scans (each scan is ~35s; concurrency 6
  // under a 300s budget tops out near ~50 before the function would time out and
  // silently drop the tail). The cap ROTATES daily so every tenant is still
  // covered over ceil(n/cap) days — no tenant is starved. Lift the cap by raising
  // PORTFOLIO_SCAN_MAX_TENANTS_PER_RUN, or move to a queue past that ceiling.
  const maxPerRun = Number(process.env.PORTFOLIO_SCAN_MAX_TENANTS_PER_RUN || 40);
  const rotateIndex = Math.floor(Date.now() / (24 * 3600 * 1000));
  const { scanned, failed, deferred, windowIndex, windowCount } = await scanAllTenants(6, {
    maxPerRun,
    rotateIndex,
  });

  if (deferred > 0) {
    console.warn(
      `[portfolio-scan] tenant cap hit: scanned ${scanned.length} ` +
        `(window ${windowIndex}/${windowCount}), ${deferred} deferred to later days`
    );
  }

  if (failed.length > 0 && process.env.SLACK_WEBHOOK_URL) {
    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `Portfolio scan: ${failed.length} site(s) failed — ${failed
          .map((f) => `${f.tenant} (${f.error})`)
          .join(", ")}`,
      }),
    }).catch(() => {});
  }

  await recordHeartbeat("portfolio-scan", { ok: failed.length === 0, processed: scanned.length, failed: failed.length });

  return NextResponse.json({ scanned: scanned.length, failed, results: scanned });
}
