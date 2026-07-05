import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { TrafficSourcesPanel } from "@/components/dashboard/TrafficSourcesPanel";
import type { GaPerf } from "@/lib/analytics";

function ga(overrides: Partial<GaPerf> = {}): GaPerf {
  return {
    status: "ok",
    users: 512,
    sessions: 640,
    pageviews: 1800,
    topPages: [
      { path: "/", views: 900 },
      { path: "/classes", views: 400 },
    ],
    topSources: [
      { source: "google", sessions: 480 },
      { source: "(direct)", sessions: 90 },
      { source: "l.instagram.com", sessions: 40 },
    ],
    ...overrides,
  };
}

const UNCONFIGURED_GA: GaPerf = {
  status: "unconfigured",
  users: 0,
  sessions: 0,
  pageviews: 0,
  topPages: [],
  topSources: [],
};
const UNAVAILABLE_GA: GaPerf = { ...UNCONFIGURED_GA, status: "unavailable" };

function render(props: Parameters<typeof TrafficSourcesPanel>[0]): string {
  return renderToStaticMarkup(createElement(TrafficSourcesPanel, props));
}

describe("TrafficSourcesPanel — data state", () => {
  it("shows sources and landing pages when GA4 is connected", () => {
    const html = render({ ga: ga(), connectHref: "/dashboard/integrations" });
    expect(html).toContain("Where your visitors come from");
    expect(html).toContain("Google");
    // Raw GA4 tokens are humanized for the owner.
    expect(html).toContain("Direct / typed in");
    expect(html).toContain("480");
    expect(html).toContain("Where they land");
    expect(html).toContain("/classes");
  });
});

describe("TrafficSourcesPanel — connect state", () => {
  it("mirrors the GSC connect prompt when GA4 is unconfigured", () => {
    const html = render({ ga: UNCONFIGURED_GA, connectHref: "/x/dashboard/integrations" });
    expect(html).toContain("Connect Google and we&#x27;ll show where your visitors come from");
    expect(html).toContain("/x/dashboard/integrations");
    expect(html).not.toContain("Where they land");
  });

  it("shows the connect prompt when GA4 data is null (not loaded)", () => {
    const html = render({ ga: null, connectHref: "/dashboard/integrations" });
    expect(html).toContain("Connect Google and we&#x27;ll show where your visitors come from");
  });
});

describe("TrafficSourcesPanel — configured but no data", () => {
  it("shows a quiet coming-soon when configured but unavailable", () => {
    const html = render({ ga: UNAVAILABLE_GA, connectHref: "/dashboard/integrations" });
    expect(html).toContain("coming soon");
    expect(html).not.toContain("Connect Google and we&#x27;ll show where your visitors come from");
  });

  it("invites patience when connected but no sessions measured yet", () => {
    const html = render({
      ga: ga({ topSources: [], topPages: [] }),
      connectHref: "/dashboard/integrations",
    });
    expect(html).toContain("As visitors arrive");
  });
});
