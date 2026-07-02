import { describe, expect, it } from "vitest";
import { copyDestination } from "@/components/dashboard/ReviewsPanel";
import type { ReviewItem } from "@/lib/types";

function review(source: ReviewItem["source"]): ReviewItem {
  return { id: source + Math.random(), source, author: "A", rating: 5, text: "t", date: "2026-06-01" };
}

describe("copyDestination — source-aware copy-paste guidance", () => {
  it("names Yelp when every review is from Yelp (no more 'copy into Google')", () => {
    expect(copyDestination([review("yelp"), review("yelp")])).toBe("Yelp");
  });

  it("names Google when every review is from Google", () => {
    expect(copyDestination([review("google")])).toBe("Google");
  });

  it("falls back to 'the platform' for a mixed-source list", () => {
    expect(copyDestination([review("google"), review("yelp")])).toBe("the platform");
  });

  it("falls back to 'the platform' for manual reviews", () => {
    expect(copyDestination([review("manual")])).toBe("the platform");
  });
});
