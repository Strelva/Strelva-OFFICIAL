import { describe, it, expect } from "vitest";
import {
  analyzeSentiment,
  analyzeReview,
  extractTopics,
  assessUrgency,
} from "../lib/reviews/sentiment";
import {
  getClientReviewSummary,
  getAdminReviewIntelligence,
} from "../lib/reviews/intelligence";
import type { ReviewItem } from "../lib/types";

const NOW = new Date("2026-06-30T12:00:00Z").getTime();
const daysAgo = (n: number) => new Date(NOW - n * 86400_000).toISOString();

function review(partial: Partial<ReviewItem> & { rating: number; text: string }): ReviewItem {
  return {
    id: partial.id ?? `r_${Math.random().toString(36).slice(2)}`,
    source: partial.source ?? "google",
    author: partial.author ?? "Sam",
    date: partial.date ?? daysAgo(1),
    reply: partial.reply,
    ...partial,
  };
}

describe("analyzeSentiment", () => {
  it("scores clear praise as positive", () => {
    const s = analyzeSentiment("The staff were amazing and incredibly helpful.");
    expect(s.label).toBe("positive");
    expect(s.score).toBeGreaterThan(0.3);
  });

  it("scores clear complaint as negative", () => {
    const s = analyzeSentiment("Terrible service, rude staff, and the place was filthy.");
    expect(s.label).toBe("negative");
    expect(s.score).toBeLessThan(-0.3);
  });

  it("handles negation — 'not good' is not positive", () => {
    const negated = analyzeSentiment("The food was not good.");
    expect(negated.label).not.toBe("positive");
  });

  it("resets negation scope at sentence boundaries", () => {
    const s = analyzeSentiment("The service was not good. The food was amazing.");
    // 'amazing' must not be dragged negative by the earlier 'not'
    expect(s.score).toBeGreaterThan(-0.3);
  });

  it("returns neutral for empty text", () => {
    expect(analyzeSentiment("").label).toBe("neutral");
  });
});

describe("topics + urgency", () => {
  it("detects the service topic", () => {
    expect(extractTopics("the staff and customer service were great")).toContain("service");
  });

  it("flags a health-hazard complaint as high urgency", () => {
    const s = analyzeSentiment("I got food poisoning here");
    expect(assessUrgency(s, 1, "I got food poisoning here")).toBe("high");
  });

  it("marks a 1-star review as needing a response", () => {
    expect(analyzeReview("awful, never coming back", 1).needsResponse).toBe(true);
  });

  it("does not flag a clean 5-star review", () => {
    expect(analyzeReview("loved it, highly recommend", 5).needsResponse).toBe(false);
  });
});

describe("getClientReviewSummary (positive, client-facing)", () => {
  const reviews: ReviewItem[] = [
    review({ rating: 5, text: "amazing service, so friendly", date: daysAgo(2), reply: "thanks!" }),
    review({ rating: 5, text: "clean space and great staff", date: daysAgo(5) }),
    review({ rating: 4, text: "good value, friendly team", date: daysAgo(10) }),
    review({ rating: 5, text: "wonderful, professional service", date: daysAgo(50) }),
  ];

  it("computes average rating and counts", () => {
    const s = getClientReviewSummary(reviews, 30, NOW);
    expect(s.totalReviews).toBe(4);
    expect(s.averageRating).toBe(4.8);
    expect(s.fiveStarCount).toBe(3);
  });

  it("counts new reviews within the window", () => {
    const s = getClientReviewSummary(reviews, 30, NOW);
    expect(s.newThisPeriod).toBe(3); // the 50-day-old one is outside
  });

  it("surfaces positive themes in lovedFor", () => {
    const s = getClientReviewSummary(reviews, 30, NOW);
    expect(s.lovedFor.map((t) => t.topic)).toContain("service");
  });

  it("exposes no negative signal (client-safe shape)", () => {
    const s = getClientReviewSummary(reviews, 30, NOW);
    expect(Object.keys(s)).not.toContain("concerns");
    expect(Object.keys(s)).not.toContain("needsResponse");
  });

  it("is safe with zero reviews", () => {
    const s = getClientReviewSummary([], 30, NOW);
    expect(s.averageRating).toBe(0);
    expect(s.headline).toContain("0 reviews");
  });
});

describe("getAdminReviewIntelligence (full picture, admin-only)", () => {
  const reviews: ReviewItem[] = [
    review({ id: "a", rating: 5, text: "great staff", date: daysAgo(2), reply: "thanks" }),
    review({ id: "b", rating: 1, text: "rude staff and dirty tables", date: daysAgo(3) }),
    review({ id: "c", rating: 2, text: "overpriced and slow service", date: daysAgo(4) }),
    review({ id: "d", rating: 1, text: "I got food poisoning", date: daysAgo(1) }),
  ];

  it("builds a needs-response queue, urgent first", () => {
    const a = getAdminReviewIntelligence(reviews, 30, NOW);
    expect(a.needsResponse[0]!.reviewId).toBe("d"); // high urgency
    expect(a.needsResponse[0]!.urgency).toBe("high");
  });

  it("excludes already-replied reviews from the queue", () => {
    const a = getAdminReviewIntelligence(reviews, 30, NOW);
    expect(a.needsResponse.map((f) => f.reviewId)).not.toContain("a");
  });

  it("counts unanswered negatives and surfaces concerns", () => {
    const a = getAdminReviewIntelligence(reviews, 30, NOW);
    expect(a.unansweredNegative).toBe(3);
    expect(a.concerns.length).toBeGreaterThan(0);
  });

  it("flags at-risk when an urgent review is unanswered", () => {
    const a = getAdminReviewIntelligence(reviews, 30, NOW);
    expect(a.atRisk).toBe(true);
    expect(a.atRiskReason).toBeTruthy();
  });
});
