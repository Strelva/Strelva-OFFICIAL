import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import type { WeeklyBrief, WeeklyBriefStats } from "./types";
import { getRedis } from "./redis";
import { getClickCounts, getActivity, getClickCountsByPrefix, getContent, getSearchData, getSectionTimestamps } from "./storage";
import { getEvents } from "./events";
import { getSuggestions } from "./suggestions";
import { detectStaleSections } from "./reports";
import { getLatestSnapshots, diffSnapshots, type VisibilityDiff } from "./visibility/snapshots";
import { getReviews } from "./reviews";
import { getClientReviewSummary, type ClientReviewSummary } from "./reviews/intelligence";

function briefsKey(tenantId: string): string {
  return `briefs:${tenantId}`;
}

function getWeekBounds(date: Date = new Date()): { weekStart: string; weekEnd: string } {
  // All UTC: mixing local getDay/setDate/setHours with toISOString (UTC) shifted
  // the boundary by a day in any non-UTC environment (a Sunday 23:59 local =
  // Monday UTC → "double Sunday" / 8-day window). Prod is UTC so it was correct
  // there, but dev and any non-UTC deploy mis-counted. UTC arithmetic is stable.
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  const thisMonday = new Date(d);
  thisMonday.setUTCDate(diff);
  thisMonday.setUTCHours(0, 0, 0, 0);

  // The Monday report covers the week that JUST ENDED — previous Mon→Sun. The
  // just-started week (Monday 00:00 → upcoming Sun) would be near-empty and read
  // ~0 for every event metric (reviews, content updates, verified changes).
  const monday = new Date(thisMonday);
  monday.setUTCDate(thisMonday.getUTCDate() - 7);

  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  sunday.setUTCHours(23, 59, 59, 999);

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

  // Each source is independently .catch-guarded so one dependency blip (a Redis
  // timeout, a Sanity hiccup) degrades the brief to partial data instead of
  // throwing the whole report away.
  const zeroClicks = { total: 0, today: 0, thisWeek: 0, lastWeek: 0 };
  const [pageViewCounts, bookingCounts, events, activity, perServiceClicks, services, searchData, timestamps, visSnapshots, reviews] = await Promise.all([
    getClickCounts("page-view", tenantId).catch(() => zeroClicks),
    getClickCounts("booking-click", tenantId).catch(() => zeroClicks),
    getEvents(tenantId, { limit: 100 }).catch(() => []),
    getActivity(tenantId).catch(() => []),
    getClickCountsByPrefix("booking-click:", tenantId).catch(() => ({})),
    getContent("services", tenantId).catch(
      () => ({ services: [] }) as unknown as Extract<Awaited<ReturnType<typeof getContent>>, { services: unknown }>
    ),
    getSearchData(tenantId).catch(() => null),
    getSectionTimestamps(tenantId).catch(() => ({})),
    getLatestSnapshots(tenantId, 2).catch(() => []),
    getReviews(tenantId).catch(() => []),
  ]);

  // Positive, client-facing review numbers for the win column. Admin-only
  // signal (concerns, the response queue) lives in getAdminReviewIntelligence
  // and is never surfaced in the owner's weekly report.
  const reviewSummary = getClientReviewSummary(reviews, 7);

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

  // The "prove" of the visibility loop: lead the highlights with any AI-search /
  // ranking wins since last week — the strongest retention proof we have.
  const visibilityWins = visSnapshots[0]
    ? visibilityProofHighlights(diffSnapshots(visSnapshots[1] ?? null, visSnapshots[0]))
    : [];
  const highlights = [...visibilityWins, ...buildHighlights(stats, weeklyEvents, activity, reviewSummary)].slice(0, 5);
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

/**
 * Owner-facing "you got found" proof from the week-over-week visibility diff.
 * Only positive moves (newly appearing / climbing) — losses are an operator
 * concern surfaced in Mission Control, not something to put in the owner's
 * weekly win column.
 */
export function visibilityProofHighlights(diff: VisibilityDiff): string[] {
  const out: string[] = [];
  for (const c of diff.changes) {
    if (c.direction !== "appeared" && c.direction !== "improved") continue;
    if (c.surface === "ai_answer") {
      out.push(`You now show up in AI answers for "${c.query}"`);
    } else if (c.surface === "serp_local_pack") {
      out.push(`You entered the local 3-pack for "${c.query}"`);
    } else if (c.surface === "serp_organic") {
      out.push(
        c.direction === "appeared"
          ? `You reached page 1 of Google for "${c.query}"`
          : `You climbed in Google rankings for "${c.query}"`
      );
    }
  }
  return out.slice(0, 2);
}

// System / infrastructure activity that keeps the site running but means nothing
// to a business owner. These are logged with actor="ai" (cache invalidation from
// the Sanity webhook, revalidation, deploys, syncs) and must NEVER surface in the
// owner's weekly report — "Cache invalidation: hero change triggered revalidation"
// is the machine talking, not a win. The owner only ever sees real changes.
const SYSTEM_ACTIVITY_PATTERN =
  /\b(cache|revalidat|invalidat|webhook|deploy|redeploy|sync(ed|ing)?|purge|rebuild|cron|redis|cdn|edge|propagat|index(ed|ing)?)\w*/i;

function isOwnerLegibleActivity(a: { text: string; actor?: string; type?: string }): boolean {
  if (a.type === "cache-invalidation") return false;
  return typeof a.text === "string" && a.text.trim().length > 0 && !SYSTEM_ACTIVITY_PATTERN.test(a.text);
}

export function buildHighlights(
  stats: WeeklyBriefStats,
  events: Array<{ type: string; title: string }>,
  activity: Array<{ text: string; actor?: string; type?: string }>,
  reviewSummary?: ClientReviewSummary
): string[] {
  const highlights: string[] = [];

  if (stats.pageViews > 0) {
    highlights.push(`${stats.pageViews} people visited your site this week`);
  }

  if (stats.bookingClicks > 0) {
    highlights.push(`${stats.bookingClicks} clicked your booking link`);
  }

  // Prefer the richer review line (rating + praise) when we have reviews to
  // analyze; fall back to the raw count from event metrics otherwise.
  if (reviewSummary && reviewSummary.newFiveStarThisPeriod > 0) {
    const n = reviewSummary.newFiveStarThisPeriod;
    highlights.push(`${n} new 5-star review${n > 1 ? "s" : ""} this week`);
  } else if (stats.reviewsReceived > 0) {
    highlights.push(
      `${stats.reviewsReceived} new review${stats.reviewsReceived > 1 ? "s" : ""} received`
    );
  }

  if (reviewSummary && reviewSummary.lovedFor.length > 0 && reviewSummary.averageRating >= 4) {
    const praise = reviewSummary.lovedFor.slice(0, 2).map((t) => t.label).join(" and ");
    highlights.push(`Customers love your ${praise}`);
  }

  const aiUpdates = activity.filter((a) => a.actor === "ai" && isOwnerLegibleActivity(a)).slice(0, 2);
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
