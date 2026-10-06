import type { BusinessEffortEntry, EffortBusiness } from "./types";

/**
 * ADR 0009 factory test: human minutes per business per calendar month (UTC),
 * which must fall. Pure; the caller supplies every entry since `windowStart`.
 *
 * - The latest month is the most recent COMPLETE month; the current month is
 *   reported separately as month-to-date so a partial month never reads as a fall.
 * - Measurement for a business starts in the month of its first non-voided entry.
 *   From then on a month without entries counts as zero minutes. Before it, the
 *   month is unmeasured, and a comparison involving it is insufficient data.
 * - Voided entries never count.
 */

export type EffortDirection = "falling" | "rising" | "flat" | "insufficient_data";
export interface MonthMinutes { month: string; minutes: number }

export interface BusinessEffortMeasure {
  businessId: string;
  name: string | null;
  tenantIds: string[];
  /** Measured months within the window, oldest first, including zero months. */
  months: MonthMinutes[];
  monthToDate: MonthMinutes | null;
  latest: MonthMinutes | null;
  previous: MonthMinutes | null;
  direction: EffortDirection;
}

export interface PortfolioMonth {
  month: string;
  totalMinutes: number;
  businessesWithEffort: number;
  /** Median over businesses with any minutes that month; null when none. */
  medianMinutesPerActiveBusiness: number | null;
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

function portfolioMonth(month: string, minutesByBusiness: Map<string, Map<string, number>>): PortfolioMonth {
  const active = [...minutesByBusiness.values()].map((months) => months.get(month) ?? 0).filter((minutes) => minutes > 0);
  return {
    month,
    totalMinutes: active.reduce((sum, minutes) => sum + minutes, 0),
    businessesWithEffort: active.length,
    medianMinutesPerActiveBusiness: median(active),
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

  const known = new Map(input.businesses.map((business) => [business.id, business]));
  const firstMonth = new Map<string, string>();
  const minutesByBusiness = new Map<string, Map<string, number>>();
  for (const business of input.businesses) {
    minutesByBusiness.set(business.id, new Map());
    if (business.firstEffortOn) firstMonth.set(business.id, business.firstEffortOn.slice(0, 7));
  }

  for (const entry of input.entries) {
    if (entry.void) continue;
    const month = entry.occurredOn.slice(0, 7);
    const earliest = firstMonth.get(entry.businessId);
    if (!earliest || month < earliest) firstMonth.set(entry.businessId, month);
    if (month < firstWindowMonth || month > currentMonth) continue;
    const months = minutesByBusiness.get(entry.businessId) ?? new Map<string, number>();
    months.set(month, (months.get(month) ?? 0) + entry.minutes);
    minutesByBusiness.set(entry.businessId, months);
  }

  const businesses: BusinessEffortMeasure[] = [...minutesByBusiness.entries()].map(([businessId, months]) => {
    const business = known.get(businessId);
    const start = firstMonth.get(businessId) ?? null;
    const measured = (month: string): MonthMinutes | null =>
      start !== null && month >= start ? { month, minutes: months.get(month) ?? 0 } : null;
    const series: MonthMinutes[] = [];
    if (start !== null) {
      for (let month = start > firstWindowMonth ? start : firstWindowMonth; month <= currentMonth; month = addMonths(month, 1)) {
        series.push({ month, minutes: months.get(month) ?? 0 });
      }
    }
    const latest = measured(latestMonth);
    const previous = measured(previousMonth);
    return {
      businessId,
      name: business?.name ?? null,
      tenantIds: business?.tenantIds ?? [],
      months: series,
      monthToDate: measured(currentMonth),
      latest,
      previous,
      direction: direction(latest?.minutes ?? null, previous?.minutes ?? null),
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
      direction: direction(latest.medianMinutesPerActiveBusiness, previous.medianMinutesPerActiveBusiness),
    },
  };
}
