/**
 * Per-tenant report cadence — decides WHEN a tenant is emailed their report,
 * not what's in it.
 *
 * The weekly-report cron runs on a weekly timer and today emails every active
 * tenant on every run. That's the right frequency for a high-touch (higher-tier)
 * client but too noisy for most: a monthly proof-of-work email lands better and
 * doesn't train owners to ignore the send. So cadence is tier-aware.
 *
 * COMMERCIAL INDEPENDENCE (resolved 2026-07): Presence / Growth / Scale and the
 * selected monthly amount are persisted on the tenant, but packaging does not
 * implicitly control a product capability or communication cadence. Cadence is
 * therefore an explicit per-tenant override, defaulting to monthly.
 * A future Plan Inclusion policy may define a default, but it must remain an
 * explicit policy rather than an inference from a price key.
 *
 * Persistence (Systems catalog section 5): Postgres `tenant_report_state` is
 * read first and written alongside the original `reb:report-cadence:{tenant}`
 * and `reb:report-sent:{tenant}` keys, which are never renamed or deleted.
 * Cadence falls back to Redis when Postgres has none; last-sent is the later
 * of the two markers, so a send recorded in only one place still throttles.
 * Null-safe: no Postgres and no Redis ⇒ default monthly + no last-sent memory.
 */

import { getRedis } from "./redis";
import { callRedisMoveRpc, postgresNotInPlay } from "./storage/redis-move";

export type ReportCadence = "weekly" | "monthly";

const DAY_MS = 24 * 60 * 60 * 1000;

// Weekly: the cron fires every 7 days; a day of slack means a slightly-early
// run (or a manual re-trigger the same week) still resolves to "one per week"
// without double-sending.
const WEEKLY_MIN_DAYS = 6;
// Monthly: pin the send to the first cron run of the month, but only once at
// least ~3 weeks have passed since the last one (prevents a same-early-month
// double-send). The hard ceiling guarantees a monthly tenant is never silent
// for more than ~5 weeks even if a near-start run is missed.
const MONTHLY_ALIGN_MIN_DAYS = 20;
const MONTHLY_MAX_DAYS = 35;

const cadenceKey = (tenant: string) => `reb:report-cadence:${tenant}`;
const lastSentKey = (tenant: string) => `reb:report-sent:${tenant}`;

/** True on the first weekly cron run of a calendar month (day 1–7, UTC). */
function isNearStartOfMonth(now: Date): boolean {
  return now.getUTCDate() <= 7;
}

/**
 * Pure cadence decision — no I/O, so the WHEN logic is directly testable.
 * `lastSentAt` is epoch ms, or null when the tenant has never been sent a report
 * (in which case we always send: the first report is the onboarding proof).
 */
export function shouldSendReport(
  cadence: ReportCadence,
  lastSentAt: number | null,
  now: Date,
): boolean {
  if (lastSentAt == null) return true;
  const daysSince = (now.getTime() - lastSentAt) / DAY_MS;

  if (cadence === "weekly") {
    return daysSince >= WEEKLY_MIN_DAYS;
  }

  // monthly
  if (daysSince >= MONTHLY_MAX_DAYS) return true;
  if (isNearStartOfMonth(now) && daysSince >= MONTHLY_ALIGN_MIN_DAYS) return true;
  return false;
}

interface PgReportState {
  cadence: ReportCadence | null;
  lastSentAt: number | null;
}

function parseMs(raw: unknown): number | null {
  if (raw == null) return null;
  const ms = typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
  return Number.isFinite(ms) ? ms : null;
}

/** Postgres row for a tenant, or null (no row, not configured, or failed). */
async function readPgState(tenant: string): Promise<PgReportState | null> {
  const result = await callRedisMoveRpc("read_tenant_report_state", { p_tenant_id: tenant });
  if (!result.ok || !result.data || typeof result.data !== "object") return null;
  const row = result.data as { cadence?: unknown; lastSentAt?: unknown };
  return {
    cadence: row.cadence === "weekly" || row.cadence === "monthly" ? row.cadence : null,
    lastSentAt: parseMs(row.lastSentAt),
  };
}

async function readRedisCadence(tenant: string): Promise<ReportCadence | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get<string>(cadenceKey(tenant));
    return raw === "weekly" || raw === "monthly" ? raw : null;
  } catch {
    return null;
  }
}

async function readRedisLastSent(tenant: string): Promise<number | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    return parseMs(await redis.get<string | number>(lastSentKey(tenant)));
  } catch {
    return null;
  }
}

/** Postgres cadence when set, else the Redis override, else monthly. */
function resolveCadence(pg: PgReportState | null, redisCadence: ReportCadence | null): ReportCadence {
  return pg?.cadence ?? redisCadence ?? "monthly";
}

/**
 * The later of the two markers. Reading both (not just Postgres) is what makes
 * a missed copy safe: a send recorded only in Redis still throttles the next run.
 */
function resolveLastSent(pg: PgReportState | null, redisLastSent: number | null): number | null {
  const values = [pg?.lastSentAt ?? null, redisLastSent].filter((v): v is number => v != null);
  return values.length ? Math.max(...values) : null;
}

/** Read a tenant's cadence override. Defaults to "monthly". */
export async function getReportCadence(tenant: string): Promise<ReportCadence> {
  const pg = await readPgState(tenant);
  if (pg?.cadence) return pg.cadence;
  return resolveCadence(pg, await readRedisCadence(tenant));
}

/**
 * Set a tenant's cadence override in Postgres and in the Redis key. If
 * Postgres is in play and the write fails, this throws before touching Redis,
 * so a stale Postgres row can never hide a newer Redis value. Without Postgres
 * (no client, DUAL_WRITE_PG=0, migration not applied, tenant only in Redis)
 * it writes Redis alone, exactly as before the move.
 */
export async function setReportCadence(
  tenant: string,
  cadence: ReportCadence,
): Promise<ReportCadence> {
  const value: ReportCadence = cadence === "weekly" ? "weekly" : "monthly";
  const result = await callRedisMoveRpc("set_tenant_report_cadence", { p_tenant_id: tenant, p_cadence: value, p_via: "dual_write" });
  if (!result.ok && !postgresNotInPlay(result)) {
    throw new Error(`Report cadence could not be saved (${result.reason}).`);
  }
  const redis = getRedis();
  if (redis) await redis.set(cadenceKey(tenant), value);
  return value;
}

/** When a tenant was last emailed a report (epoch ms), or null. Null-safe. */
export async function getLastReportSentAt(tenant: string): Promise<number | null> {
  const [pg, redisLastSent] = await Promise.all([readPgState(tenant), readRedisLastSent(tenant)]);
  return resolveLastSent(pg, redisLastSent);
}

/** Record that a tenant was emailed a report now (both stores, best-effort, never throws). */
export async function markReportSent(tenant: string, ts: number = Date.now()): Promise<void> {
  const redis = getRedis();
  await Promise.all([
    callRedisMoveRpc("mark_tenant_report_sent", { p_tenant_id: tenant, p_sent_at: new Date(ts).toISOString(), p_via: "dual_write" })
      .then((result) => {
        if (!result.ok && !postgresNotInPlay(result)) {
          console.error("[report-cadence] last-sent marker not copied to Postgres", { tenant, reason: result.reason });
        }
      }),
    (async () => {
      if (!redis) return;
      try {
        await redis.set(lastSentKey(tenant), String(ts));
      } catch {
        // A lost last-sent write only risks one extra send next run — never fail
        // the cron over it. The Postgres marker usually still holds.
      }
    })(),
  ]);
}

export interface ReportDueDecision {
  send: boolean;
  cadence: ReportCadence;
  lastSentAt: number | null;
}

/** Resolve cadence + last-sent (Postgres first, Redis fallback) and decide whether to send now. */
export async function isReportDue(tenant: string, now: Date = new Date()): Promise<ReportDueDecision> {
  const [pg, redisCadence, redisLastSent] = await Promise.all([
    readPgState(tenant),
    readRedisCadence(tenant),
    readRedisLastSent(tenant),
  ]);
  const cadence = resolveCadence(pg, redisCadence);
  const lastSentAt = resolveLastSent(pg, redisLastSent);
  return { send: shouldSendReport(cadence, lastSentAt, now), cadence, lastSentAt };
}
