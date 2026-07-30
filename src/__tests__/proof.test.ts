import { describe, expect, it } from "vitest";
import { metricVerdicts, buildProofCards, type ProofActivity } from "@/lib/proof";
import type { WeeklyBriefStats } from "@/lib/types";
import type { DailyMetric } from "@/lib/storage";

const baseStats: WeeklyBriefStats = {
  pageViews: 0,
  bookingClicks: 0,
  reviewsReceived: 0,
  contentUpdates: 0,
  pageViewsDelta: 0,
  bookingClicksDelta: 0,
};

describe("metricVerdicts", () => {
  it("flags zero visitors as needing attention", () => {
    const visitors = metricVerdicts(baseStats)[0]!;
    expect(visitors.key).toBe("visitors");
    expect(visitors.tone).toBe("attention");
    expect(visitors.verdict.toLowerCase()).toContain("found");
  });

  it("celebrates a week-over-week visitor gain", () => {
    const v = metricVerdicts({ ...baseStats, pageViews: 50, pageViewsDelta: 12 });
    const visitors = v.find((x) => x.key === "visitors")!;
    expect(visitors.tone).toBe("good");
    expect(visitors.verdict).toContain("12 more");
  });

  it("reads bookings as a conversion rate when there is traffic", () => {
    const v = metricVerdicts({ ...baseStats, pageViews: 100, bookingClicks: 10 });
    const bookings = v.find((x) => x.key === "bookings");
    expect(bookings).toBeDefined();
    expect(bookings!.tone).toBe("good");
    expect(bookings!.verdict).toContain("10%");
  });

  it("floors the conversion rate to 1% when there were clicks (never 'About 0%')", () => {
    const v = metricVerdicts({ ...baseStats, pageViews: 300, bookingClicks: 1 });
    const bookings = v.find((x) => x.key === "bookings")!;
    expect(bookings.verdict).toContain("1%");
    expect(bookings.verdict).not.toContain("0%");
  });

  it("omits the bookings verdict entirely with no traffic", () => {
    const v = metricVerdicts(baseStats);
    expect(v.find((x) => x.key === "bookings")).toBeUndefined();
  });

  it("treats new reviews as a trust win", () => {
    const v = metricVerdicts({ ...baseStats, reviewsReceived: 3 });
    const reviews = v.find((x) => x.key === "reviews")!;
    expect(reviews.tone).toBe("good");
    expect(reviews.verdict).toContain("3 new review");
  });
});

function days(spec: (day: number) => number): DailyMetric[] {
  const out: DailyMetric[] = [];
  for (let d = 1; d <= 30; d++) {
    out.push({ date: `2026-06-${String(d).padStart(2, "0")}`, pageViews: spec(d), bookingClicks: 0 });
  }
  return out;
}

describe("buildProofCards", () => {
  const change: ProofActivity[] = [
    { text: "Refreshed your homepage hero", time: "2026-06-15T12:00:00Z", actor: "ai" },
  ];

  it("turns a post-change traffic lift into a proof card", () => {
    const metrics = days((d) => (d <= 15 ? 10 : 20)); // doubles after the change
    const cards = buildProofCards(change, metrics);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.deltaPct).toBe(100);
    expect(cards[0]!.headline).toContain("+100%");
    expect(cards[0]!.headline.toLowerCase()).toContain("homepage hero");
  });

  it("returns nothing when traffic is flat", () => {
    const cards = buildProofCards(change, days(() => 10));
    expect(cards).toHaveLength(0);
  });

  it("ignores non-AI changes", () => {
    const human: ProofActivity[] = [{ text: "Owner edit", time: "2026-06-15T12:00:00Z", actor: "user" }];
    expect(buildProofCards(human, days((d) => (d <= 15 ? 10 : 20)))).toHaveLength(0);
  });

  it("needs enough history to judge", () => {
    const short: DailyMetric[] = [{ date: "2026-06-01", pageViews: 10, bookingClicks: 0 }];
    expect(buildProofCards(change, short)).toHaveLength(0);
  });
});
