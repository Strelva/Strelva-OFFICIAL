import { getRedis } from "./redis";

/**
 * What a client is trying to grow. NOT every business is booking-led — a trades
 * business wants calls, a service business wants form leads, a shop wants
 * traffic. The owner (or operator) picks the goal that matches the business and
 * progress is measured against THAT metric, not always bookings.
 */
export type GoalMetric = "visitors" | "calls" | "bookings" | "reviews";

/** A simple weekly target on one of the tracked metrics. Weekly framing matches
 *  the report cadence, so progress reads against the same numbers the owner
 *  already sees ("18 of 30 people found you this week"). */
export interface Goal {
  metric: GoalMetric;
  target: number;
  createdAt: string;
}

const GOAL_METRICS: GoalMetric[] = ["visitors", "calls", "bookings", "reviews"];

/** Owner-facing label for a goal metric, phrased as a weekly outcome. */
export const GOAL_METRIC_LABELS: Record<GoalMetric, string> = {
  visitors: "people finding you",
  calls: "calls",
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
    GOAL_METRICS.includes(g.metric as GoalMetric) &&
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

export async function setGoal(tenant: string, metric: GoalMetric, target: number): Promise<Goal | null> {
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
  metric: GoalMetric,
  stats: { pageViews: number; bookingClicks: number; reviewsReceived: number; phoneClicks?: number },
): number {
  if (metric === "visitors") return stats.pageViews;
  if (metric === "calls") return stats.phoneClicks ?? 0;
  if (metric === "bookings") return stats.bookingClicks;
  return stats.reviewsReceived;
}
