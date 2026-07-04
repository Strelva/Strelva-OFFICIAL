/**
 * Per-tenant report cadence — decides WHEN a tenant is emailed their report,
 * not what's in it.
 *
 * The weekly-report cron runs on a weekly timer and today emails every active
 * tenant on every run. That's the right frequency for a high-touch (higher-tier)
 * client but too noisy for most: a monthly proof-of-work email lands better and
 * doesn't train owners to ignore the send. So cadence is tier-aware.
 *
 * TIER SIGNAL (resolved 2026-07): Strelva's price tiers (Presence / Growth /
 * Scale) are packaging + build-scope ONLY — there is a single configured Stripe
 * price (`STRIPE_SCAFFOLD_PRICE_ID` = Growth) and NO per-tenant tier column in
 * the tenant config (see `src/lib/pricing.ts`; `tierThresholdSuper` is the
 * unrelated rewards program). There is therefore no clean tier signal to key
 * cadence off. Rather than invent a fake one, cadence is a per-tenant override
 * read from Redis, defaulting to "monthly". An operator flips a client to
 * "weekly" (e.g. a Scale-tier / done-with-you client) by setting the override.
 * If per-tier Stripe prices are ever added, derive the default from the tier
 * here and keep the override as the escape hatch.
 *
 * Persistence is null-safe: no Redis ⇒ default monthly + no last-sent memory
 * (so the monthly throttle can't be enforced, which only matters in local dev —
 * prod always has Redis). Keys follow the `reb:` wire-prefix convention.
 */

import { getRedis } from "./redis";

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

/** Read a tenant's cadence override. Defaults to "monthly". */
export async function getReportCadence(tenant: string): Promise<ReportCadence> {
  const redis = getRedis();
  if (!redis) return "monthly";
  try {
    const raw = await redis.get<string>(cadenceKey(tenant));
    return raw === "weekly" ? "weekly" : "monthly";
  } catch {
    return "monthly";
  }
}

/** When a tenant was last emailed a report (epoch ms), or null. Null-safe. */
export async function getLastReportSentAt(tenant: string): Promise<number | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get<string | number>(lastSentKey(tenant));
    if (raw == null) return null;
    const ms = typeof raw === "number" ? raw : Number.parseInt(raw, 10);
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
}

/** Record that a tenant was emailed a report now (best-effort, never throws). */
export async function markReportSent(tenant: string, ts: number = Date.now()): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(lastSentKey(tenant), String(ts));
  } catch {
    // A lost last-sent write only risks one extra send next run — never fail
    // the cron over it.
  }
}

export interface ReportDueDecision {
  send: boolean;
  cadence: ReportCadence;
  lastSentAt: number | null;
}

/** Resolve cadence + last-sent from Redis and decide whether to send now. */
export async function isReportDue(tenant: string, now: Date = new Date()): Promise<ReportDueDecision> {
  const [cadence, lastSentAt] = await Promise.all([
    getReportCadence(tenant),
    getLastReportSentAt(tenant),
  ]);
  return { send: shouldSendReport(cadence, lastSentAt, now), cadence, lastSentAt };
}
