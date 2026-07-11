/**
 * Scan store — persists the latest operator SEO + site-health scan per tenant.
 *
 * The scan engine (src/lib/audit/checks.ts) is point-in-time; this keeps the
 * most recent result per tenant in Redis so the Mission Control overview can
 * show every client's grade at a glance and the operator agent can reason over
 * it ("which client has the worst SEO?") without re-running a live scan.
 *
 * We store a compact summary (overall grade/score + per-category scores + the
 * top few prioritized "fix first" issues), not the full per-check detail, to
 * keep the record small. The full breakdown is always available by re-running
 * the scan on the tenant detail page.
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

/**
 * A single ranked "fix first" issue, compacted for storage — only the fields
 * the admin `SiteScan` view renders on load. Field names/enums mirror the live
 * `PrioritizedIssue` (src/lib/audit/prioritize.ts) so the persisted verdict and
 * a fresh re-scan render through the same code path. The heavier fields
 * (`status`, `score`, `categorySlug`, `details`) are intentionally dropped.
 */
export interface ScanPrioritizedIssue {
  message: string;
  category: string;
  priority: "high" | "medium" | "low";
  /** Plain-English "what this costs you", when the check carries it. */
  impact?: string;
  /** Conservative dollar/customer loss estimate, when credible. */
  quantified?: string;
}

export interface ScanSummary {
  url: string;
  scannedAt: string;
  overallScore: number;
  grade: "A" | "B" | "C" | "D" | "F";
  categories: ScanCategorySummary[];
  /**
   * The top few ranked "fix first" issues, so the admin view shows the verdict
   * the audit already produced on load (not null-until-rescan). Optional +
   * capped: absent on legacy records and on a spotless site, so a missing field
   * must never break deserialization.
   */
  prioritizedIssues?: ScanPrioritizedIssue[];
  /**
   * TRUE severity counts across ALL open issues (not just the capped
   * `prioritizedIssues` list), so the on-load badge is accurate even when a
   * site has more than 8 issues. Absent on legacy records — the consumer falls
   * back to counting the capped list.
   */
  prioritizedCounts?: { high: number; medium: number; low: number };
}

/** Trailing scan history (a small ring buffer) for trend lines. */
const SCAN_HISTORY_PREFIX = "reb:scan:hist:";
const SCAN_HISTORY_MAX = 12;

/**
 * The durable day-0 health anchor for the 90-day milestone. The history ring
 * buffer above holds only ~12 points and expires in 30 days, so it can never be
 * a real 90-day baseline. This is a single, set-once, NO-TTL record captured at
 * the start of the relationship, so the milestone compares against a true
 * day-0 "then" rather than the earliest incidentally-retained scan.
 */
const SCAN_BASELINE_PREFIX = "reb:scan:baseline:";

export interface ScanHistoryPoint {
  scannedAt: string;
  overallScore: number;
  grade: ScanSummary["grade"];
}

function scanKey(tenant: string): string {
  return `${SCAN_PREFIX}${tenant}`;
}

function scanHistoryKey(tenant: string): string {
  return `${SCAN_HISTORY_PREFIX}${tenant}`;
}

function scanBaselineKey(tenant: string): string {
  return `${SCAN_BASELINE_PREFIX}${tenant}`;
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

/** Append a point to a tenant's scan-history ring buffer (newest first). */
export async function pushScanHistory(tenant: string, point: ScanHistoryPoint): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    const key = scanHistoryKey(tenant);
    // One pipelined round trip instead of three sequential writes.
    const pipe = redis.pipeline();
    pipe.lpush(key, JSON.stringify(point));
    pipe.ltrim(key, 0, SCAN_HISTORY_MAX - 1);
    pipe.expire(key, SCAN_TTL_SECONDS);
    await pipe.exec();
  } catch (err) {
    console.warn("[scan-store] history push failed", tenant, err);
  }
}

/** Read a tenant's scan history, oldest-to-newest (for a left-to-right sparkline). */
export async function getScanHistory(tenant: string): Promise<ScanHistoryPoint[]> {
  const redis = getRedis();
  if (!redis) return [];
  try {
    const raw = await redis.lrange(scanHistoryKey(tenant), 0, SCAN_HISTORY_MAX - 1);
    const points = raw.map((item) =>
      (typeof item === "string" ? JSON.parse(item) : item) as ScanHistoryPoint
    );
    return points.reverse();
  } catch (err) {
    console.warn("[scan-store] history read failed", tenant, err);
    return [];
  }
}

/**
 * Set the durable day-0 health anchor, ONCE. NX so a later scan never
 * overwrites the real baseline; no TTL so it survives the 30-day history
 * expiry and anchors the full 90-day milestone. No-op without Redis.
 */
export async function saveScanBaseline(tenant: string, point: ScanHistoryPoint): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(scanBaselineKey(tenant), point, { nx: true });
  } catch (err) {
    console.warn("[scan-store] baseline write failed", tenant, err);
  }
}

/** Read the durable day-0 health anchor, or null if never captured. */
export async function getScanBaseline(tenant: string): Promise<ScanHistoryPoint | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const cached = await redis.get<ScanHistoryPoint>(scanBaselineKey(tenant));
    return cached ?? null;
  } catch (err) {
    console.warn("[scan-store] baseline read failed", tenant, err);
    return null;
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

/** Read the latest scan summaries for many tenants in one MGET round trip. */
export async function getScanSummaries(
  tenants: string[]
): Promise<Record<string, ScanSummary | null>> {
  if (tenants.length === 0) return {};
  const redis = getRedis();
  if (!redis) return Object.fromEntries(tenants.map((t) => [t, null]));
  try {
    const values = await redis.mget<(ScanSummary | null)[]>(...tenants.map(scanKey));
    return Object.fromEntries(tenants.map((t, i) => [t, values[i] ?? null]));
  } catch (err) {
    console.warn("[scan-store] summaries mget failed", err);
    return Object.fromEntries(tenants.map((t) => [t, null]));
  }
}
