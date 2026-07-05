import type { WeeklyBrief } from "@/lib/types";

/**
 * The owner-facing one-line verdict from a week's stats. Pure + server-safe so
 * both Today (a server component) and the weekly brief (a client component) can
 * compute the same headline — it used to live inside the "use client" brief,
 * which made the server call crash.
 */
export function buildVerdict(stats: WeeklyBrief["stats"]): string {
  const views = stats.pageViews;
  const delta = stats.pageViewsDelta ?? 0;
  if (views === 0) return "A quiet week — no visitors yet. Let's change that.";
  const people = `${views.toLocaleString()} ${views === 1 ? "person" : "people"} found you`;
  if (delta > 0) return `It's working — ${people}, up from last week.`;
  if (delta < 0) return `${people} this week — down from last week.`;
  return `${people} this week.`;
}
