/**
 * Visibility snapshot storage and diff logic.
 *
 * Snapshots are stored as `visibility_snapshot` UnifiedEvents via src/lib/events.ts.
 * The metadata payload carries the full snapshot data.
 *
 * Diff: compare the latest snapshot against the previous one to find
 * position improvements, regressions, new appearances, and losses.
 */

import { addEvent, getEvents } from "../events";
import { getRedis } from "../redis";
import type { UnifiedEvent } from "../types";
import type { SerpResult } from "./serp";
import type { AiAnswerResult } from "./ai-answers";

export interface VisibilitySnapshot {
  tenantId: string;
  trade: string;
  towns: string[];
  queriesPerWeek: number;
  serpResults: SerpResult[];
  aiResults: AiAnswerResult[];
  provider: string;
  checkedAt: string;
  /** Estimated monthly SERP cost for this tenant at the current query volume */
  estimatedMonthlyCostUsd: number;
}

export interface VisibilityPositionChange {
  query: string;
  surface: "serp_organic" | "serp_local_pack" | "ai_answer";
  before: number | boolean | null;
  after: number | boolean | null;
  direction: "improved" | "declined" | "appeared" | "disappeared" | "no_change";
}

export interface VisibilityDiff {
  tenantId: string;
  previousCheckedAt: string | null;
  currentCheckedAt: string;
  changes: VisibilityPositionChange[];
  hasSignal: boolean;
}

// ---------- Storage -------------------------------------------------------- //

/** Redis sorted-set key for the per-tenant visibility snapshot index.
 *  Members are the snapshot JSON strings; scores are Unix epoch timestamps so
 *  ZRANGE ... REV returns the newest first. This makes getLatestSnapshots an
 *  O(limit) operation instead of scanning up to 200 unified events. */
function snapshotIndexKey(tenantId: string): string {
  return `reb:visibility:${tenantId}`;
}

/** Max entries retained in the sorted-set index (keeps memory bounded). */
const MAX_SNAPSHOT_INDEX = 50;

export async function saveVisibilitySnapshot(snapshot: VisibilitySnapshot): Promise<UnifiedEvent> {
  // Write the snapshot body into its own per-tenant Redis sorted set so
  // getLatestSnapshots can retrieve it without scanning the event queue.
  const redis = getRedis();
  if (redis) {
    try {
      const key = snapshotIndexKey(snapshot.tenantId);
      const score = new Date(snapshot.checkedAt).getTime() || Date.now();
      await redis.zadd(key, { score, member: JSON.stringify(snapshot) });
      // Prune to the most recent MAX_SNAPSHOT_INDEX entries (removes oldest).
      await redis.zremrangebyrank(key, 0, -(MAX_SNAPSHOT_INDEX + 1));
    } catch {
      // Best-effort — the unified-event record below still serves as fallback.
    }
  }

  return addEvent({
    tenantId: snapshot.tenantId,
    source: "website",
    type: "visibility_snapshot",
    title: `Visibility snapshot: ${snapshot.trade} (${snapshot.towns.join(", ")})`,
    body: `${snapshot.serpResults.length} SERP checks, ${snapshot.aiResults.length} AI answer checks`,
    status: "auto_approved",
    metadata: {
      snapshot,
    },
  });
}

export async function getLatestSnapshots(
  tenantId: string,
  limit = 2
): Promise<VisibilitySnapshot[]> {
  // Fast path: read from the per-tenant sorted set (newest-first, O(limit)).
  const redis = getRedis();
  if (redis) {
    try {
      const key = snapshotIndexKey(tenantId);
      // zrange with REV=true + LIMIT returns the top `limit` members by score desc.
      const members = await redis.zrange(key, 0, limit - 1, { rev: true });
      if (members && members.length > 0) {
        const snapshots: VisibilitySnapshot[] = [];
        for (const m of members) {
          try {
            snapshots.push(
              typeof m === "string"
                ? (JSON.parse(m) as VisibilitySnapshot)
                : (m as VisibilitySnapshot),
            );
          } catch {
            // skip malformed entries
          }
        }
        if (snapshots.length > 0) return snapshots;
      }
    } catch {
      // Fall through to the event-scan fallback below.
    }
  }

  // Fallback: scan the unified event queue (original O(N) path).
  // This runs when the sorted-set index is empty (e.g. snapshots written before
  // this index was introduced) or Redis is unavailable.
  const events = await getEvents(tenantId, { limit: 200 });
  const snapshots: VisibilitySnapshot[] = [];
  for (const ev of events) {
    if (ev.type === "visibility_snapshot" && ev.metadata?.snapshot) {
      snapshots.push(ev.metadata.snapshot as VisibilitySnapshot);
      if (snapshots.length >= limit) break;
    }
  }
  return snapshots;
}

// ---------- Diff ----------------------------------------------------------- //

function serpDirection(
  before: number | null,
  after: number | null
): VisibilityPositionChange["direction"] {
  if (before === null && after !== null) return "appeared";
  if (before !== null && after === null) return "disappeared";
  if (before === null && after === null) return "no_change";
  // Both are non-null past this point; cast to number to satisfy TS narrowing
  const b = before as number;
  const a = after as number;
  if (a < b) return "improved"; // lower position number = higher rank
  if (a > b) return "declined";
  return "no_change";
}

function localPackDirection(
  before: boolean,
  after: boolean
): VisibilityPositionChange["direction"] {
  if (!before && after) return "appeared";
  if (before && !after) return "disappeared";
  return "no_change";
}

function aiDirection(
  before: boolean,
  after: boolean
): VisibilityPositionChange["direction"] {
  if (!before && after) return "appeared";
  if (before && !after) return "disappeared";
  return "no_change";
}

export function diffSnapshots(
  previous: VisibilitySnapshot | null,
  current: VisibilitySnapshot
): VisibilityDiff {
  const changes: VisibilityPositionChange[] = [];

  for (const cur of current.serpResults) {
    if (cur.skipped) continue;
    const prev = previous?.serpResults.find((r) => r.query === cur.query);

    // Organic position
    const orgDir = serpDirection(prev?.tenantPosition ?? null, cur.tenantPosition);
    if (orgDir !== "no_change") {
      changes.push({
        query: cur.query,
        surface: "serp_organic",
        before: prev?.tenantPosition ?? null,
        after: cur.tenantPosition,
        direction: orgDir,
      });
    }

    // Local pack
    const packDir = localPackDirection(prev?.tenantInLocalPack ?? false, cur.tenantInLocalPack);
    if (packDir !== "no_change") {
      changes.push({
        query: cur.query,
        surface: "serp_local_pack",
        before: prev?.tenantInLocalPack ?? false,
        after: cur.tenantInLocalPack,
        direction: packDir,
      });
    }
  }

  for (const cur of current.aiResults) {
    if (!cur.probed) continue;
    const prev = previous?.aiResults.find((r) => r.query === cur.query);
    const dir = aiDirection(prev?.tenantMentioned ?? false, cur.tenantMentioned);
    if (dir !== "no_change") {
      changes.push({
        query: cur.query,
        surface: "ai_answer",
        before: prev?.tenantMentioned ?? false,
        after: cur.tenantMentioned,
        direction: dir,
      });
    }
  }

  return {
    tenantId: current.tenantId,
    previousCheckedAt: previous?.checkedAt ?? null,
    currentCheckedAt: current.checkedAt,
    changes,
    hasSignal: changes.length > 0,
  };
}
