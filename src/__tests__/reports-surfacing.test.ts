import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WeeklyBriefClient } from "@/components/dashboard/WeeklyBriefClient";
import type { CompetitorBenchmark } from "@/lib/competitor-benchmark";
import type { SearchData, WeeklyBrief } from "@/lib/types";

function brief(overrides: Partial<WeeklyBrief> = {}): WeeklyBrief {
  return {
    id: "b1",
    tenantId: "acme",
    weekStart: "2026-06-23",
    weekEnd: "2026-06-29",
    summary: "A steady week.",
    stats: {
      pageViews: 47,
      bookingClicks: 5,
      reviewsReceived: 2,
      contentUpdates: 1,
      pageViewsDelta: 3,
      bookingClicksDelta: 1,
    },
    highlights: [],
    topServices: [],
    topSearchQueries: [{ query: "yoga near me", clicks: 4, impressions: 90, position: 3 }],
    staleSections: [],
    createdAt: "2026-06-29T00:00:00.000Z",
    ...overrides,
  };
}

function benchmark(aiAnswerMentioned: boolean | null): CompetitorBenchmark {
  return {
    rows: [
      {
        query: "yoga buffalo",
        yourRank: 2,
        yourInPack: false,
        competitors: [{ name: "Zen Studio", rank: 5, inPack: false }],
        youLead: true,
        aiAnswerMentioned,
      },
    ],
    leadCount: 1,
    total: 1,
    headline: "You're out-ranking your competitors across the board.",
  };
}

function render(props: Parameters<typeof WeeklyBriefClient>[0]): string {
  return renderToStaticMarkup(createElement(WeeklyBriefClient, props));
}

describe("Where you rank — AI answers row", () => {
  it("shows the business gets named when AI presence is true", () => {
    const html = render({ brief: brief(), benchmark: benchmark(true) });
    expect(html).toContain("When people ask AI for this:");
    expect(html).toContain("you get named");
  });

  it("shows not-named-yet when AI presence is false", () => {
    const html = render({ brief: brief(), benchmark: benchmark(false) });
    expect(html).toContain("When people ask AI for this:");
    expect(html).toContain("not named yet");
  });

  it("omits the AI row entirely when the answer wasn't probed (null)", () => {
    const html = render({ brief: brief(), benchmark: benchmark(null) });
    expect(html).not.toContain("When people ask AI for this:");
  });
});

describe("Search Console query table", () => {
  const searchData: SearchData = {
    queries: [
      { query: "yoga near me", clicks: 12, impressions: 340, position: 2 },
      { query: "buffalo pilates", clicks: 3, impressions: 88, position: 6 },
    ],
    totalClicks: 15,
    totalImpressions: 428,
    fetchedAt: "2026-06-29T00:00:00.000Z",
  };

  it("renders the full query list as a table sorted by visits", () => {
    const html = render({ brief: brief(), searchData });
    expect(html).toContain("What people search to find you");
    expect(html).toContain("yoga near me");
    expect(html).toContain("buffalo pilates");
    // Higher-click query is ordered before the lower one.
    expect(html.indexOf("yoga near me")).toBeLessThan(html.indexOf("buffalo pilates"));
    // The table replaces the single Search Signal tile.
    expect(html).not.toContain("Search Signal");
  });

  it("degrades to the single Search Signal tile when there's no GSC data", () => {
    const html = render({ brief: brief(), searchData: null });
    expect(html).not.toContain("What people search to find you");
    expect(html).toContain("Search Signal");
  });
});
