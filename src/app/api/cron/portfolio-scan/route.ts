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
  const { scanned, failed } = await scanAllTenants();

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
