import { describe, it, expect } from "vitest";

import {
  clampRating,
  summarizeReviews,
  starParts,
  formatSource,
  formatReviewDate,
  type ScaffoldReview,
} from "../ScaffoldReviews";

const sample: ScaffoldReview[] = [
  { author: "Dana R.", rating: 5, text: "Best in Buffalo.", date: "2024-05-01", source: "google" },
  { author: "Sam T.", rating: 4, text: "Great service.", date: "2024-04-10", source: "yelp" },
];

describe("summarizeReviews", () => {
  it("returns an empty, no-reviews summary for an empty or non-array input", () => {
    expect(summarizeReviews([])).toEqual({ count: 0, average: 0, hasReviews: false });
    expect(summarizeReviews(undefined)).toEqual({ count: 0, average: 0, hasReviews: false });
    expect(summarizeReviews(null)).toEqual({ count: 0, average: 0, hasReviews: false });
    // @ts-expect-error — a garbage non-array must not throw
    expect(summarizeReviews("nope")).toEqual({ count: 0, average: 0, hasReviews: false });
  });

  it("counts reviews and averages the rating to one decimal", () => {
    const s = summarizeReviews(sample);
    expect(s).toEqual({ count: 2, average: 4.5, hasReviews: true });
  });

  it("rounds the average to one decimal place", () => {
    const three: ScaffoldReview[] = [
      { author: "a", rating: 5, text: "" },
      { author: "b", rating: 4, text: "" },
      { author: "c", rating: 5, text: "" },
    ];
    expect(summarizeReviews(three).average).toBe(4.7);
  });

  it("ignores non-finite ratings when averaging but still counts the review", () => {
    const mixed: ScaffoldReview[] = [
      { author: "a", rating: 5, text: "" },
      { author: "b", rating: NaN as number, text: "" },
    ];
    const s = summarizeReviews(mixed);
    expect(s.count).toBe(2);
    expect(s.average).toBe(5);
  });
});

describe("clampRating + starParts (rating rendering)", () => {
  it("clamps to an integer 0–5", () => {
    expect(clampRating(4.6)).toBe(5);
    expect(clampRating(-3)).toBe(0);
    expect(clampRating(99)).toBe(5);
    expect(clampRating(NaN)).toBe(0);
  });

  it("splits a rating into filled/empty stars totalling 5", () => {
    expect(starParts(5)).toEqual({ full: 5, empty: 0 });
    expect(starParts(4)).toEqual({ full: 4, empty: 1 });
    expect(starParts(0)).toEqual({ full: 0, empty: 5 });
    // garbage rating can never render more than 5 stars
    expect(starParts(200)).toEqual({ full: 5, empty: 0 });
  });
});

describe("formatSource", () => {
  it("title-cases a known source and returns empty for none", () => {
    expect(formatSource("google")).toBe("Google");
    expect(formatSource("YELP")).toBe("Yelp");
    expect(formatSource(undefined)).toBe("");
    expect(formatSource("  ")).toBe("");
  });
});

describe("formatReviewDate", () => {
  it("renders a deterministic Month Year label", () => {
    expect(formatReviewDate("2024-05-01")).toBe("May 2024");
  });
  it("falls back to the raw string when unparseable, and empty for none", () => {
    expect(formatReviewDate("last tuesday")).toBe("last tuesday");
    expect(formatReviewDate(undefined)).toBe("");
  });
});
