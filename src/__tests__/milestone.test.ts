import { describe, expect, it } from "vitest";
import {
  computeMilestone,
  MILESTONE_MIN_DAYS,
  type MilestoneInput,
} from "@/lib/milestone";
import type { ReviewItem } from "@/lib/types";
import type { ScanHistoryPoint } from "@/lib/scan-store";
import type { DailyMetric } from "@/lib/storage/analytics-store";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-07-01T12:00:00.000Z");

function daysAgoIso(days: number): string {
  return new Date(NOW - days * DAY_MS).toISOString().slice(0, 10);
}

function review(rating: number, daysAgo: number): ReviewItem {
  return {
    id: `r-${daysAgo}-${rating}-${Math.random()}`,
    source: "google",
    author: "A. Customer",
    rating,
    text: "Great service.",
    date: daysAgoIso(daysAgo),
  };
}

function scan(overallScore: number, grade: ScanHistoryPoint["grade"], daysAgo: number): ScanHistoryPoint {
  return { scannedAt: daysAgoIso(daysAgo), overallScore, grade };
}

/** Daily traffic rows for the last `days` days, `perDay` page views each. */
function traffic(days: number, perDay: number): DailyMetric[] {
  const rows: DailyMetric[] = [];
  for (let i = days - 1; i >= 0; i--) {
    rows.push({ date: daysAgoIso(i), pageViews: perDay, bookingClicks: 0 });
  }
  return rows;
}

function baseInput(overrides: Partial<MilestoneInput> = {}): MilestoneInput {
  return {
    startDate: daysAgoIso(60),
    now: NOW,
    scanHistory: [],
    scanBaseline: null,
    reviews: [],
    dailyMetrics: [],
    ...overrides,
  };
}

describe("computeMilestone — durable day-0 health anchor (B5.4)", () => {
  it("uses the baseline anchor as 'then', not the earliest ring-buffer point", () => {
    // The ring buffer only reaches back ~12 days (D·55 → A·92), but the durable
    // day-0 anchor captured at relationship start was F·40. The recap must
    // compare against the true day-0 anchor.
    const m = computeMilestone(
      baseInput({
        scanBaseline: scan(40, "F", 85),
        scanHistory: [scan(55, "D", 12), scan(78, "C", 6), scan(92, "A", 1)],
      })
    );
    const health = m.metrics.find((x) => x.key === "health")!;
    expect(health.then).toBe("F · 40"); // the anchor, not "D · 55"
    expect(health.now).toBe("A · 92");
    expect(health.direction).toBe("up");
    expect(health.trackingSince).toBeNull();
  });

  it("shows 'tracking since' when the anchor is the only measurement (brand-new tenant)", () => {
    // First scan just captured: anchor == the single history point (same timestamp).
    const only = scan(80, "B", 0);
    const m = computeMilestone(
      baseInput({ scanBaseline: only, scanHistory: [only] })
    );
    const health = m.metrics.find((x) => x.key === "health")!;
    expect(health.then).toBeNull();
    expect(health.direction).toBe("new");
    expect(health.trackingSince).not.toBeNull();
  });
});

describe("computeMilestone — real history produces correct deltas", () => {
  it("computes then -> now for health, reviews, and rating from stored history", () => {
    const m = computeMilestone(
      baseInput({
        // Site health improved C(70) -> A(92) over the tracked window.
        scanHistory: [scan(70, "C", 55), scan(84, "B", 20), scan(92, "A", 3)],
        // 1 review existed at start (55 days ago is after the 60-day start... use pre-start).
        reviews: [
          review(3, 70), // before start (60d) → baseline
          review(5, 40),
          review(5, 10),
        ],
        dailyMetrics: traffic(60, 4), // 60 days * 4 = 240 visitors
      })
    );

    expect(m.state).toBe("ready");

    const health = m.metrics.find((x) => x.key === "health")!;
    expect(health.then).toBe("C · 70");
    expect(health.now).toBe("A · 92");
    expect(health.direction).toBe("up");

    const reviews = m.metrics.find((x) => x.key === "reviews")!;
    expect(reviews.then).toBe("1"); // one review predated the start
    expect(reviews.now).toBe("3");
    expect(reviews.direction).toBe("up");

    const rating = m.metrics.find((x) => x.key === "rating")!;
    // baseline avg = 3.0 (the one pre-start review), now avg = (3+5+5)/3 = 4.3
    expect(rating.then).toBe("3.0");
    expect(rating.now).toBe("4.3");
    expect(rating.direction).toBe("up");

    const visitors = m.metrics.find((x) => x.key === "visitors")!;
    expect(visitors.kind).toBe("total");
    expect(visitors.now).toBe("240");

    // Verdict-first, positive, plain.
    expect(m.headline).toContain("240 people found you");
    expect(m.headline.toLowerCase()).toContain("first");
  });
});

describe("computeMilestone — no baseline shows honest 'tracking since', never a fake delta", () => {
  it("rating with zero reviews at start has no 'then', only tracking-since", () => {
    const m = computeMilestone(
      baseInput({
        // Every review landed AFTER the start → no baseline rating exists.
        reviews: [review(5, 30), review(4, 12)],
        scanHistory: [scan(88, "B", 5)], // single scan → also no health baseline
        dailyMetrics: traffic(30, 2),
      })
    );

    const rating = m.metrics.find((x) => x.key === "rating")!;
    expect(rating.then).toBeNull();
    expect(rating.direction).toBe("new");
    expect(rating.trackingSince).toBeTruthy();
    // now avg = (5+4)/2 = 4.5, a real measured value — not fabricated.
    expect(rating.now).toBe("4.5");

    // A single scan point → no earlier baseline, honest tracking-since not a delta.
    const health = m.metrics.find((x) => x.key === "health")!;
    expect(health.then).toBeNull();
    expect(health.direction).toBe("new");
    expect(health.trackingSince).toBeTruthy();

    // Reviews count still has a real baseline (zero at start) → a true 0 -> 2 gain.
    const reviews = m.metrics.find((x) => x.key === "reviews")!;
    expect(reviews.then).toBe("0");
    expect(reviews.now).toBe("2");
    expect(reviews.direction).toBe("up");
  });
});

describe("computeMilestone — flat and negative moves are shown neutrally, never spun", () => {
  it("a dropped health score is direction 'down' with a neutral caption and no positive headline clause", () => {
    const m = computeMilestone(
      baseInput({
        // Health slipped A(95) -> B(82). Honest: shown, not celebrated.
        scanHistory: [scan(95, "A", 50), scan(82, "B", 4)],
        // Both reviews predate the start → count flat (no new reviews) and rating
        // flat (baseline 4.0 == now 4.0). Nothing to spin.
        reviews: [review(4, 70), review(4, 65)],
        dailyMetrics: [], // no traffic → visitors metric omitted
      })
    );

    const health = m.metrics.find((x) => x.key === "health")!;
    expect(health.direction).toBe("down");
    expect(health.then).toBe("A · 95");
    expect(health.now).toBe("B · 82");
    // Never a positive value color/claim: down is not "up".
    expect(health.direction).not.toBe("up");

    const rating = m.metrics.find((x) => x.key === "rating")!;
    expect(rating.direction).toBe("flat");
    expect(rating.then).toBe("4.0");
    expect(rating.now).toBe("4.0");

    const reviews = m.metrics.find((x) => x.key === "reviews")!;
    expect(reviews.direction).toBe("flat");
    expect(reviews.then).toBe("2");
    expect(reviews.now).toBe("2");

    // No visitors, nothing up → headline stays neutral, never invents a win.
    expect(m.headline).not.toContain("climbed");
    expect(m.headline).not.toContain("rose");
    expect(m.headline.toLowerCase()).toContain("changed since you started");
  });
});

describe("computeMilestone — not-enough-history gate", () => {
  it("a brand-new tenant (below the min-days gate) shows the building state", () => {
    const m = computeMilestone(
      baseInput({
        startDate: daysAgoIso(MILESTONE_MIN_DAYS - 3),
        reviews: [review(5, 2)],
        dailyMetrics: traffic(3, 5),
      })
    );
    expect(m.state).toBe("building");
    expect(m.buildingNote).toBeTruthy();
  });

  it("old enough but literally no measured history → still building (nothing to show)", () => {
    const m = computeMilestone(
      baseInput({
        startDate: daysAgoIso(45),
        scanHistory: [],
        reviews: [],
        dailyMetrics: [],
      })
    );
    expect(m.state).toBe("building");
    expect(m.metrics).toHaveLength(0);
  });

  it("old enough with at least one real metric → ready", () => {
    const m = computeMilestone(
      baseInput({
        startDate: daysAgoIso(45),
        dailyMetrics: traffic(45, 3),
      })
    );
    expect(m.state).toBe("ready");
    expect(m.metrics.length).toBeGreaterThanOrEqual(1);
  });
});
