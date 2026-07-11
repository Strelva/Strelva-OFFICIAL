/**
 * The owner-facing one-line verdict from a week's stats. Pure + server-safe so
 * both Today (a server component) and the weekly brief (a client component) can
 * compute the same headline — it used to live inside the "use client" brief,
 * which made the server call crash. Takes only the two fields it reads so a
 * caller can pass LIVE page-view counts (not just a frozen brief) — the Today
 * headline computes this from live counts so it agrees with the live anomaly.
 */
export function buildVerdict(
  stats: { pageViews: number; pageViewsDelta?: number },
  opts: { periodNoun?: string; priorPhrase?: string } = {}
): string {
  const periodNoun = opts.periodNoun ?? "week";
  const priorPhrase = opts.priorPhrase ?? "from last week";
  const views = stats.pageViews;
  const delta = stats.pageViewsDelta ?? 0;
  if (views === 0) return `A quiet ${periodNoun}. No visitors yet. Let's change that.`;
  const people = `${views.toLocaleString()} ${views === 1 ? "person" : "people"} found you`;
  if (delta > 0) return `It's working. ${people}, up ${priorPhrase}.`;
  if (delta < 0) return `${people} this ${periodNoun}, down ${priorPhrase}.`;
  return `${people} this ${periodNoun}.`;
}
