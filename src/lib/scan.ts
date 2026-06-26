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
import { computeOverallScore, scoreToGrade } from "@/lib/audit/scoring";
import { saveScanSummary, pushScanHistory, type ScanSummary } from "@/lib/scan-store";
import { selectRunWindow } from "@/lib/visibility/schedule";

export interface ScanResult extends ScanSummary {
  /** Full per-category detail (not persisted; returned for the live UI). */
  detail: CategoryResult[];
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

  const detail = await runAudit(url);
  const overallScore = computeOverallScore(detail);
  const grade = scoreToGrade(overallScore);
  const scannedAt = new Date().toISOString();

  const summary: ScanSummary = {
    url,
    scannedAt,
    overallScore,
    grade,
    categories: detail.map((c) => ({ name: c.name, slug: c.slug, score: c.score })),
  };
  await saveScanSummary(tenantId, summary);
  await pushScanHistory(tenantId, { scannedAt, overallScore, grade });

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
