import type { DailyMetric } from "./storage";

export interface TrafficAnomaly {
  type: "drop" | "spike";
  /** Signed % change of the recent week vs the prior baseline. */
  deltaPct: number;
  recentAvg: number;
  baselineAvg: number;
  /** Owner-facing one-liner. */
  headline: string;
  /** The likely "why" — plausible, never a false causal claim. */
  why: string;
  /** The single next move. */
  suggestion: string;
}

const RECENT_DAYS = 7;
const BASELINE_DAYS = 21; // the 3 weeks before the recent window
/** Below this average we don't have enough traffic to call an anomaly. */
const MIN_BASELINE_PER_DAY = 3;
const DROP_THRESHOLD = -0.35;
const SPIKE_THRESHOLD = 1.0;

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * Flag a meaningful break in the traffic trend: the last week vs the 3 weeks
 * before it. Deterministic (no AI call) so it never lies or costs anything, and
 * the "why" stays plausible rather than claiming a cause we can't know. Returns
 * the single most important anomaly, or null when traffic is normal / too thin
 * to judge.
 */
export function detectTrafficAnomaly(dailyMetrics: DailyMetric[]): TrafficAnomaly | null {
  if (dailyMetrics.length < RECENT_DAYS + BASELINE_DAYS) return null;

  const ordered = [...dailyMetrics].sort((a, b) => a.date.localeCompare(b.date));
  const recent = ordered.slice(-RECENT_DAYS).map((m) => m.pageViews);
  const baseline = ordered.slice(-(RECENT_DAYS + BASELINE_DAYS), -RECENT_DAYS).map((m) => m.pageViews);

  const recentAvg = avg(recent);
  const baselineAvg = avg(baseline);
  if (baselineAvg < MIN_BASELINE_PER_DAY) return null;

  const deltaPct = (recentAvg - baselineAvg) / baselineAvg;
  const pct = Math.round(deltaPct * 100);
  const round1 = (n: number) => Math.round(n * 10) / 10;

  if (deltaPct <= DROP_THRESHOLD) {
    return {
      type: "drop",
      deltaPct,
      recentAvg: round1(recentAvg),
      baselineAvg: round1(baselineAvg),
      headline: `Traffic is down ${Math.abs(pct)}% from your usual`,
      why: `You're averaging ${round1(recentAvg)} visitors a day this week versus ${round1(baselineAvg)} before. Dips like this usually follow a stretch with no fresh updates. Search and customers reward an active site.`,
      suggestion: "Ask the AI to post this week's update or refresh a page: that's the fastest way to pull visitors back.",
    };
  }

  if (deltaPct >= SPIKE_THRESHOLD) {
    return {
      type: "spike",
      deltaPct,
      recentAvg: round1(recentAvg),
      baselineAvg: round1(baselineAvg),
      headline: `Traffic jumped ${pct}% above your usual`,
      why: `You're averaging ${round1(recentAvg)} visitors a day, up from ${round1(baselineAvg)}. Something is working: a post, a season, or a search bump.`,
      suggestion: "Make sure your booking or call button is front and center so the extra visitors actually convert while interest is high.",
    };
  }

  return null;
}
