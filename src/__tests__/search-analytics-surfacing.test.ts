import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildAnalyticsRows } from "@/lib/reports";
import { SearchAnalyticsPanel } from "@/components/dashboard/SearchAnalyticsPanel";
import type { SearchPerf, GaPerf } from "@/lib/analytics";

function search(overrides: Partial<SearchPerf> = {}): SearchPerf {
  return {
    status: "ok",
    clicks: 128,
    impressions: 3400,
    ctr: 0.037,
    position: 4.2,
    topQueries: [
      { query: "yoga near me", clicks: 40, impressions: 900, position: 3 },
      { query: "buffalo yoga studio", clicks: 22, impressions: 500, position: 5 },
    ],
    ...overrides,
  };
}

function ga(overrides: Partial<GaPerf> = {}): GaPerf {
  return {
    status: "ok",
    users: 512,
    sessions: 640,
    pageviews: 1800,
    topPages: [{ path: "/", views: 900 }, { path: "/classes", views: 400 }],
    topSources: [{ source: "google", sessions: 480 }],
    ...overrides,
  };
}

const UNCONFIGURED_SEARCH: SearchPerf = { status: "unconfigured", clicks: 0, impressions: 0, ctr: 0, position: 0, topQueries: [] };
const UNCONFIGURED_GA: GaPerf = { status: "unconfigured", users: 0, sessions: 0, pageviews: 0, topPages: [], topSources: [] };
const UNAVAILABLE_SEARCH: SearchPerf = { ...UNCONFIGURED_SEARCH, status: "unavailable" };
const UNAVAILABLE_GA: GaPerf = { ...UNCONFIGURED_GA, status: "unavailable" };

describe("monthly report — Search & Analytics block", () => {
  it("includes clicks, impressions, top query, and visitors when both reads are ok", () => {
    const rows = buildAnalyticsRows(search(), ga());
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(byLabel["Found you on Google"]).toBe("128 clicks");
    expect(byLabel["Shown on Google"]).toBe("3,400 times");
    expect(byLabel["Top search"]).toBe('"yoga near me"');
    expect(byLabel["Visitors"]).toBe("512");
  });

  it("omits the block entirely when nothing is connected (unconfigured)", () => {
    expect(buildAnalyticsRows(UNCONFIGURED_SEARCH, UNCONFIGURED_GA)).toEqual([]);
  });

  it("omits the block when reads are unavailable", () => {
    expect(buildAnalyticsRows(UNAVAILABLE_SEARCH, UNAVAILABLE_GA)).toEqual([]);
  });

  it("includes only the surface that is ok when the other is not", () => {
    const rows = buildAnalyticsRows(search(), UNCONFIGURED_GA);
    const labels = rows.map((r) => r.label);
    expect(labels).toContain("Found you on Google");
    expect(labels).not.toContain("Visitors");
  });
});

function renderPanel(props: Parameters<typeof SearchAnalyticsPanel>[0]): string {
  return renderToStaticMarkup(createElement(SearchAnalyticsPanel, props));
}

describe("dashboard — Search & Analytics panel", () => {
  it("shows friendly stats + queries + pages when ok", () => {
    const html = renderPanel({ search: search(), ga: ga(), connectHref: "/dashboard/integrations" });
    expect(html).toContain("How people find you on Google");
    expect(html).toContain("Found you");
    expect(html).toContain("Visitors");
    expect(html).toContain("#4.2");
    expect(html).toContain("yoga near me");
    expect(html).toContain("Most-visited pages");
  });

  it("shows a gentle connect nudge when unconfigured (the common case)", () => {
    const html = renderPanel({ search: UNCONFIGURED_SEARCH, ga: UNCONFIGURED_GA, connectHref: "/x/dashboard/integrations" });
    expect(html).toContain("Connect Google to see your search performance");
    expect(html).toContain("/x/dashboard/integrations");
    expect(html).not.toContain("Most-visited pages");
  });

  it("shows a quiet coming-soon when configured but data is unavailable", () => {
    const html = renderPanel({ search: UNAVAILABLE_SEARCH, ga: UNAVAILABLE_GA, connectHref: "/dashboard/integrations" });
    expect(html).toContain("coming soon");
    expect(html).not.toContain("Connect Google to see your search performance");
  });
});
