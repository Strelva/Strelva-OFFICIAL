import { getDailyMetrics, type DailyMetric } from "@/lib/storage/analytics-store";

/**
 * The analytics range model. "Live" is the always-current rolling view; the rest
 * are dated windows (a calendar week/month, or a custom span). Every number on
 * the analytics surface is computed for the selected window from the daily
 * metric series, so the headline can never disagree with the chart or anomaly.
 *
 * This is the reusable spine: the same window aggregation powers the live view
 * now and the weekly/monthly recaps later (they just pass a fixed calendar
 * window instead of a rolling one).
 */
export type RangeKey = "live" | "week" | "month" | "custom";

export interface ResolvedRange {
  key: RangeKey;
  /** Owner-facing label, e.g. "Last 7 days" or "Jun 1 – Jun 30". */
  label: string;
  /** Short label for the vs-prior comparison, e.g. "vs the previous 7 days". */
  priorLabel: string;
  from: Date;
  to: Date;
  priorFrom: Date;
  priorTo: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function fmt(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Resolve a range key (+ optional custom from/to) into concrete windows. */
export function resolveRange(key?: string, fromStr?: string, toStr?: string): ResolvedRange {
  const today = startOfToday();

  if (key === "week") {
    // Current calendar week, Monday-anchored, through today.
    const day = today.getDay(); // 0 = Sun
    const back = day === 0 ? 6 : day - 1;
    const from = new Date(today.getTime() - back * DAY_MS);
    const priorTo = new Date(from.getTime() - DAY_MS);
    const priorFrom = new Date(priorTo.getTime() - 6 * DAY_MS);
    return { key: "week", label: `This week (${fmt(from)} – ${fmt(today)})`, priorLabel: "vs last week", from, to: today, priorFrom, priorTo };
  }

  if (key === "month") {
    // Current calendar month, 1st through today.
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    const priorTo = new Date(from.getTime() - DAY_MS);
    const priorFrom = new Date(priorTo.getFullYear(), priorTo.getMonth(), 1);
    return { key: "month", label: `This month (${fmt(from)} – ${fmt(today)})`, priorLabel: "vs last month", from, to: today, priorFrom, priorTo };
  }

  if (key === "custom" && fromStr && toStr) {
    const from = new Date(`${fromStr}T00:00:00`);
    const to = new Date(`${toStr}T00:00:00`);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from <= to) {
      const len = Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;
      const priorTo = new Date(from.getTime() - DAY_MS);
      const priorFrom = new Date(priorTo.getTime() - (len - 1) * DAY_MS);
      return { key: "custom", label: `${fmt(from)} – ${fmt(to)}`, priorLabel: `vs the previous ${len} days`, from, to, priorFrom, priorTo };
    }
  }

  // Default: Live = rolling last 7 days vs the 7 before.
  const from = new Date(today.getTime() - 6 * DAY_MS);
  const priorTo = new Date(from.getTime() - DAY_MS);
  const priorFrom = new Date(priorTo.getTime() - 6 * DAY_MS);
  return { key: "live", label: "Last 7 days", priorLabel: "vs the previous 7 days", from, to: today, priorFrom, priorTo };
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
  phoneClicks: number;
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
    return range.key === "live"
      ? "A quiet stretch. No visitors in the last 7 days yet. Let's change that."
      : "No visitors in this window yet. Let's change that.";
  }
  const people = `${pageViews.toLocaleString()} ${pageViews === 1 ? "person" : "people"} found you`;
  if (pageViewsDelta > 0) return `It's working. ${people}, up ${range.priorLabel.replace(/^vs /, "vs ")}.`;
  if (pageViewsDelta < 0) return `${people}, down ${range.priorLabel.replace(/^vs /, "vs ")}.`;
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
  const phoneClicks = sum(windowRows, (r) => r.phoneClicks ?? 0);
  const actions = bookingClicks + phoneClicks;
  const actionsPrior = sum(priorRows, (r) => r.bookingClicks + (r.phoneClicks ?? 0));

  return {
    range,
    pageViews,
    pageViewsPrior,
    pageViewsDelta: pageViews - pageViewsPrior,
    actions,
    actionsPrior,
    actionsDelta: actions - actionsPrior,
    bookingClicks,
    phoneClicks,
    series: windowRows,
    hasData: pageViews > 0 || actions > 0,
  };
}
