import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import type { WeeklyBrief, WeeklyBriefStats } from "./types";
import { getRedis } from "./redis";
import { getClickCounts, getActivity, getClickCountsByPrefix, getContent, getSearchData, getSectionTimestamps } from "./storage";
import { getEvents } from "./events";
import { getSuggestions } from "./suggestions";
import { detectStaleSections } from "./reports";

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

  const [pageViewCounts, bookingCounts, events, activity, perServiceClicks, services, searchData, timestamps] = await Promise.all([
    getClickCounts("page-view", tenantId),
    getClickCounts("booking-click", tenantId),
    getEvents(tenantId, { limit: 100 }),
    getActivity(tenantId),
    getClickCountsByPrefix("booking-click:", tenantId),
    getContent("services", tenantId),
    getSearchData(tenantId),
    getSectionTimestamps(tenantId),
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
    pageViewsDelta: pageViewCounts.thisWeek - pageViewCounts.lastWeek,
    bookingClicksDelta: bookingCounts.thisWeek - bookingCounts.lastWeek,
  };

  const [suggestion] = await getSuggestions(tenantId);
  const nextAction = suggestion
    ? { title: suggestion.title, description: suggestion.description }
    : undefined;

  const serviceNames: Record<string, string> = {};
  for (const service of services.services || []) {
    serviceNames[service.id] = service.name;
  }

  const topServices = Object.entries(perServiceClicks)
    .map(([event, counts]) => {
      const serviceId = event.replace("booking-click:", "");
      return {
        name: serviceNames[serviceId] || serviceId,
        clicks: counts.thisWeek,
      };
    })
    .filter((service) => service.clicks > 0)
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 3);

  const topSearchQueries = (searchData?.queries || []).slice(0, 3);
  const staleSections = detectStaleSections(
    timestamps,
    ["hero", "services", "story", "testimonials", "events", "providers", "contact", "settings", "faq"]
  ).slice(0, 3);

  const highlights = buildHighlights(stats, weeklyEvents, activity);
  const summary = await buildSummary({
    stats,
    highlights,
    topServices,
    topSearchQueries,
    staleSections,
    nextAction,
  });

  const brief: WeeklyBrief = {
    id: `brief_${weekStart}_${tenantId}`,
    tenantId,
    weekStart,
    weekEnd,
    summary,
    stats,
    highlights,
    nextAction,
    topServices,
    topSearchQueries,
    staleSections,
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

async function buildSummary(data: {
  stats: WeeklyBriefStats;
  highlights: string[];
  topServices: Array<{ name: string; clicks: number }>;
  topSearchQueries: Array<{ query: string; clicks: number; impressions: number }>;
  staleSections: Array<{ section: string; daysSinceUpdate: number }>;
  nextAction?: { title: string; description: string };
}): Promise<string> {
  try {
    const { text } = await generateText({
      model: google("gemini-2.5-flash"),
      prompt: `Write a concise weekly dashboard brief for a local business owner.

Stats:
- ${data.stats.pageViews} people found the site (${formatDelta(data.stats.pageViewsDelta)} vs last week)
- ${data.stats.bookingClicks} booking clicks (${formatDelta(data.stats.bookingClicksDelta)} vs last week)
- ${data.stats.reviewsReceived} reviews received
- ${data.stats.contentUpdates} AI site updates

${data.topServices.length ? `Top services:\n${data.topServices.map((s) => `- ${s.name}: ${s.clicks} clicks`).join("\n")}` : "No service click data this week."}
${data.topSearchQueries.length ? `Top searches:\n${data.topSearchQueries.map((q) => `- ${q.query}: ${q.clicks} clicks, ${q.impressions} impressions`).join("\n")}` : "No search query data this week."}
${data.staleSections.length ? `Stale sections:\n${data.staleSections.map((s) => `- ${s.section}: ${s.daysSinceUpdate} days`).join("\n")}` : "No stale sections."}
${data.nextAction ? `Suggested next action: ${data.nextAction.title} - ${data.nextAction.description}` : ""}

Rules:
- 1 short paragraph, 2 sentences max
- Lead with value proof, using "people found you" if page views are available
- Mention one concrete thing the AI handled or recommends
- No greeting, no markdown, no sign-off`,
    });
    return text.trim();
  } catch {
    return buildFallbackSummary(data.stats);
  }
}

function buildFallbackSummary(stats: WeeklyBriefStats): string {
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

function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  return `${delta}`;
}
