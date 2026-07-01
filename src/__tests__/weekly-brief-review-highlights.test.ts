import { describe, it, expect } from "vitest";
import { buildHighlights } from "@/lib/weekly-brief";
import type { WeeklyBriefStats } from "@/lib/types";
import type { ClientReviewSummary } from "@/lib/reviews/intelligence";

const stats = (over: Partial<WeeklyBriefStats> = {}): WeeklyBriefStats => ({
  pageViews: 0,
  bookingClicks: 0,
  reviewsReceived: 0,
  contentUpdates: 0,
  pageViewsDelta: 0,
  bookingClicksDelta: 0,
  ...over,
});

const summary = (over: Partial<ClientReviewSummary> = {}): ClientReviewSummary => ({
  totalReviews: 0,
  averageRating: 0,
  fiveStarCount: 0,
  newThisPeriod: 0,
  newFiveStarThisPeriod: 0,
  ratingTrend: "flat",
  replyCoverage: 0,
  lovedFor: [],
  headline: "0 reviews",
  ...over,
});

describe("buildHighlights — review lines", () => {
  it("leads with the 5-star line when the summary has new 5-star reviews", () => {
    const out = buildHighlights(stats({ reviewsReceived: 5 }), [], [], summary({ newFiveStarThisPeriod: 3 }));
    expect(out).toContain("3 new 5-star reviews this week");
    // richer line replaces the raw count, not both
    expect(out.some((h) => h.includes("new reviews received"))).toBe(false);
  });

  it("singularizes one new 5-star review", () => {
    const out = buildHighlights(stats(), [], [], summary({ newFiveStarThisPeriod: 1 }));
    expect(out).toContain("1 new 5-star review this week");
  });

  it("adds the praise line when rating is strong and themes exist", () => {
    const out = buildHighlights(
      stats(),
      [],
      [],
      summary({
        averageRating: 4.8,
        lovedFor: [
          { topic: "service", label: "service", count: 4 },
          { topic: "cleanliness", label: "cleanliness", count: 2 },
        ],
      }),
    );
    expect(out).toContain("Customers love your service and cleanliness");
  });

  it("omits the praise line when the average rating is weak", () => {
    const out = buildHighlights(
      stats(),
      [],
      [],
      summary({ averageRating: 3.2, lovedFor: [{ topic: "service", label: "service", count: 2 }] }),
    );
    expect(out.some((h) => h.startsWith("Customers love"))).toBe(false);
  });

  it("falls back to the raw review count when no summary is available", () => {
    const out = buildHighlights(stats({ reviewsReceived: 2 }), [], []);
    expect(out).toContain("2 new reviews received");
  });
});
