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
    // Current calendar week, Monday-anchored, through today (a partial week until
    // Sunday). The prior window is the SAME days-so-far a week earlier (last
    // Monday through the same weekday as today) — an equal-length comparison, so
    // an in-progress week isn't dragged "down" against a full 7-day prior week.
    const day = today.getDay(); // 0 = Sun
    const back = day === 0 ? 6 : day - 1;
    const from = new Date(today.getTime() - back * DAY_MS);
    const priorFrom = new Date(from.getTime() - 7 * DAY_MS);
    const priorTo = new Date(today.getTime() - 7 * DAY_MS);
    return { key: "week", label: `This week (${fmt(from)} – ${fmt(today)})`, priorLabel: "vs last week", from, to: today, priorFrom, priorTo };
  }

  if (key === "month") {
    // Current calendar month, 1st through today (a partial month until the last
    // day). The prior window is the SAME days-so-far in the previous month (its
    // 1st through the same day-of-month, clamped to that month's length) — an
    // equal-length comparison, so a young month isn't dragged "down" against a
    // full prior month.
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    const priorLastDay = new Date(today.getFullYear(), today.getMonth(), 0); // last day of prior month
    const priorFrom = new Date(priorLastDay.getFullYear(), priorLastDay.getMonth(), 1);
    const elapsedDay = Math.min(today.getDate(), priorLastDay.getDate());
    const priorTo = new Date(priorLastDay.getFullYear(), priorLastDay.getMonth(), elapsedDay);
    return { key: "month", label: `This month (${fmt(from)} – ${fmt(today)})`, priorLabel: "vs last month", from, to: today, priorFrom, priorTo };
  }

  if (key === "custom" && fromStr && toStr) {
    const from = new Date(`${fromStr}T00:00:00`);
    // Clamp `to` to today so a future end date doesn't produce empty series rows
    // or misleading "days remaining" counts. A custom range ending tomorrow shows
    // the same data as one ending today.
    const toParsed = new Date(`${toStr}T00:00:00`);
    const to = !Number.isNaN(toParsed.getTime()) && toParsed < today ? toParsed : today;
    if (!Number.isNaN(from.getTime()) && from <= to) {
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

