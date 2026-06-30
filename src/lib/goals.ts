import { getRedis } from "./redis";
import type { MetricKey } from "./proof";

/** A simple weekly target on one of the proof metrics. Weekly framing matches
 *  the report cadence, so progress reads against the same numbers the owner
 *  already sees ("18 of 30 people found you this week"). */
export interface Goal {
  metric: MetricKey;
  target: number;
  createdAt: string;
}

const GOAL_METRICS: MetricKey[] = ["visitors", "bookings", "reviews"];

/** Owner-facing label for a goal metric, phrased as a weekly outcome. */
export const GOAL_METRIC_LABELS: Record<MetricKey, string> = {
  visitors: "people finding you",
  bookings: "booking clicks",
  reviews: "new reviews",
};

function goalKey(tenant: string): string {
  return `goal:${tenant}`;
}

function isGoal(v: unknown): v is Goal {
  if (!v || typeof v !== "object") return false;
  const g = v as Record<string, unknown>;
  return (
    GOAL_METRICS.includes(g.metric as MetricKey) &&
    typeof g.target === "number" &&
    Number.isFinite(g.target) &&
    g.target > 0
  );
}

export async function getGoal(tenant: string): Promise<Goal | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(goalKey(tenant));
    if (!raw) return null;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return isGoal(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function setGoal(tenant: string, metric: MetricKey, target: number): Promise<Goal | null> {
  const redis = getRedis();
  if (!redis) return null;
  if (!GOAL_METRICS.includes(metric) || !Number.isFinite(target) || target <= 0) return null;
  const goal: Goal = { metric, target: Math.round(target), createdAt: new Date().toISOString() };
  await redis.set(goalKey(tenant), JSON.stringify(goal));
  return goal;
}

export async function clearGoal(tenant: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.del(goalKey(tenant));
}

/** Pull the current weekly value for a goal's metric out of the brief stats. */
export function currentGoalValue(
  metric: MetricKey,
  stats: { pageViews: number; bookingClicks: number; reviewsReceived: number },
): number {
  if (metric === "visitors") return stats.pageViews;
  if (metric === "bookings") return stats.bookingClicks;
  return stats.reviewsReceived;
}
