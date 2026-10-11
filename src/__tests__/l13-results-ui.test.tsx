import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { L13Results } from "@/experience/workspace/preview/L13Results";
import { resultsHref } from "@/experience/places/WorkspaceResults";

const html = (state?: string) => renderToStaticMarkup(createElement(L13Results, { state }));
describe("remaining owner results presentation", () => {
  it("distinguishes clicks, visits and sampled answers with their source periods", () => {
    const page = html();
    expect(page).toContain("Booking-link and phone-link clicks");
    expect(page).toContain("A click doesn&#x27;t confirm a booking or an answered call");
    expect(page).toContain("Google Search Console · last 4 weeks");
    expect(page).toContain("Google Analytics · last 4 weeks");
    expect(page).toContain("Strelva sampled");
    expect(page).toContain("not a fixed rank");
    expect(page).not.toMatch(/\bAI\b|\bagent\b|\bautomation\b|\bworkflow\b|\btask\b/);
  });

  it("keeps unavailable sources separate from disconnected sources", () => {
    const unavailable = html("unavailable");
    expect(unavailable).toContain("couldn&#x27;t be read right now");
    expect(unavailable).toContain("Your Google connection is kept");
    expect(unavailable).toContain("No sampled answers are available yet");
    expect(unavailable).not.toContain("Visits to your site");
    const disconnected = html("disconnected");
    expect(disconnected).toContain("Google search isn&#x27;t connected");
    expect(disconnected).toContain("Visitor sources aren&#x27;t connected");
  });

  it("does not disclose result rows on permission refusal or read failure", () => {
    for (const state of ["permission", "error", "loading", "empty"]) {
      const page = html(state);
      expect(page).not.toContain("custom cakes buffalo");
      expect(page).not.toContain("Which bakery has sourdough?");
    }
    expect(html("denied")).toContain("Your account can&#x27;t open Juniper East yet");
    expect(html("permission")).toContain("This belongs to another business");
    expect(html("loading")).toContain("Loading results");
  });

  it("retains custom dates and encoded business identity in links", () => {
    expect(resultsHref("a&b", "custom", { from: "2026-09-01", to: "2026-09-30" })).toBe("/workspace/results?workspaceId=a%26b&range=custom&from=2026-09-01&to=2026-09-30");
  });
});
