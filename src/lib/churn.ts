/**
 * At-risk / churn signal.
 *
 * The daily proof-signal cron (`/api/cron/daily-summary`) reads each tenant's
 * owner agent-engagement count for the day — how often the *owner* (not Jacob)
 * texted the AI, the best churn leading indicator — posts it to Slack, and lets
 * the per-day counter expire. That threw the number away every night. This
 * module persists that daily count into a 7-day rolling store and turns it,
 * plus inactivity and subscription status, into a single at-risk verdict the
 * operator dashboard can read.
 *
 * Persist path: the cron calls `recordDailyEngagement(tenantId, owner, day)`.
 * Read path: `getTenantAtRisk` / `getAtRiskTenants`.
 *
 * Degrades safely without Redis: engagement7d reads as 0, and the inactivity +
 * subscription reasons are still computed from tenant data.
 */

import { getRedis } from "./redis";
import { getActivity } from "./storage";
import { getAllTenants, getTenantConfig, isActiveTenant } from "./tenants";
import { getEffectiveSubscriptionStatus } from "./subscription";
import type { TenantIdentity, CommercialSnapshot } from "./tenant/models";

export interface AtRiskSignal {
  tenantId: string;
  atRisk: boolean;
  /** Human-readable, e.g. ["No owner activity in 24 days", "No AI use in 7 days"]. */
  reasons: string[];
  daysSinceActivity: number | null;
  /** Total owner agent-engagements over the last 7 days. */
  engagement7d: number;
  subscriptionStatus: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Rolling window we sum owner engagement over (kept for the displayed engagement7d figure). */
const ENGAGEMENT_WINDOW_DAYS = 7;

/**
 * Each daily count lives ~10 days — 3 days of slack past the 7-day window so a
 * late-running or re-run cron still finds every day it needs to sum.
 */
const ENGAGEMENT_TTL_SECONDS = 10 * 24 * 60 * 60;

/** YYYY-MM-DD in UTC — daily granularity, so UTC is fine (matches proof-signals). */
function dayKeyFor(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function engagementKey(tenantId: string, day: string): string {
  // reb: prefix per the repo's persistent-key convention (AGENTS.md).
  return `reb:engagement:${tenantId}:${day}`;
}

/** The day-keys for the last N days ending today (inclusive). */
function recentDayKeys(tenantId: string, days: number): string[] {
  const now = Date.now();
  const keys: string[] = [];
  for (let i = 0; i < days; i++) {
    keys.push(engagementKey(tenantId, dayKeyFor(new Date(now - i * DAY_MS))));
  }
  return keys;
}

/**
 * Persist one day's owner engagement count into the rolling store, keyed per
 * tenant per day. `dayKey` is optional — the cron passes the explicit day it
 * rolled up (yesterday); callers may omit it to use today.
 */
export async function recordDailyEngagement(
  tenantId: string,
  count: number,
  dayKey?: string
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const day = dayKey || dayKeyFor(new Date());
  try {
    await redis.set(engagementKey(tenantId, day), count, { ex: ENGAGEMENT_TTL_SECONDS });
  } catch (err) {
    console.warn("[churn] recordDailyEngagement failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * Read the engagement window: the summed count AND how many days were actually
 * recorded (a non-null key). `recordedDays` is what tells cold-start ("no data
 * yet", key absent) apart from real inactivity ("recorded a 0 that day").
 */
async function readEngagementWindow(
  tenantId: string
): Promise<{ sum: number; recordedDays: number }> {
  const redis = getRedis();
  if (!redis) return { sum: 0, recordedDays: 0 };

  try {
    const values = await redis.mget<Array<number | null>>(
      ...recentDayKeys(tenantId, ENGAGEMENT_WINDOW_DAYS)
    );
    let sum = 0;
    let recordedDays = 0;
    for (const v of values) {
      if (v === null || v === undefined) continue;
      recordedDays += 1;
      sum += Number(v) || 0;
    }
    return { sum, recordedDays };
  } catch (err) {
    console.warn("[churn] readEngagementWindow failed:", err instanceof Error ? err.message : err);
    return { sum: 0, recordedDays: 0 };
  }
}

/** Sum of the last 7 daily owner-engagement counts (0 if none / no Redis). */
export async function getEngagement7d(tenantId: string): Promise<number> {
  return (await readEngagementWindow(tenantId)).sum;
}

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((Date.now() - time) / DAY_MS));
}

async function computeAtRisk(tenant: TenantIdentity & CommercialSnapshot): Promise<AtRiskSignal> {
  const [engagementWindow, activity, subscriptionStatus] = await Promise.all([
    readEngagementWindow(tenant.id),
    // Newest-first — activity[0] is the last activity, same signal the portfolio
    // snapshot / attention panel use for "last activity".
    getActivity(tenant.id).catch(() => []),
    getEffectiveSubscriptionStatus(tenant.id).catch(() => tenant.subscriptionStatus ?? null),
  ]);

  const engagement7d = engagementWindow.sum;
  const daysSinceActivity = daysSince(activity[0]?.time);
  const reasons: string[] = [];

  // NOTE: owner disengagement is NOT a churn signal for a managed service. The
  // whole value prop is that the owner does NOT have to log in or use the AI —
  // we run the site and they hear from us over email + auto-updates. So "no owner
  // activity" / "no AI use" are expected steady-state, not risk. `daysSinceActivity`
  // and `engagement7d` are still returned for display, but they do NOT flag at-risk.
  // Real churn signals are payment problems (below); health regression is handled
  // separately by the portfolio-scan alert.

  if (subscriptionStatus === "past_due") {
    reasons.push("Subscription past due");
  } else if (subscriptionStatus === "cancelled") {
    reasons.push("Subscription cancelled");
  }

  return {
    tenantId: tenant.id,
    atRisk: reasons.length > 0,
    reasons,
    daysSinceActivity,
    engagement7d,
    subscriptionStatus: subscriptionStatus ?? null,
  };
}

/** The at-risk verdict for a single tenant. */
export async function getTenantAtRisk(tenantId: string): Promise<AtRiskSignal> {
  const tenant = await getTenantConfig(tenantId);
  if (!tenant) {
    return {
      tenantId,
      atRisk: false,
      reasons: [],
      daysSinceActivity: null,
      engagement7d: 0,
      subscriptionStatus: null,
    };
  }
  return computeAtRisk(tenant);
}

/**
 * At-risk signals across all active tenants — only the ones where `atRisk` is
 * true, worst first (most reasons, then longest inactivity).
 */
export async function getAtRiskTenants(): Promise<AtRiskSignal[]> {
  const tenants = (await getAllTenants()).filter(isActiveTenant);
  const signals = await Promise.all(tenants.map(computeAtRisk));
  return signals
    .filter((s) => s.atRisk)
    .sort(
      (a, b) =>
        b.reasons.length - a.reasons.length ||
        (b.daysSinceActivity ?? 0) - (a.daysSinceActivity ?? 0)
    );
}
