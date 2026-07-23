import { NextResponse } from "next/server";
import { recordHeartbeat } from "@/lib/heartbeat";
import { scanAllTenants } from "@/lib/scan";
import { getAllTenants } from "@/lib/tenants";
import { getScanSummaries } from "@/lib/scan-store";
import { getRedis } from "@/lib/redis";
import { sendHealthRegressionEmail } from "@/lib/delivery-email";
import { getTenantDashboardUrl } from "@/lib/tenant-urls";
import { requireCronRequest } from "@/lib/cron-auth";

export const maxDuration = 300;

/** Worse grade = higher rank. A regression is a strictly-higher rank than the
 *  last stored grade (a full letter-grade drop). */
const GRADE_RANK: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, F: 4 };

/** Don't re-email the same transition within this window even if the grade flaps. */
const HEALTH_ALERT_TTL_SECONDS = 14 * 24 * 60 * 60;

/**
 * Portfolio scan cron — re-runs the SEO + site-health scan for every active
 * tenant on a schedule so the Mission Control overview grades stay current
 * without anyone clicking. Per-tenant failures (e.g. dead DNS) are collected,
 * not fatal. Auth is handled by the proxy (CRON_SECRET check).
 *
 * Also fires the client-facing health-regression alert: the LAST stored grade is
 * read BEFORE the scan overwrites it, and any tenant whose fresh grade dropped a
 * full letter (vs that baseline) gets one owner email — deduped per transition,
 * gated by the client email pause, fail-soft.
 */
export async function GET(request: Request) {
  const denied = requireCronRequest(request);
  if (denied) return denied;

  // Cap how many tenants one daily run scans (each scan is ~35s; concurrency 6
  // under a 300s budget tops out near ~50 before the function would time out and
  // silently drop the tail). The cap ROTATES daily so every tenant is still
  // covered over ceil(n/cap) days — no tenant is starved. Lift the cap by raising
  // PORTFOLIO_SCAN_MAX_TENANTS_PER_RUN, or move to a queue past that ceiling.
  const maxPerRun = Number(process.env.PORTFOLIO_SCAN_MAX_TENANTS_PER_RUN || 40);
  const rotateIndex = Math.floor(Date.now() / (24 * 3600 * 1000));

  // Snapshot the last stored grade per tenant BEFORE scanAllTenants overwrites it
  // — the regression check compares each fresh grade against this baseline.
  const active = (await getAllTenants()).filter((t) => t.active);
  const priorSummaries = await getScanSummaries(active.map((t) => t.id));

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

  // Health-regression alerts (client-facing). Best-effort; never affects the 200.
  const tenantById = new Map(active.map((t) => [t.id, t]));
  const redis = getRedis();
  let regressionAlerts = 0;
  for (const s of scanned) {
    const prior = priorSummaries[s.tenant];
    if (!prior) continue; // no baseline yet (first scan) — nothing to regress from
    const prevRank = GRADE_RANK[prior.grade];
    const curRank = GRADE_RANK[s.grade];
    if (prevRank === undefined || curRank === undefined) continue;
    if (curRank <= prevRank) continue; // same or better — not a regression

    // Hysteresis: a letter-grade drop caused by PSI availability/lab jitter (a
    // Google API blip zeroes web-vitals+mobile and recomputes the overall a few
    // points; lab metrics jitter across the 2500ms/0.1/200ms cliffs) must not
    // email the owner "your health regressed" for a boundary flip on noise.
    // Require a meaningful score drop alongside the letter change.
    const HEALTH_REGRESSION_MIN_DROP = 5;
    if (prior.overallScore - s.score < HEALTH_REGRESSION_MIN_DROP) continue;

    const tenant = tenantById.get(s.tenant);
    const email = tenant?.ownerEmail?.trim();
    if (!tenant || !email || !redis) continue;

    const key = `reb:health-alert-sent:${s.tenant}:${prior.grade}>${s.grade}`;
    const fresh = await redis.set(key, "1", { nx: true, ex: HEALTH_ALERT_TTL_SECONDS }).catch(() => null);
    if (!fresh) continue; // already alerted for this exact transition

    const ok = await sendHealthRegressionEmail({
      email,
      businessName: tenant.siteName,
      ownerName: tenant.ownerName?.trim() || undefined,
      previousGrade: prior.grade,
      currentGrade: s.grade,
      previousScore: prior.overallScore,
      currentScore: s.score,
      healthUrl: getTenantDashboardUrl(tenant, "/dashboard/health"),
      // Opt in to the CRM comms log so a real health-drop alert accrues on the timeline.
      tenantId: tenant.id,
      logPrefix: "[cron portfolio-scan]",
    });
    if (ok) regressionAlerts++;
    // Suppressed (client pause) or failed — release the marker so the alert can
    // fire once client email is switched on, instead of being lost.
    else await redis.del(key).catch(() => {});
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

  return NextResponse.json({ scanned: scanned.length, failed, regressionAlerts, results: scanned });
}
