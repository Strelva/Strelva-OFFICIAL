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
  it("reports an empty portfolio honestly", () => {
    const measure = measureBusinessEffort({ businesses: [], entries: [], now: NOW });
    expect(measure).toMatchObject({ currentMonth: "2026-09", latestMonth: "2026-08", previousMonth: "2026-07", businesses: [] });
    expect(measure.portfolio.latest).toEqual({ month: "2026-08", totalMinutes: 0, businessesWithEffort: 0, medianMinutesPerActiveBusiness: null });
    expect(measure.portfolio.direction).toBe("insufficient_data");
  });

  it("keeps a business with no entries unmeasured rather than zero", () => {
    const measure = measureBusinessEffort({ businesses: [business(A, "Juniper")], entries: [], now: NOW });
    expect(measure.businesses[0]).toMatchObject({ businessId: A, months: [], latest: null, previous: null, monthToDate: null, direction: "insufficient_data" });
  });

  it("treats a single measured month as insufficient for a direction", () => {
    const measure = measureBusinessEffort({
      businesses: [business(A, "Juniper")],
      entries: [entry(A, "2026-08-03", 40), entry(A, "2026-08-20", 20)],
      now: NOW,
    });
    const row = measure.businesses[0]!;
    expect(row.latest).toEqual({ month: "2026-08", minutes: 60 });
    expect(row.previous).toBeNull();
    expect(row.monthToDate).toEqual({ month: "2026-09", minutes: 0 });
    expect(row.direction).toBe("insufficient_data");
    expect(row.months).toEqual([{ month: "2026-08", minutes: 60 }, { month: "2026-09", minutes: 0 }]);
  });

  it("does not read a partial current month as a fall", () => {
    const measure = measureBusinessEffort({
      businesses: [business(A, "Juniper")],
      entries: [entry(A, "2026-07-10", 90), entry(A, "2026-08-10", 90), entry(A, "2026-09-02", 5)],
      now: NOW,
    });
    expect(measure.businesses[0]).toMatchObject({
      latest: { month: "2026-08", minutes: 90 },
      previous: { month: "2026-07", minutes: 90 },
      monthToDate: { month: "2026-09", minutes: 5 },
      direction: "flat",
    });
  });

  it("finds falling and rising businesses and counts a zero month after measurement starts", () => {
    const measure = measureBusinessEffort({
      businesses: [business(A, "Falling"), business(B, "Rising"), business(C, "Went quiet")],
      entries: [
        entry(A, "2026-07-01", 120), entry(A, "2026-08-31", 45),
        entry(B, "2026-07-31", 10), entry(B, "2026-08-01", 30),
        entry(C, "2026-07-15", 60),
      ],
      now: NOW,
    });
    const byId = Object.fromEntries(measure.businesses.map((row) => [row.businessId, row]));
    expect(byId[A]!.direction).toBe("falling");
    expect(byId[B]!.direction).toBe("rising");
    expect(byId[C]).toMatchObject({ latest: { month: "2026-08", minutes: 0 }, previous: { month: "2026-07", minutes: 60 }, direction: "falling" });
  });

  it("uses the stored first-effort date for businesses whose early entries are outside the window", () => {
    const measure = measureBusinessEffort({
      businesses: [business(A, "Long-standing", { firstEffortOn: "2024-02-10" })],
      entries: [],
      now: NOW,
    });
    const row = measure.businesses[0]!;
    expect(row.direction).toBe("flat");
    expect(row.latest).toEqual({ month: "2026-08", minutes: 0 });
    expect(row.months[0]).toEqual({ month: "2025-10", minutes: 0 });
    expect(row.months).toHaveLength(12);
  });

  it("excludes voided entries from minutes and from the measurement start", () => {
    const measure = measureBusinessEffort({
      businesses: [business(A, "Juniper")],
      entries: [entry(A, "2026-07-05", 500, true), entry(A, "2026-08-05", 30), entry(A, "2026-08-06", 200, true)],
      now: NOW,
    });
    const row = measure.businesses[0]!;
    expect(row.latest).toEqual({ month: "2026-08", minutes: 30 });
    expect(row.previous).toBeNull();
    expect(row.direction).toBe("insufficient_data");
    expect(measure.portfolio.latest.totalMinutes).toBe(30);
  });

  it("computes portfolio totals, active businesses and median minutes", () => {
    const measure = measureBusinessEffort({
      businesses: [business(A, "A"), business(B, "B"), business(C, "C")],
      entries: [
        entry(A, "2026-07-02", 100), entry(B, "2026-07-02", 60), entry(C, "2026-07-02", 20),
        entry(A, "2026-08-02", 40), entry(B, "2026-08-02", 10),
        entry(C, "2026-09-01", 15),
      ],
      now: NOW,
    });
    expect(measure.portfolio.previous).toEqual({ month: "2026-07", totalMinutes: 180, businessesWithEffort: 3, medianMinutesPerActiveBusiness: 60 });
    expect(measure.portfolio.latest).toEqual({ month: "2026-08", totalMinutes: 50, businessesWithEffort: 2, medianMinutesPerActiveBusiness: 25 });
    expect(measure.portfolio.monthToDate).toMatchObject({ totalMinutes: 15, businessesWithEffort: 1 });
    expect(measure.portfolio.direction).toBe("falling");
  });

  it("keeps entries for a business missing from the listed businesses", () => {
    const measure = measureBusinessEffort({ businesses: [], entries: [entry(A, "2026-08-02", 25)], now: NOW });
    expect(measure.businesses[0]).toMatchObject({ businessId: A, name: null, latest: { month: "2026-08", minutes: 25 } });
    expect(measure.portfolio.latest.totalMinutes).toBe(25);
  });

  it("measures across a year boundary", () => {
    const measure = measureBusinessEffort({
      businesses: [business(A, "Winter")],
      entries: [entry(A, "2025-11-20", 80), entry(A, "2025-12-31", 50)],
      now: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(measure).toMatchObject({ currentMonth: "2026-01", latestMonth: "2025-12", previousMonth: "2025-11" });
    expect(measure.businesses[0]!.direction).toBe("falling");
  });
});
