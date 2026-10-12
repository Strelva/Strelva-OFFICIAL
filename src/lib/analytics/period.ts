import { getDailyMetrics, type DailyMetric } from "@/lib/storage/analytics-store";

import type { ResolvedRange } from "@/platform/infra/analytics/range";
export { resolveRange, type RangeKey, type ResolvedRange } from "@/platform/infra/analytics/range";

const DAY_MS = 24 * 60 * 60 * 1000;
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export interface PeriodStats {
  range: ResolvedRange;
  pageViews: number;
  pageViewsPrior: number;
  pageViewsDelta: number;
  /** Booking-link clicks + phone taps in the window. */
  actions: number;
  actionsPrior: number;
  actionsDelta: number;
  bookingClicks: number;
  bookingClicksPrior: number;
  phoneClicks: number;
  phoneClicksPrior: number;
  /** The window's daily series, for the chart. */
  series: DailyMetric[];
  /** True when the window has any traffic or actions (drives the honest empty state). */
  hasData: boolean;
}

/** The owner-facing headline for a period — range-aware (so it says "up vs last
 *  month", not a hardcoded "last week") and always consistent with the numbers,
 *  because both come from the same live window. */
export function periodHeadline(stats: PeriodStats): string {
  const { pageViews, pageViewsDelta, range } = stats;
  if (pageViews === 0) {
    // Don't name "last 7 days" here (it clashes with the "Live" range pill) and
    // don't frame zero as under-performance for a brand-new/pre-live site — keep
    // it forward-looking.
    return range.key === "live"
      ? "No visitors yet. This fills in as people start finding you."
      : "No visitors in this window yet. Let's change that.";
  }
  const people = `${pageViews.toLocaleString()} ${pageViews === 1 ? "person" : "people"} found you`;
  if (pageViewsDelta > 0) return `It's working. ${people}, up ${range.priorLabel}.`;
  if (pageViewsDelta < 0) return `${people}, down ${range.priorLabel}.`;
  return `${people}.`;
}

const inSpan = (date: string, from: Date, to: Date) => date >= iso(from) && date <= iso(to);
const sum = (rows: DailyMetric[], pick: (r: DailyMetric) => number) => rows.reduce((s, r) => s + pick(r), 0);

/**
 * Aggregate the daily metric series over a resolved range (+ its prior window).
 * Fetches just enough history to cover the window and its comparison, capped so
 * a huge custom span can't runaway. Every number is live — no frozen snapshot.
 */
export async function computePeriodStats(tenant: string, range: ResolvedRange): Promise<PeriodStats> {
  const today = startOfToday();
  const spanDays = Math.round((today.getTime() - range.priorFrom.getTime()) / DAY_MS) + 1;
  const daily = await getDailyMetrics(tenant, Math.min(Math.max(spanDays, 7), 400)).catch(() => [] as DailyMetric[]);

  const windowRows = daily.filter((d) => inSpan(d.date, range.from, range.to));
  const priorRows = daily.filter((d) => inSpan(d.date, range.priorFrom, range.priorTo));

  const pageViews = sum(windowRows, (r) => r.pageViews);
  const pageViewsPrior = sum(priorRows, (r) => r.pageViews);
  const bookingClicks = sum(windowRows, (r) => r.bookingClicks);
  const bookingClicksPrior = sum(priorRows, (r) => r.bookingClicks);
  const phoneClicks = sum(windowRows, (r) => r.phoneClicks ?? 0);
  const phoneClicksPrior = sum(priorRows, (r) => r.phoneClicks ?? 0);
  const actions = bookingClicks + phoneClicks;
  const actionsPrior = bookingClicksPrior + phoneClicksPrior;

  return {
    range,
    pageViews,
    pageViewsPrior,
    pageViewsDelta: pageViews - pageViewsPrior,
    actions,
    actionsPrior,
    actionsDelta: actions - actionsPrior,
    bookingClicks,
    bookingClicksPrior,
    phoneClicks,
    phoneClicksPrior,
    series: windowRows,
    hasData: pageViews > 0 || actions > 0,
  };
}
