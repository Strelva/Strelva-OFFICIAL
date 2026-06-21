/**
 * Audit snapshot history — time-series storage for the site-audit engine.
 *
 * Snapshots are stored as `audit_snapshot` UnifiedEvents via src/lib/events.ts,
 * mirroring src/lib/visibility/snapshots.ts. The metadata payload carries a
 * SLIM snapshot (overall score/grade + per-category score) — deliberately NOT
 * the full checks payload, which is large and re-derivable. The dashboard trend
 * only needs the score series, so keeping snapshots small keeps the per-tenant
 * event set (and its 90-day retention window) cheap.
 */

import { addEvent, getEvents } from "../events";
import type { UnifiedEvent, TenantConfig } from "../types";
import type { CategoryResult, LetterGrade } from "./types";

/** One category's score at snapshot time (no checks payload). */
export interface AuditCategorySnapshot {
  slug: string;
  score: number;
}

/** Slim, time-series-friendly record of one audit run for a tenant. */
export interface AuditSnapshot {
  tenantId: string;
  url: string;
  overallScore: number;
  grade: LetterGrade;
  categories: AuditCategorySnapshot[];
  scannedAt: string;
}

interface SaveAuditSnapshotResult {
  url: string;
  overallScore: number;
  grade: LetterGrade;
}

/**
 * Persist a slim audit snapshot for a tenant as an `audit_snapshot` event.
 * Stores only the overall score/grade + per-category {slug,score}; never the
 * full checks payload.
 */
export async function saveAuditSnapshot(
  tenant: string,
  result: SaveAuditSnapshotResult & { categories: CategoryResult[]; scannedAt?: string }
): Promise<UnifiedEvent> {
  const snapshot: AuditSnapshot = {
    tenantId: tenant,
    url: result.url,
    overallScore: result.overallScore,
    grade: result.grade,
    categories: result.categories.map((c) => ({ slug: c.slug, score: c.score })),
    scannedAt: result.scannedAt ?? new Date().toISOString(),
  };

  return addEvent({
    tenantId: tenant,
    source: "website",
    type: "audit_snapshot",
    title: `Site audit — ${snapshot.grade} (${snapshot.overallScore})`,
    body: `${snapshot.categories.length} categories scored for ${snapshot.url}`,
    status: "auto_approved",
    metadata: {
      snapshot,
    },
  });
}

/**
 * Read the last N audit snapshots for a tenant, newest first. The full event
 * set is scanned with a generous limit (snapshots are weekly, so 12 fits well
 * inside the recency window) and filtered down to `audit_snapshot` rows.
 */
export async function getAuditHistory(
  tenant: string | TenantConfig,
  limit = 12
): Promise<AuditSnapshot[]> {
  const tenantId = typeof tenant === "string" ? tenant : tenant.id;
  // getEvents returns newest-first; widen the scan so weekly snapshots aren't
  // crowded out of the window by higher-frequency events between runs.
  const events = await getEvents(tenantId, { limit: 200 });
  const snapshots: AuditSnapshot[] = [];
  for (const ev of events) {
    if (ev.type === "audit_snapshot" && ev.metadata?.snapshot) {
      snapshots.push(ev.metadata.snapshot as AuditSnapshot);
      if (snapshots.length >= limit) break;
    }
  }
  return snapshots;
}
