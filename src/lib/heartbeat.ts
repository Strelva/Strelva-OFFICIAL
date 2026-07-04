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
 * plus generous grace. Keys MUST match the cron route's recordHeartbeat name.
 * Mirror of vercel.json schedules.
 */
export const CRON_MAX_AGE_SECONDS: Record<string, number> = {
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
  visibility: 8 * 24 * 3600, // weekly (Tue)
  "revalidation-reconcile": 7 * 3600, // every 6h
  "portfolio-snapshot": 5 * 3600, // every 4h
};

const HEARTBEAT_TTL_SECONDS = 14 * 24 * 3600; // keep two weeks of last-seen

function heartbeatKey(cron: string): string {
  return `reb:heartbeat:${cron}`;
}

/** Record a cron's completion. Best-effort; never throws into the cron. */
export async function recordHeartbeat(
  cron: string,
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
  const crons = Object.keys(CRON_MAX_AGE_SECONDS);
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
