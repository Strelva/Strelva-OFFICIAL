import type { BusinessEffortEntry, EffortBusiness } from "./types";

/**
 * ADR 0009 factory test: human minutes per business per calendar month (UTC),
 * which must fall. Pure; the caller supplies every entry since `windowStart`.
 *
 * - The latest month is the most recent COMPLETE month; the current month is
 *   reported separately as month-to-date so a partial month never reads as a fall.
 * - Every supplied business is in scope in every month of the window.
 * - A month is logged only when it has a non-voided entry, including an explicit
 *   zero-minute entry. Absence is unknown, even after the first effort date.
 * - Portfolio statistics use every in-scope business, including logged zeros,
 *   and remain unknown until coverage is complete. Partial sums are labeled.
 * - Voided entries never count.
 */

export type EffortDirection = "falling" | "rising" | "flat" | "insufficient_data";
export interface MonthMinutes {
  month: string;
  minutes: number | null;
  coverage: "logged" | "not_logged";
  entryCount: number;
}

export interface BusinessEffortMeasure {
  businessId: string;
  name: string | null;
  tenantIds: string[];
  /** Every month in the window, oldest first, with explicit log coverage. */
  months: MonthMinutes[];
  monthToDate: MonthMinutes | null;
  latest: MonthMinutes | null;
  previous: MonthMinutes | null;
  direction: EffortDirection;
}

export interface PortfolioMonth {
  month: string;
  /** All customer businesses supplied by the caller; the statistical denominator. */
  businessCount: number;
  loggedBusinessCount: number;
  unloggedBusinessCount: number;
  businessesWithEffort: number;
  /** Sum of available logs, never a claim about unlogged businesses. */
  loggedMinutes: number;
  /** Full portfolio statistics are unknown while any business is not logged. */
  totalMinutes: number | null;
  medianMinutesPerBusiness: number | null;
  averageMinutesPerBusiness: number | null;
}

export interface EffortMeasure {
  windowStart: string;
  currentMonth: string;
  latestMonth: string;
  previousMonth: string;
  businesses: BusinessEffortMeasure[];
  portfolio: { monthToDate: PortfolioMonth; latest: PortfolioMonth; previous: PortfolioMonth; direction: EffortDirection };
}

/** Number of calendar months, including the current month, the caller must load. */
export const EFFORT_WINDOW_MONTHS = 12;

export function utcMonth(date: Date): string {
  return date.toISOString().slice(0, 7);
}

export function addMonths(month: string, delta: number): string {
  const index = Number(month.slice(0, 4)) * 12 + (Number(month.slice(5, 7)) - 1) + delta;
  return `${String(Math.floor(index / 12)).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** First calendar day (YYYY-MM-DD) of the window the measure needs. */
export function effortWindowStart(now: Date): string {
  return `${addMonths(utcMonth(now), -(EFFORT_WINDOW_MONTHS - 1))}-01`;
}

export function direction(latest: number | null, previous: number | null): EffortDirection {
  if (latest === null || previous === null) return "insufficient_data";
  if (latest < previous) return "falling";
  if (latest > previous) return "rising";
  return "flat";
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? 0;
  return sorted.length % 2 === 1 ? upper : ((sorted[middle - 1] ?? 0) + upper) / 2;
}

function portfolioMonth(month: string, minutesByBusiness: Map<string, Map<string, { minutes: number; entryCount: number }>>): PortfolioMonth {
  const logs = [...minutesByBusiness.values()].flatMap((months) => {
    const log = months.get(month);
    return log ? [log.minutes] : [];
  });
  const businessCount = minutesByBusiness.size;
  const loggedMinutes = logs.reduce((sum, minutes) => sum + minutes, 0);
  const complete = businessCount > 0 && logs.length === businessCount;
  return {
    month,
    businessCount,
    loggedBusinessCount: logs.length,
    unloggedBusinessCount: businessCount - logs.length,
    businessesWithEffort: logs.filter((minutes) => minutes > 0).length,
    loggedMinutes,
    totalMinutes: complete ? loggedMinutes : null,
    medianMinutesPerBusiness: complete ? median(logs) : null,
    averageMinutesPerBusiness: complete ? loggedMinutes / businessCount : null,
  };
}

export function measureBusinessEffort(input: {
  businesses: EffortBusiness[];
  entries: BusinessEffortEntry[];
  now: Date;
}): EffortMeasure {
  const currentMonth = utcMonth(input.now);
  const latestMonth = addMonths(currentMonth, -1);
  const previousMonth = addMonths(currentMonth, -2);
  const windowStart = effortWindowStart(input.now);
  const firstWindowMonth = windowStart.slice(0, 7);

  const minutesByBusiness = new Map(input.businesses.map((business) => [
    business.id, new Map<string, { minutes: number; entryCount: number }>(),
  ]));

  for (const entry of input.entries) {
    const months = minutesByBusiness.get(entry.businessId);
    // The business list owns scope. Stale/out-of-scope entries cannot add a
    // business to the denominator or leak another workspace into the measure.
    if (entry.void || !months) continue;
    const month = entry.occurredOn.slice(0, 7);
    if (month < firstWindowMonth || month > currentMonth) continue;
    const log = months.get(month) ?? { minutes: 0, entryCount: 0 };
    months.set(month, { minutes: log.minutes + entry.minutes, entryCount: log.entryCount + 1 });
  }

  const businesses: BusinessEffortMeasure[] = input.businesses.map((business) => {
    const months = minutesByBusiness.get(business.id)!;
    const measured = (month: string): MonthMinutes => {
      const log = months.get(month);
      return { month, minutes: log?.minutes ?? null, coverage: log ? "logged" : "not_logged", entryCount: log?.entryCount ?? 0 };
    };
    const series: MonthMinutes[] = [];
    for (let month = firstWindowMonth; month <= currentMonth; month = addMonths(month, 1)) {
      series.push(measured(month));
    }
    const latest = measured(latestMonth);
    const previous = measured(previousMonth);
    return {
      businessId: business.id,
      name: business.name,
      tenantIds: business.tenantIds,
      months: series,
      monthToDate: measured(currentMonth),
      latest,
      previous,
      direction: direction(latest.minutes, previous.minutes),
    };
  });

  const latest = portfolioMonth(latestMonth, minutesByBusiness);
  const previous = portfolioMonth(previousMonth, minutesByBusiness);
  return {
    windowStart,
    currentMonth,
    latestMonth,
    previousMonth,
    businesses,
    portfolio: {
      monthToDate: portfolioMonth(currentMonth, minutesByBusiness),
      latest,
      previous,
      direction: direction(latest.medianMinutesPerBusiness, previous.medianMinutesPerBusiness),
    },
  };
}
