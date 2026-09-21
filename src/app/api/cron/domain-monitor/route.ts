import { NextResponse } from "next/server";
import { recordHeartbeat } from "@/lib/heartbeat";
import { requireCronRequest } from "@/lib/cron-auth";
import { scanPortfolioDomains, summarizeDomainAlerts } from "@/lib/domain-monitor";
import {
  saveDomainHealth,
  getAlertSignature,
  setAlertSignature,
} from "@/lib/domain-monitor-store";
import { sendDomainAlertEmail } from "@/products/domain-monitor/server";
import { OPERATOR_URL } from "@/lib/brand";

export const maxDuration = 300;

/**
 * Domain-monitor cron — checks every active tenant's client-facing domain for
 * (1) downtime / parking pages (HTTP 200 with a parking body still counts as
 * down) and (2) registry expiry, then emails the operators when the problem set
 * changes. Built after the Orange Crate outage (registrar payment lapsed → the
 * domain served a GoDaddy parking stub for a week before anyone noticed).
 *
 * Alerting is deduped by a stored signature: a persistent outage is ONE email,
 * a new/cleared/threshold-crossing problem is a fresh one. Auth: proxy CRON_SECRET
 * gate + the handler guard below. Schedule: see vercel.json (every 30 min).
 */
export async function GET(request: Request) {
  const denied = requireCronRequest(request);
  if (denied) return denied;

  const started = Date.now();
  let ok = true;
  try {
    const results = await scanPortfolioDomains();
    await saveDomainHealth(results);

    const { down, expiring, signature } = summarizeDomainAlerts(results);
    const prev = (await getAlertSignature()) ?? "";

    if (signature !== prev) {
      // The problem set changed. Email once — a recovery (both lists empty after
      // a prior problem) sends an all-clear; unchanged signatures never re-send.
      const hadProblems = prev.length > 0;
      if (down.length || expiring.length || hadProblems) {
        await sendDomainAlertEmail({
          down,
          expiring,
          boardUrl: new URL("/admin/uptime", OPERATOR_URL).toString(),
          logPrefix: "[domain-monitor]",
        });
      }
      await setAlertSignature(signature);
    }

    return NextResponse.json({
      scanned: results.length,
      down: down.length,
      expiring: expiring.length,
    });
  } catch (err) {
    ok = false;
    console.error("[domain-monitor] scan failed:", err);
    return NextResponse.json({ error: "domain-monitor failed" }, { status: 500 });
  } finally {
    await recordHeartbeat("domain-monitor", {
      ok,
      durationMs: Date.now() - started,
    });
  }
}
