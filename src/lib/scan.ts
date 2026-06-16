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
}

/** Scan every active tenant, isolating per-tenant failures (e.g. broken DNS). */
export async function scanAllTenants(): Promise<PortfolioScanOutcome> {
  const tenants = (await getAllTenants()).filter((t) => t.active);
  const scanned: PortfolioScanOutcome["scanned"] = [];
  const failed: PortfolioScanOutcome["failed"] = [];

  for (const t of tenants) {
    try {
      const r = await scanTenant(t.id);
      scanned.push({ tenant: t.id, grade: r.grade, score: r.overallScore });
    } catch (err) {
      failed.push({ tenant: t.id, error: err instanceof Error ? err.message : "Unknown" });
    }
  }

  return { scanned, failed };
}
