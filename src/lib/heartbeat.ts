/**
 * Cron heartbeat: every cron records a heartbeat on completion so a watchdog can
 * tell "all crons healthy" from "the weekly-report cron last ran 18h ago and
 * nobody noticed". Vercel kills a hung cron at 15min with NO alert, so without
 * this a silently-dead cron (Gemini timeout, Sanity slowness) goes unseen — and
 * the weekly report is the retention engine.
 *
 * Null-safe: no Redis ⇒ heartbeats are no-ops (dev). Key: reb:heartbeat:{cron}.
 */

import { getRedis } from "./redis";

export interface Heartbeat {
  cron: string;
  ts: number; // ms epoch of last completion
  ok: boolean; // false if the run reported errors
  durationMs?: number;
  processed?: number;
  failed?: number;
}

/**
 * Max age (seconds) before a cron is considered stale = its schedule interval
 * plus generous grace. Keys MUST match the cron route's recordHeartbeat name
 * AND the route path segment in vercel.json (e.g. /api/cron/weekly-report →
 * "weekly-report"). Adding a new cron requires an entry here; the watchdog
 * silently marks any key absent from this table as stale.
 *
 * Compile-time guard: CRON_MAX_AGE_SECONDS is declared as
 * Record<KnownCron, number> so tsc catches a mis-spelled heartbeat name at
 * the call site of recordHeartbeat. The union is derived from the object
 * literal keys so the two stay in sync automatically.
 */
const _CRON_SCHEDULE = {
  maintenance: 26 * 3600, // daily
  "portfolio-scan": 26 * 3600, // daily
  staleness: 26 * 3600, // daily
  "search-console": 26 * 3600, // daily
  "daily-summary": 26 * 3600, // daily
  "poll-yelp": 26 * 3600, // daily
  "poll-google-reviews": 26 * 3600, // daily
  "poll-instagram": 26 * 3600, // daily
  "attention-digest": 26 * 3600, // daily
  "ops-digest": 26 * 3600, // daily
  "maintenance-digest": 8 * 24 * 3600, // weekly (Mon)
  "weekly-report": 8 * 24 * 3600, // weekly (Mon)
  "review-nudge": 8 * 24 * 3600, // weekly (Mon)
  "monthly-report": 33 * 24 * 3600, // monthly (1st)
  visibility: 8 * 24 * 3600, // weekly (Tue)
  "order-review-request": 26 * 3600, // daily
  "revalidation-reconcile": 7 * 3600, // every 6h
  "portfolio-snapshot": 5 * 3600, // every 4h
  "review-auto-post": 5 * 3600, // every 3h
  "inquiry-follow-ups": 3 * 3600, // hourly
  "governed-work-reconcile": 7 * 3600, // every 6h — durability sweep for the PG mirror
  "domain-monitor": 70 * 60, // every 30 min (schedule) + 40 min grace
  heartbeat: 70 * 60, // every 30 min (schedule) + 40 min grace
} as const satisfies Record<string, number>;

/** Union of all known cron names — derived from the schedule table so the two
 * stay in sync. Use this type as the first argument to recordHeartbeat to get
 * a compile-time check that the name matches a registered cron. */
export type KnownCron = keyof typeof _CRON_SCHEDULE;

export const CRON_MAX_AGE_SECONDS: Record<KnownCron, number> = _CRON_SCHEDULE;

const HEARTBEAT_TTL_SECONDS = 14 * 24 * 3600; // keep two weeks of last-seen

function heartbeatKey(cron: string): string {
  return `reb:heartbeat:${cron}`;
}

/** Record a cron's completion. Best-effort; never throws into the cron.
 * The `cron` parameter is typed as `KnownCron` so a mis-spelled name is a
 * compile error rather than a silently-unmonitored cron. */
export async function recordHeartbeat(
  cron: KnownCron,
  result: { ok: boolean; durationMs?: number; processed?: number; failed?: number } = { ok: true }
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const hb: Heartbeat = { cron, ts: Date.now(), ...result };
  try {
    await redis.set(heartbeatKey(cron), hb, { ex: HEARTBEAT_TTL_SECONDS });
  } catch {
    // heartbeat write must never break the cron it's measuring
  }
}

export interface HeartbeatStatus {
  cron: string;
  lastSeen: string | null;
  ageSeconds: number | null;
  maxAgeSeconds: number;
  stale: boolean;
  lastOk: boolean | null;
}

/** Check every known cron's heartbeat; returns per-cron staleness. */
export async function checkHeartbeats(now = Date.now()): Promise<HeartbeatStatus[]> {
  const redis = getRedis();
  // Object.keys returns string[], but every element is a KnownCron by construction.
  const crons = Object.keys(CRON_MAX_AGE_SECONDS) as KnownCron[];
  if (!redis) {
    return crons.map((cron) => ({
      cron,
      lastSeen: null,
      ageSeconds: null,
      maxAgeSeconds: CRON_MAX_AGE_SECONDS[cron],
      stale: false, // can't assert staleness without Redis; don't false-alarm
      lastOk: null,
    }));
  }
  const records = await Promise.all(
    crons.map((cron) => redis.get<Heartbeat>(heartbeatKey(cron)).catch(() => null))
  );
  return crons.map((cron, i) => {
    const hb = records[i];
    const maxAgeSeconds = CRON_MAX_AGE_SECONDS[cron];
    if (!hb) {
      return { cron, lastSeen: null, ageSeconds: null, maxAgeSeconds, stale: true, lastOk: null };
    }
    const ageSeconds = Math.floor((now - hb.ts) / 1000);
    return {
      cron,
      lastSeen: new Date(hb.ts).toISOString(),
      ageSeconds,
      maxAgeSeconds,
      stale: ageSeconds > maxAgeSeconds,
      lastOk: hb.ok,
    };
  });
}
