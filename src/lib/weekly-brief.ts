import type { WeeklyBrief, WeeklyBriefStats } from "./types";
import { getRedis } from "./redis";
import { getClickCounts, getActivity } from "./storage";
import { getEvents } from "./events";

function briefsKey(tenantId: string): string {
  return `briefs:${tenantId}`;
}

function getWeekBounds(date: Date = new Date()): { weekStart: string; weekEnd: string } {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return {
    weekStart: monday.toISOString().split("T")[0],
    weekEnd: sunday.toISOString().split("T")[0],
  };
}

export async function getWeeklyBrief(tenantId: string): Promise<WeeklyBrief | null> {
  const redis = getRedis();
  if (!redis) return null;

  const raw = await redis.zrange(briefsKey(tenantId), 0, 0, { rev: true });
  if (!raw.length) return null;

  try {
    const parsed = typeof raw[0] === "string" ? JSON.parse(raw[0]) : raw[0];
    return parsed as WeeklyBrief;
  } catch {
    return null;
  }
}

export async function getWeeklyBriefs(
  tenantId: string,
  limit: number = 12
): Promise<WeeklyBrief[]> {
  const redis = getRedis();
  if (!redis) return [];

  const raw = await redis.zrange(briefsKey(tenantId), 0, limit - 1, { rev: true });
  const briefs: WeeklyBrief[] = [];

  for (const item of raw) {
    try {
      const parsed = typeof item === "string" ? JSON.parse(item) : item;
      briefs.push(parsed);
    } catch {
      // skip malformed
    }
  }

  return briefs;
}

export async function saveWeeklyBrief(brief: WeeklyBrief): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const score = new Date(brief.createdAt).getTime();
  await redis.zadd(briefsKey(brief.tenantId), {
    score,
    member: JSON.stringify(brief),
  });
}

export async function generateWeeklyBrief(tenantId: string): Promise<WeeklyBrief> {
  const { weekStart, weekEnd } = getWeekBounds();

  const [pageViewCounts, bookingCounts, events, activity] = await Promise.all([
    getClickCounts("page-view", tenantId),
    getClickCounts("booking-click", tenantId),
    getEvents(tenantId, { limit: 100 }),
    getActivity(tenantId),
  ]);

  const weekStartDate = new Date(weekStart);
  const weekEndDate = new Date(weekEnd);
  weekEndDate.setHours(23, 59, 59, 999);

  const weeklyEvents = events.filter((e) => {
    const d = new Date(e.createdAt);
    return d >= weekStartDate && d <= weekEndDate;
  });

  const reviewsReceived = weeklyEvents.filter((e) => e.type === "review").length;
  const contentUpdates = weeklyEvents.filter((e) => e.type === "content_update").length;

  const stats: WeeklyBriefStats = {
    pageViews: pageViewCounts.thisWeek,
    bookingClicks: bookingCounts.thisWeek,
    reviewsReceived,
    contentUpdates,
  };

  const highlights = buildHighlights(stats, weeklyEvents, activity);
  const summary = buildSummary(stats, highlights);

  const brief: WeeklyBrief = {
    id: `brief_${weekStart}_${tenantId}`,
    tenantId,
    weekStart,
    weekEnd,
    summary,
    stats,
    highlights,
    createdAt: new Date().toISOString(),
  };

  await saveWeeklyBrief(brief);
  return brief;
}

function buildHighlights(
  stats: WeeklyBriefStats,
  events: Array<{ type: string; title: string }>,
  activity: Array<{ text: string; actor?: string }>
): string[] {
  const highlights: string[] = [];

  if (stats.pageViews > 0) {
    highlights.push(`${stats.pageViews} people visited your site this week`);
  }

  if (stats.bookingClicks > 0) {
    highlights.push(`${stats.bookingClicks} clicked your booking link`);
  }

  if (stats.reviewsReceived > 0) {
    highlights.push(
      `${stats.reviewsReceived} new review${stats.reviewsReceived > 1 ? "s" : ""} received`
    );
  }

  const aiUpdates = activity.filter((a) => a.actor === "ai").slice(0, 2);
  for (const update of aiUpdates) {
    highlights.push(update.text);
  }

  return highlights.slice(0, 5);
}

function buildSummary(stats: WeeklyBriefStats, highlights: string[]): string {
  const parts: string[] = [];

  if (stats.pageViews > 0) {
    parts.push(`${stats.pageViews} people found you this week`);
  } else {
    parts.push("No site visits recorded this week");
  }

  if (stats.bookingClicks > 0) {
    parts.push(`${stats.bookingClicks} clicked to book`);
  }

  if (stats.contentUpdates > 0) {
    parts.push(`${stats.contentUpdates} site update${stats.contentUpdates > 1 ? "s" : ""} made`);
  }

  return parts.join(". ") + ".";
}
