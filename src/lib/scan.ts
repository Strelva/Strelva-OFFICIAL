/**
 * Operator scan — runs the SEO + site-health audit against a tenant's live
 * public site and persists a compact summary. Shared by the super-admin scan
 * route (manual, one tenant) and the portfolio-scan cron (scheduled, all
 * tenants) so both go through one code path.
 */

import { getTenantConfig, getAllTenants } from "@/lib/tenants";
import { getTenantPublicUrl } from "@/lib/tenant-urls";
import { runAudit } from "@/lib/audit/checks";
import type { CategoryResult } from "@/lib/audit/types";
import { type TrafficProfile, GENERIC_METRICS } from "@/lib/audit/impact";
import { computeOverallScore, scoreToGrade } from "@/lib/audit/scoring";
import { prioritizeIssues } from "@/lib/audit/prioritize";
import {
  saveScanSummary,
  pushScanHistory,
  saveScanBaseline,
  getScanBaseline,
  getScanHistory,
  type ScanSummary,
  type ScanPrioritizedIssue,
} from "@/lib/scan-store";
import { selectRunWindow } from "@/lib/visibility/schedule";
import { getGa4Perf } from "@/lib/analytics";
import { getLeadSummary } from "@/lib/leads";

export interface ScanResult extends ScanSummary {
  /** Full per-category detail (not persisted; returned for the live UI). */
  detail: CategoryResult[];
}

/**
 * A paying client's REAL monthly traffic, for the dollar-impact estimates —
 * or `undefined` when GA4 isn't lit up yet (so the audit stays on the generic
 * prior). Visitors come from GA4 (the canonical traffic source); the conversion
 * rate is derived from real 30-day leads when we have them, else the
 * conservative default. Order value stays a documented prior — the audit path
 * has no per-tenant AOV. All reads are best-effort: any failure → generic.
 */
async function measuredTraffic(tenantId: string): Promise<TrafficProfile | undefined> {
  const ga = await getGa4Perf(tenantId, 30).catch(() => null);
  if (!ga || ga.status !== "ok" || ga.users <= 0) return undefined;

  const visitors = ga.users;
  const leads = await getLeadSummary(tenantId, 30).catch(() => ({ count: 0 }));
  // Leads are real "who reached out" conversions over the same 30-day window.
  // Fall back to the shared generic prior (single source of truth in impact.ts)
  // when there's no conversion signal yet; order value has no per-tenant source
  // in the audit path, so it always uses that prior.
  const conversionRate =
    leads.count > 0
      ? Math.min(0.5, Math.max(0.005, leads.count / visitors))
      : GENERIC_METRICS.conversionRate;

  return {
    monthlyVisitors: visitors,
    conversionRate,
    orderValue: GENERIC_METRICS.orderValue,
    source: "measured",
  };
}

/**
 * Scan one tenant's live site, persist the summary, and return the full result.
 * Throws if the tenant is unknown or the audit itself fails (e.g. dead DNS) —
 * callers decide whether to surface (route) or collect (cron).
 */
export async function scanTenant(tenantId: string): Promise<ScanResult> {
  const config = await getTenantConfig(tenantId);
  if (!config) throw new Error(`No tenant "${tenantId}"`);

  // Always scan the client's real live site, not the localhost dev URL.
  const url = getTenantPublicUrl(config, "production");

  const traffic = await measuredTraffic(tenantId);
  const detail = await runAudit(url, { traffic });
  const overallScore = computeOverallScore(detail);
  const grade = scoreToGrade(overallScore);
  const scannedAt = new Date().toISOString();

  // Rank the audit's failing/warning checks into the "fix first" verdict and
  // persist a compact, capped copy alongside the grade — so the admin view
  // renders the verdict on load instead of null-until-rescan. Pure transform
  // over the AuditResult we already have; the store deliberately stays small,
  // so only the top few and only the fields the UI renders are kept.
  const prioritizedIssues: ScanPrioritizedIssue[] = prioritizeIssues({
    url,
    scannedAt,
    overallScore,
    grade,
    categories: detail,
  }).issues
    .slice(0, 8)
    .map((i) => ({
      message: i.message,
      category: i.category,
      priority: i.priority,
      impact: i.impact,
      quantified: i.quantified,
    }));

  const summary: ScanSummary = {
    url,
    scannedAt,
    overallScore,
    grade,
    categories: detail.map((c) => ({ name: c.name, slug: c.slug, score: c.score })),
    // Omit the field entirely on a spotless site so an empty list never bloats
    // the record and legacy/empty reads stay identical.
    ...(prioritizedIssues.length > 0 ? { prioritizedIssues } : {}),
  };
  const point = { scannedAt, overallScore, grade };
  await saveScanSummary(tenantId, summary);
  await pushScanHistory(tenantId, point);

  // Capture the durable day-0 anchor once. Seed it from the earliest point we
  // already retain so an existing tenant gets its best available baseline now,
  // rather than resetting the 90-day clock to today.
  if (!(await getScanBaseline(tenantId))) {
    const history = await getScanHistory(tenantId); // oldest -> newest (incl. this scan)
    await saveScanBaseline(tenantId, history[0] ?? point);
  }

  return { ...summary, detail };
}

export interface PortfolioScanOutcome {
  scanned: { tenant: string; grade: ScanSummary["grade"]; score: number }[];
  failed: { tenant: string; error: string }[];
  /** Tenants NOT scanned this run because a per-run cap was hit (0 when uncapped). */
  deferred: number;
  /** Rotation window covered this run, when a cap is applied (1-based). */
  windowIndex?: number;
  windowCount?: number;
}

/**
 * Scan every active tenant, isolating per-tenant failures (e.g. broken DNS).
 *
 * Bounded-parallel: each scan does an external page fetch + PageSpeed call
 * (up to ~35s), so a sequential loop would exhaust the cron's function budget
 * and silently drop the tenants at the end of the list. A worker pool keeps a
 * fixed number of scans in flight at once. Concurrency is capped (not unbounded)
 * because PageSpeed has its own rate quota.
 *
 * `window` optionally caps how many tenants a single run scans, rotating the
 * covered slice by `rotateIndex` so every tenant is still scanned over
 * ceil(n/maxPerRun) runs — no tenant is silently starved past the cap. The
 * scheduled cron passes a daily-rotating window; the manual super-admin
 * "scan all" omits it and scans everyone now.
 */
export async function scanAllTenants(
  concurrency = 6,
  window?: { maxPerRun: number; rotateIndex: number }
): Promise<PortfolioScanOutcome> {
  const active = (await getAllTenants()).filter((t) => t.active);
  const sel = window
    ? selectRunWindow(active, window.maxPerRun, window.rotateIndex)
    : { toRun: active, deferred: 0, windowIndex: undefined, windowCount: undefined };
  const tenants = sel.toRun;
  const scanned: PortfolioScanOutcome["scanned"] = [];
  const failed: PortfolioScanOutcome["failed"] = [];

  let next = 0;
  async function worker() {
    while (next < tenants.length) {
      const t = tenants[next++];
      try {
        const r = await scanTenant(t.id);
        scanned.push({ tenant: t.id, grade: r.grade, score: r.overallScore });
      } catch (err) {
        failed.push({ tenant: t.id, error: err instanceof Error ? err.message : "Unknown" });
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, tenants.length) },
    () => worker()
  );
  await Promise.all(workers);

  return { scanned, failed, deferred: sel.deferred, windowIndex: sel.windowIndex, windowCount: sel.windowCount };
}
