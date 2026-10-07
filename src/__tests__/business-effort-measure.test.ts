import { describe, expect, it } from "vitest";
import {
  addMonths, direction, effortWindowStart, measureBusinessEffort, utcMonth,
} from "@/platform/business-effort/measure";
import type { BusinessEffortEntry, EffortBusiness } from "@/platform/business-effort/types";

const NOW = new Date("2026-09-28T15:00:00.000Z");
const OPERATOR = "00000000-0000-4000-8000-000000000001";
const A = "10000000-0000-4000-8000-00000000000a";
const B = "10000000-0000-4000-8000-00000000000b";
const C = "10000000-0000-4000-8000-00000000000c";
let sequence = 0;

function business(id: string, name: string, over: Partial<EffortBusiness> = {}): EffortBusiness {
  return { id, name, tenantIds: [], firstEffortOn: null, ...over };
}

function entry(businessId: string, occurredOn: string, minutes: number, voided = false): BusinessEffortEntry {
  sequence += 1;
  return {
    id: `20000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    businessId,
    minutes,
    category: "support",
    occurredOn,
    note: null,
    recordedBy: OPERATOR,
    recordedAt: `${occurredOn}T12:00:00.000Z`,
    void: voided ? { reason: "Wrong business", voidedBy: OPERATOR, voidedAt: `${occurredOn}T13:00:00.000Z` } : null,
  };
}

describe("month helpers", () => {
  it("uses UTC calendar months and crosses year boundaries", () => {
    expect(utcMonth(new Date("2026-10-01T00:30:00.000Z"))).toBe("2026-10");
    expect(utcMonth(new Date("2026-09-30T23:59:59.000Z"))).toBe("2026-09");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2025-12", 1)).toBe("2026-01");
    expect(addMonths("2026-09", -11)).toBe("2025-10");
    expect(effortWindowStart(NOW)).toBe("2025-10-01");
  });

  it("compares minutes into a direction", () => {
    expect(direction(10, 20)).toBe("falling");
    expect(direction(30, 20)).toBe("rising");
    expect(direction(20, 20)).toBe("flat");
    expect(direction(null, 20)).toBe("insufficient_data");
    expect(direction(20, null)).toBe("insufficient_data");
  });
});

describe("measureBusinessEffort", () => {
  it("reports an empty portfolio without inventing a denominator or zero", () => {
    const measure = measureBusinessEffort({ businesses: [], entries: [], now: NOW });
    expect(measure).toMatchObject({ currentMonth: "2026-09", latestMonth: "2026-08", previousMonth: "2026-07", businesses: [] });
    expect(measure.portfolio.latest).toEqual({ month: "2026-08", businessCount: 0, loggedBusinessCount: 0, unloggedBusinessCount: 0,
      loggedMinutes: 0, totalMinutes: null, businessesWithEffort: 0, medianMinutesPerBusiness: null, averageMinutesPerBusiness: null });
    expect(measure.portfolio.direction).toBe("insufficient_data");
  });

  it("lists every business and every period, with absence distinct from zero", () => {
    const measure = measureBusinessEffort({ businesses: [business(A, "Juniper")], entries: [], now: NOW });
    expect(measure.businesses[0]).toMatchObject({ businessId: A,
      latest: { month: "2026-08", minutes: null, coverage: "not_logged", entryCount: 0 },
      previous: { minutes: null, coverage: "not_logged" }, monthToDate: { minutes: null, coverage: "not_logged" }, direction: "insufficient_data" });
    expect(measure.businesses[0]!.months).toHaveLength(12);
    expect(measure.portfolio.latest).toMatchObject({ businessCount: 1, loggedBusinessCount: 0, unloggedBusinessCount: 1, totalMinutes: null });
  });

  it("includes explicitly logged zero businesses in the median and average denominator", () => {
    const measure = measureBusinessEffort({
      businesses: [business(A, "A"), business(B, "B"), business(C, "Zero")],
      entries: [entry(A, "2026-07-02", 100), entry(B, "2026-07-02", 60), entry(C, "2026-07-02", 20),
        entry(A, "2026-08-02", 40), entry(B, "2026-08-02", 20), entry(C, "2026-08-31", 0)], now: NOW,
    });
    expect(measure.portfolio.latest).toEqual({ month: "2026-08", businessCount: 3, loggedBusinessCount: 3, unloggedBusinessCount: 0,
      businessesWithEffort: 2, loggedMinutes: 60, totalMinutes: 60, medianMinutesPerBusiness: 20, averageMinutesPerBusiness: 20 });
    expect(measure.portfolio.previous).toMatchObject({ businessCount: 3, medianMinutesPerBusiness: 60, averageMinutesPerBusiness: 60 });
    expect(measure.portfolio.direction).toBe("falling");
    expect(measure.businesses[2]).toMatchObject({ latest: { minutes: 0, coverage: "logged", entryCount: 1 }, direction: "falling" });
  });

  it("withholds portfolio statistics and trend when a business is unlogged", () => {
    const measure = measureBusinessEffort({ businesses: [business(A, "A"), business(B, "B"), business(C, "Never logged")],
      entries: [entry(A, "2026-07-01", 80), entry(B, "2026-07-01", 0), entry(A, "2026-08-01", 40), entry(B, "2026-08-01", 0)], now: NOW });
    expect(measure.portfolio.latest).toMatchObject({ businessCount: 3, loggedBusinessCount: 2, unloggedBusinessCount: 1,
      loggedMinutes: 40, totalMinutes: null, medianMinutesPerBusiness: null, averageMinutesPerBusiness: null });
    expect(measure.portfolio.direction).toBe("insufficient_data");
    expect(measure.businesses).toHaveLength(3);
  });

  it("does not infer zero or a fall in gaps after the first-ever log", () => {
    const measure = measureBusinessEffort({ businesses: [business(A, "Long-standing", { firstEffortOn: "2024-02-10" })],
      entries: [entry(A, "2026-07-10", 90)], now: NOW });
    expect(measure.businesses[0]).toMatchObject({ latest: { minutes: null, coverage: "not_logged" }, previous: { minutes: 90 }, direction: "insufficient_data" });
    expect(measure.businesses[0]!.months[0]).toMatchObject({ month: "2025-10", minutes: null, coverage: "not_logged" });
    expect(measure.portfolio.direction).toBe("insufficient_data");
  });

  it("sums work alongside zero logs; zero is never an override", () => {
    const measure = measureBusinessEffort({ businesses: [business(A, "A")],
      entries: [entry(A, "2026-08-03", 40), entry(A, "2026-08-20", 20), entry(A, "2026-08-31", 0)], now: NOW });
    expect(measure.businesses[0]!.latest).toEqual({ month: "2026-08", minutes: 60, coverage: "logged", entryCount: 3 });
    expect(measure.businesses[0]!.monthToDate).toMatchObject({ minutes: null, coverage: "not_logged" });
  });

  it("excludes voids from both totals and coverage, including a voided zero", () => {
    const measure = measureBusinessEffort({ businesses: [business(A, "A"), business(B, "B")], entries: [
      entry(A, "2026-07-05", 0, true), entry(A, "2026-08-05", 30), entry(A, "2026-08-06", 200, true), entry(B, "2026-08-01", 0, true),
    ], now: NOW });
    expect(measure.businesses[0]!.latest).toMatchObject({ minutes: 30, entryCount: 1 });
    expect(measure.businesses[0]!.previous).toMatchObject({ minutes: null, coverage: "not_logged" });
    expect(measure.businesses[1]!.latest).toMatchObject({ minutes: null, coverage: "not_logged" });
    expect(measure.portfolio.latest).toMatchObject({ loggedMinutes: 30, loggedBusinessCount: 1, unloggedBusinessCount: 1, totalMinutes: null });
  });

  it("handles all-zero complete coverage and even-sized medians", () => {
    const businesses = [business(A, "A"), business(B, "B")];
    const measure = measureBusinessEffort({ businesses, entries: [entry(A, "2026-08-01", 0), entry(B, "2026-08-01", 0),
      entry(A, "2026-07-01", 0), entry(B, "2026-07-01", 40)], now: NOW });
    expect(measure.portfolio.latest).toMatchObject({ businessCount: 2, loggedBusinessCount: 2, totalMinutes: 0, medianMinutesPerBusiness: 0, averageMinutesPerBusiness: 0 });
    expect(measure.portfolio.previous).toMatchObject({ businessCount: 2, medianMinutesPerBusiness: 20, averageMinutesPerBusiness: 20 });
    expect(measure.portfolio.direction).toBe("falling");
  });

  it("does not read a partial current month as a fall", () => {
    const measure = measureBusinessEffort({ businesses: [business(A, "A")],
      entries: [entry(A, "2026-07-10", 90), entry(A, "2026-08-10", 90), entry(A, "2026-09-02", 5)], now: NOW });
    expect(measure.businesses[0]).toMatchObject({ latest: { minutes: 90 }, previous: { minutes: 90 }, monthToDate: { minutes: 5 }, direction: "flat" });
    expect(measure.portfolio.direction).toBe("flat");
  });

  it("keeps the business list authoritative and ignores out-of-window entries", () => {
    const measure = measureBusinessEffort({ businesses: [business(A, "A")],
      entries: [entry(B, "2026-08-01", 999), entry(A, "2025-09-30", 999), entry(A, "2026-10-01", 999)], now: NOW });
    expect(measure.businesses).toHaveLength(1);
    expect(measure.portfolio.latest).toMatchObject({ businessCount: 1, loggedMinutes: 0, loggedBusinessCount: 0 });
  });

  it("measures across a year boundary", () => {
    const measure = measureBusinessEffort({ businesses: [business(A, "Winter")], entries: [entry(A, "2025-11-20", 80), entry(A, "2025-12-31", 50)],
      now: new Date("2026-01-01T00:00:00.000Z") });
    expect(measure).toMatchObject({ currentMonth: "2026-01", latestMonth: "2025-12", previousMonth: "2025-11" });
    expect(measure.businesses[0]!.direction).toBe("falling");
  });
});
