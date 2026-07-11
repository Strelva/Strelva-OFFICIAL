import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resolveRange, periodHeadline, type PeriodStats, type ResolvedRange } from "../lib/analytics/period";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const DAY = 24 * 60 * 60 * 1000;
const days = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / DAY);

describe("resolveRange — window math", () => {
  afterEach(() => vi.useRealTimers());

  function freeze(isoDay: string) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${isoDay}T12:00:00Z`));
  }

  it("custom: equal-length prior window immediately before the span", () => {
    // Custom doesn't depend on 'today', so it's deterministic without freezing.
    const r = resolveRange("custom", "2026-06-01", "2026-06-30");
    expect(iso(r.from)).toBe("2026-06-01");
    expect(iso(r.to)).toBe("2026-06-30");
    // 30-day span → prior is the 30 days ending the day before (May 2 – May 31).
    expect(iso(r.priorTo)).toBe("2026-05-31");
    expect(iso(r.priorFrom)).toBe("2026-05-02");
  });

  it("live: rolling last 7 days vs the 7 before", () => {
    freeze("2026-07-11");
    const r = resolveRange();
    expect(iso(r.to)).toBe("2026-07-11");
    expect(iso(r.from)).toBe("2026-07-05");
    expect(iso(r.priorTo)).toBe("2026-07-04");
    expect(iso(r.priorFrom)).toBe("2026-06-28");
  });

  it("month: partial current month vs the SAME days-so-far last month (not the full month)", () => {
    freeze("2026-07-11");
    const r = resolveRange("month");
    expect(iso(r.from)).toBe("2026-07-01");
    expect(iso(r.to)).toBe("2026-07-11");
    // The bug this guards: prior must be Jun 1–11 (equal length), NOT full June.
    expect(iso(r.priorFrom)).toBe("2026-06-01");
    expect(iso(r.priorTo)).toBe("2026-06-11");
  });

  it("month: clamps the prior window to the prior month's length at month-end", () => {
    freeze("2026-07-31");
    const r = resolveRange("month");
    expect(iso(r.from)).toBe("2026-07-01");
    expect(iso(r.to)).toBe("2026-07-31");
    // June has 30 days, so day-31 clamps to Jun 30 → a true full-vs-full compare.
    expect(iso(r.priorFrom)).toBe("2026-06-01");
    expect(iso(r.priorTo)).toBe("2026-06-30");
  });

  it("week: prior window is equal-length and exactly 7 days earlier", () => {
    freeze("2026-07-11");
    const r = resolveRange("week");
    // Structural invariants hold regardless of which weekday 'today' is.
    expect(days(r.to, r.from)).toBe(days(r.priorTo, r.priorFrom)); // equal length
    expect(days(r.to, r.priorTo)).toBe(7);
    expect(days(r.from, r.priorFrom)).toBe(7);
  });
});

describe("periodHeadline — range-aware verdict", () => {
  const range = (over: Partial<ResolvedRange> = {}): ResolvedRange => ({
    key: "month",
    label: "This month",
    priorLabel: "vs last month",
    from: new Date("2026-07-01"),
    to: new Date("2026-07-31"),
    priorFrom: new Date("2026-06-01"),
    priorTo: new Date("2026-06-30"),
    ...over,
  });
  const stats = (over: Partial<PeriodStats>): PeriodStats => ({
    range: range(),
    pageViews: 0,
    pageViewsPrior: 0,
    pageViewsDelta: 0,
    actions: 0,
    actionsPrior: 0,
    actionsDelta: 0,
    bookingClicks: 0,
    bookingClicksPrior: 0,
    phoneClicks: 0,
    phoneClicksPrior: 0,
    series: [],
    hasData: false,
    ...over,
  });

  it("uses the range's prior label, not a hardcoded 'last week'", () => {
    const up = periodHeadline(stats({ pageViews: 180, pageViewsDelta: 40 }));
    expect(up).toContain("up vs last month");
    expect(up).toContain("180 people found you");
  });

  it("reads down when the delta is negative", () => {
    expect(periodHeadline(stats({ pageViews: 90, pageViewsDelta: -20 }))).toContain("down vs last month");
  });

  it("singularizes one person and drops the direction at parity", () => {
    const flat = periodHeadline(stats({ pageViews: 1, pageViewsDelta: 0 }));
    expect(flat).toContain("1 person found you");
    expect(flat).not.toContain("up");
    expect(flat).not.toContain("down");
  });

  it("honest empty state differs for live vs a dated window", () => {
    expect(periodHeadline(stats({ range: range({ key: "live" }) }))).toContain("last 7 days");
    expect(periodHeadline(stats({ range: range({ key: "month" }) }))).toContain("this window");
  });
});
