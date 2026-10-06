import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceInquiries } from "@/experience/places/WorkspaceInquiries";
import { recentCount } from "@/products/inquiries/linked-leads";
import { WorkspaceReviewsView, reviewSummary } from "@/experience/places/WorkspaceReviews";
import { WorkspaceResultsView, resultsHref } from "@/experience/places/WorkspaceResults";
import { WorkspaceBusinessDetails } from "@/experience/places/WorkspaceBusinessDetails";
import { SiteSummarySection } from "@/experience/workspace/SiteSummarySection";
import { replyErrorMessage } from "@/experience/places/ReviewReplyForm";
import type { BusinessRecord } from "@/platform/business-record/contracts";
import type { ReviewView } from "@/products/google-listing/linked-reviews";

const WS = "7f000000-0000-4000-8000-000000000010";
const STABLE = "7f000000-0000-4000-8000-0000000000b2";
const site = { tenantId: "lakeshore", tenantStableId: STABLE, siteName: "Lakeshore Dried Goods" };
const html = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);

describe("every place has the same way home and the same failure states", () => {
  it("permission, error and the no-site state", () => {
    const permission = html(createElement(WorkspaceInquiries, { workspaceId: WS, state: { kind: "permission" } }));
    expect(permission).toContain(`href="/workspace?workspaceId=${WS}"`);
    expect(permission).toContain("This belongs to another business");
    expect(html(createElement(WorkspaceReviewsView, { workspaceId: WS, state: { kind: "error" } }))).toContain("Reviews couldn&#x27;t load");
    expect(html(createElement(WorkspaceInquiries, { workspaceId: WS, state: { kind: "ready", data: { sites: [], denied: [] } } }))).toContain("No site is connected to this business yet");
  });

  it("names a site the person can't open instead of hiding it", () => {
    const page = html(createElement(WorkspaceInquiries, { workspaceId: WS, state: { kind: "ready", data: { sites: [], denied: [site] } } }));
    expect(page).toContain("can&#x27;t open Lakeshore Dried Goods yet");
    expect(page).not.toContain("No site is connected");
  });
});

describe("Inquiries", () => {
  const lead = { id: "l1", name: "Dana", email: "dana@example.test", message: "Do you ship?", source: "contact-form", fields: [["phone", "716"]] as Array<[string, string]>, createdAt: "2026-10-01T10:00:00Z" };
  it("shows each person with a reply link, and counts the last 30 days", () => {
    const page = html(createElement(WorkspaceInquiries, { workspaceId: WS, state: { kind: "ready", data: { sites: [{ tenantId: "lakeshore", siteName: "Lakeshore", leads: [lead], lastThirtyDays: 1, unavailable: false }], denied: [] } } }));
    expect(page).toContain("Dana");
    expect(page).toContain('href="mailto:dana@example.test"');
    expect(page).toContain("Contact form");
    expect(page).toContain("1 in the last 30 days");
    expect(recentCount([lead], Date.parse("2026-12-01T00:00:00Z"))).toBe(0);
  });
  it("says unavailable and empty differently", () => {
    const unavailable = html(createElement(WorkspaceInquiries, { workspaceId: WS, state: { kind: "ready", data: { sites: [{ tenantId: "lakeshore", siteName: "Lakeshore", leads: [], lastThirtyDays: 0, unavailable: true }], denied: [] } } }));
    expect(unavailable).toContain("couldn&#x27;t be read right now");
    const empty = html(createElement(WorkspaceInquiries, { workspaceId: WS, state: { kind: "ready", data: { sites: [{ tenantId: "lakeshore", siteName: "Lakeshore", leads: [], lastThirtyDays: 0, unavailable: false }], denied: [] } } }));
    expect(empty).toContain("No one has reached out yet");
  });
});

describe("Reviews", () => {
  const review = (patch: Partial<ReviewView>): ReviewView => ({ id: "r1", source: "google", author: "Jane", rating: 5, text: "Great", date: "2026-09-01", reply: null, repliedAt: null, draft: null, ...patch });
  const siteReviews = (reviews: ReviewView[], patch = {}) => ({ tenantId: "lakeshore", siteName: "Lakeshore", reviews, googleConnected: true, googlePlaceId: "PLACE", replyMode: "auto" as const, unavailable: false, ...patch });

  it("prefills Strelva's draft, says when it posts itself, and posts to Google when connected", () => {
    const page = html(createElement(WorkspaceReviewsView, { workspaceId: WS, state: { kind: "ready", data: { sites: [siteReviews([review({ draft: { reply: "Thanks, Jane!", autoPostAt: "2026-09-02T12:00:00Z" } })])], denied: [] } } }));
    expect(page).toContain("Thanks, Jane!");
    expect(page).toContain("posts by itself on");
    expect(page).toContain("Reply on Google");
    expect(page).toContain("writereview?placeid=PLACE");
  });

  it("shows a reply that exists and offers to save one when Google isn't connected", () => {
    const page = html(createElement(WorkspaceReviewsView, { workspaceId: WS, state: { kind: "ready", data: { sites: [siteReviews([review({ reply: "Thank you!", repliedAt: "2026-09-02" }), review({ id: "r2", source: "yelp" })], { googleConnected: false })], denied: [] } } }));
    expect(page).toContain("Your reply");
    expect(page).toContain("Save reply");
    expect(page).toContain("Google listing not connected");
    expect(reviewSummary([review({ rating: 5 }), review({ rating: 2, reply: "x" })])).toEqual({ count: 2, average: 3.5, waiting: 1 });
  });

  it("explains each failed reply honestly", () => {
    expect(replyErrorMessage(502, null)).toMatch(/Google didn't accept/);
    expect(replyErrorMessage(403, null)).toMatch(/can't reply/);
    expect(replyErrorMessage(500, { error: "Odd." })).toBe("Odd. Nothing was posted.");
  });
});

describe("Results", () => {
  it("keeps the business in the window links and says when visits couldn't be read", () => {
    expect(resultsHref(WS, "week")).toBe(`/workspace/results?workspaceId=${WS}&range=week`);
    const page = html(createElement(WorkspaceResultsView, { workspaceId: WS, range: "live", state: { kind: "ready", data: { sites: [{ ...site, stats: null, anomaly: null, visitorSeries: [], searchPerf: null, gaPerf: null, milestone: null, aiVisibility: null, health: null }], denied: [] } } }));
    expect(page).toContain("Visits for Lakeshore Dried Goods couldn&#x27;t be read right now");
    expect(page).toContain("hasn&#x27;t finished a check");
    expect(page).toContain('id="site-health"');
    expect(page).toContain('aria-current="page"');
  });
});

describe("Business details", () => {
  const record = (access: BusinessRecord["access"]): BusinessRecord => ({
    workspaceId: WS, access, revision: 2, lastSequence: 2, updatedAt: null,
    facts: { display_name: { value: "Lakeshore", source: "owner", verified: true, updatedAt: "2026-10-01T00:00:00Z", updatedBy: WS } },
    services: [], people: [], contactCount: 0,
  });
  const action = async () => {};

  it("is a form the owner can save, with a section for every old settings anchor", () => {
    const page = html(createElement(WorkspaceBusinessDetails, { workspaceId: WS, action, state: { kind: "ready", data: { record: record("owner"), operator: false, sites: [site], denied: [] } } }));
    expect(page).toContain("Save details");
    expect(page).toContain('value="2"');
    for (const anchor of ["business", "notifications", "ownership", "plan", "domains", "branding", "site-config", "dependencies", "shortcuts", "account", "people"]) expect(page, anchor).toContain(`id="${anchor}"`);
    expect(page).toContain("view=access");
  });

  it("is read-only for a member and says why, and shows the save outcome", () => {
    const page = html(createElement(WorkspaceBusinessDetails, { workspaceId: WS, action, result: "conflict", state: { kind: "ready", data: { record: record("member"), operator: false, sites: [], denied: [] } } }));
    expect(page).not.toContain("Save details");
    expect(page).toContain("Only the owner can change these details.");
    expect(page).toContain("Nothing was saved");
    const invalid = html(createElement(WorkspaceBusinessDetails, { workspaceId: WS, action, result: "invalid", field: "phone", state: { kind: "ready", data: { record: record("owner"), operator: false, sites: [], denied: [] } } }));
    expect(invalid).toContain("7 to 15 digits");
  });
});

describe("Home's From your site", () => {
  it("renders nothing while closed or when there is no site", () => {
    expect(html(createElement(SiteSummarySection, { workspaceId: WS, onRetry: () => {}, state: { status: "disabled" } }))).toBe("");
    expect(html(createElement(SiteSummarySection, { workspaceId: WS, onRetry: () => {}, state: { status: "ready", data: { sites: [], deniedSites: [] } } }))).toBe("");
  });

  it("shows the numbers, who reached out, what Strelva did, and the ways in", () => {
    const page = html(createElement(SiteSummarySection, { workspaceId: WS, onRetry: () => {}, state: { status: "ready", data: { deniedSites: [], sites: [{
      tenantId: "lakeshore", siteName: "Lakeshore", visits: { total: 120, thisWeek: 12 }, actions: null,
      leads: { count: 1, recent: [{ id: "l1", name: "Dana", message: "Do you ship?", createdAt: "2026-10-01" }] },
      activity: [{ id: "a1", label: "Updated your hours on Google", detail: null, time: "2026-10-02" }],
    }] } } }));
    expect(page).toContain("120 people found you · 12 this week");
    expect(page).toContain("booked or called: couldn&#x27;t check");
    expect(page).toContain("Dana");
    expect(page).toContain("Updated your hours on Google");
    for (const place of ["inquiries", "results", "reviews", "recaps"]) expect(page).toContain(`/workspace/${place}?workspaceId=${WS}`);
  });

  it("offers a retry when it couldn't load", () => {
    expect(html(createElement(SiteSummarySection, { workspaceId: WS, onRetry: () => {}, state: { status: "error" } }))).toContain("Check again");
  });
});
