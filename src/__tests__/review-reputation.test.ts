import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import {
  buildReputationSummary,
  computeReviewVelocity,
} from "@/lib/reviews/reputation";
import { ReputationHeader } from "@/components/dashboard/ReputationHeader";
import type { ReviewItem } from "@/lib/types";

const NOW = new Date("2026-06-30T12:00:00Z").getTime();
const daysAgo = (n: number) => new Date(NOW - n * 86400_000).toISOString();

function review(partial: Partial<ReviewItem> & { rating: number }): ReviewItem {
  return {
    id: partial.id ?? `r_${Math.random().toString(36).slice(2)}`,
    source: partial.source ?? "google",
    author: partial.author ?? "Sam",
    text: partial.text ?? "great friendly service, loved it",
    date: partial.date ?? daysAgo(1),
    reply: partial.reply,
    ...partial,
  };
}

/** 40 reviews @ 4.9 (36×5 + 4×4), 34 replied → the seeded "summit" shape. */
function strongPortfolio(): ReviewItem[] {
  const out: ReviewItem[] = [];
  for (let i = 0; i < 40; i++) {
    const rating = i < 36 ? 5 : 4;
    // 8 in the last 30 days, 4 in the 30–60d window, rest older.
    const date = i < 8 ? daysAgo(3 + i) : i < 12 ? daysAgo(40 + i) : daysAgo(120 + i);
    out.push(review({ id: `s${i}`, rating, date, reply: i < 34 ? "Thank you!" : undefined }));
  }
  return out;
}

describe("computeReviewVelocity", () => {
  it("buckets new reviews into trailing months and flags an up-trend", () => {
    const v = computeReviewVelocity(strongPortfolio(), 6, NOW);
    expect(v.months).toHaveLength(6);
    expect(v.recent).toBe(8); // last 30 days
    expect(v.prior).toBe(4); // 30–60 days
    expect(v.trend).toBe("up");
  });

  it("flags a down-trend when recent < prior", () => {
    const reviews = [
      review({ rating: 5, date: daysAgo(5) }),
      review({ rating: 5, date: daysAgo(40) }),
      review({ rating: 5, date: daysAgo(45) }),
      review({ rating: 5, date: daysAgo(50) }),
    ];
    const v = computeReviewVelocity(reviews, 6, NOW);
    expect(v.recent).toBe(1);
    expect(v.prior).toBe(3);
    expect(v.trend).toBe("down");
  });

  it("is safe with no reviews", () => {
    const v = computeReviewVelocity([], 6, NOW);
    expect(v.recent).toBe(0);
    expect(v.trend).toBe("flat");
    expect(v.months.every((m) => m.count === 0)).toBe(true);
  });
});

describe("buildReputationSummary — response rate", () => {
  it("computes reply coverage as % of reviews replied to", () => {
    const rep = buildReputationSummary(strongPortfolio(), NOW);
    expect(rep.summary.replyCoverage).toBe(85); // 34 of 40
    expect(rep.waitingReplies).toBe(6);
    expect(rep.responseNote).toBe("You reply to most reviews");
  });

  it("frames a low response rate as an opportunity, not shame", () => {
    const reviews = [
      review({ rating: 5, date: daysAgo(2), reply: "thanks" }),
      review({ rating: 5, date: daysAgo(5) }),
      review({ rating: 4, date: daysAgo(9) }),
      review({ rating: 5, date: daysAgo(12) }),
      review({ rating: 5, date: daysAgo(15) }),
    ];
    const rep = buildReputationSummary(reviews, NOW);
    expect(rep.summary.replyCoverage).toBe(20); // 1 of 5
    expect(rep.responseNote).toBe("Reply to 4 waiting reviews");
    // Honest framing — the verdict stays positive, never a red "you're failing".
    expect(rep.verdict.toLowerCase()).not.toContain("low");
  });
});

describe("buildReputationSummary — verdict-first", () => {
  it("leads with a strong verdict when rating is high and most are replied", () => {
    const rep = buildReputationSummary(strongPortfolio(), NOW);
    expect(rep.summary.averageRating).toBe(4.9);
    expect(rep.verdict).toContain("Your reputation is strong");
    expect(rep.verdict).toContain("4.9");
    expect(rep.verdict).toContain("40 reviews");
    expect(rep.verdict).toContain("reply to most of them");
  });
});

describe("buildReputationSummary — honest low-data states", () => {
  it("flags low data below the confidence threshold", () => {
    const rep = buildReputationSummary(
      [review({ rating: 5, date: daysAgo(2) }), review({ rating: 5, date: daysAgo(4) })],
      NOW,
    );
    expect(rep.lowData).toBe(true);
  });

  it("does not flag low data with a healthy review count", () => {
    expect(buildReputationSummary(strongPortfolio(), NOW).lowData).toBe(false);
  });
});

describe("buildReputationSummary — client-safe shape", () => {
  it("exposes no admin-only review signal", () => {
    const rep = buildReputationSummary(strongPortfolio(), NOW);
    const keys = Object.keys(rep);
    expect(keys).not.toContain("concerns");
    expect(keys).not.toContain("needsResponse");
    expect(keys).not.toContain("atRisk");
    expect(keys).not.toContain("unansweredNegative");
    // The nested client summary is likewise concern-free.
    expect(Object.keys(rep.summary)).not.toContain("concerns");
  });
});

function render(props: Parameters<typeof ReputationHeader>[0]): string {
  return renderToStaticMarkup(createElement(ReputationHeader, props));
}

describe("ReputationHeader render", () => {
  it("renders the verdict, response rate, and velocity tiles", () => {
    const html = render({ reviews: strongPortfolio(), gbpConnected: true, copyDest: "Google" });
    expect(html).toContain("Reputation");
    expect(html).toContain("Your reputation is strong");
    expect(html).toContain("Response rate");
    expect(html).toContain("85%");
    expect(html).toContain("New this month");
  });

  it("invites more reviews (not a red number) when data is thin", () => {
    const html = render({
      reviews: [review({ rating: 5, date: daysAgo(3) })],
      gbpConnected: false,
      copyDest: "Google",
    });
    expect(html).toContain("Let&#x27;s get more");
    expect(html).toContain("copy it into Google");
  });
});
