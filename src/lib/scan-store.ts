/**
 * Scan store — persists the latest operator SEO + site-health scan per tenant.
 *
 * The scan engine (src/lib/audit/checks.ts) is point-in-time; this keeps the
 * most recent result per tenant in Redis so the Mission Control overview can
 * show every client's grade at a glance and the operator agent can reason over
 * it ("which client has the worst SEO?") without re-running a live scan.
 *
 * We store a compact summary (overall grade/score + per-category scores), not
 * the full per-check detail, to keep the record small. The full breakdown is
 * always available by re-running the scan on the tenant detail page.
 */

import { getRedis } from "./redis";

/** `reb:` persistent-data prefix per AGENTS.md (wire/persistent prefixes unchanged). */
const SCAN_PREFIX = "reb:scan:";
/** Scans are point-in-time signals; keep the latest for 30 days. */
const SCAN_TTL_SECONDS = 60 * 60 * 24 * 30;

export interface ScanCategorySummary {
  name: string;
  slug: string;
  score: number;
}

export interface ScanSummary {
  url: string;
  scannedAt: string;
  overallScore: number;
  grade: "A" | "B" | "C" | "D" | "F";
  categories: ScanCategorySummary[];
}

function scanKey(tenant: string): string {
  return `${SCAN_PREFIX}${tenant}`;
}

/** Persist the latest scan summary for a tenant. Null-safe (no-op without Redis). */
export async function saveScanSummary(tenant: string, summary: ScanSummary): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(scanKey(tenant), summary, { ex: SCAN_TTL_SECONDS });
  } catch (err) {
    console.warn("[scan-store] write failed", tenant, err);
  }
}

/** Read the latest scan summary for a tenant, or null if never scanned. */
export async function getScanSummary(tenant: string): Promise<ScanSummary | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const cached = await redis.get<ScanSummary>(scanKey(tenant));
    return cached ?? null;
  } catch (err) {
    console.warn("[scan-store] read failed", tenant, err);
    return null;
  }
}

/** Read the latest scan summaries for many tenants in parallel. */
export async function getScanSummaries(
  tenants: string[]
): Promise<Record<string, ScanSummary | null>> {
  const entries = await Promise.all(
    tenants.map(async (t) => [t, await getScanSummary(t)] as const)
  );
  return Object.fromEntries(entries);
}
