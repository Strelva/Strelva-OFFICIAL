import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GoogleConnect, foundFactText, type GoogleConnectProps } from "@/experience/places/GoogleConnect";
import { WorkspaceGoogle } from "@/experience/places/WorkspaceGoogle";

const WS = "11111111-1111-4111-8111-111111111111";
const action = vi.fn(async () => undefined);
const base: GoogleConnectProps = { workspaceId: WS, viewer: "owner", enabled: true, hasListing: false, params: {}, actions: { start: action, choose: action, reread: action, decide: action } };
const render = (props: Partial<GoogleConnectProps> = {}) => renderToStaticMarkup(createElement(GoogleConnect, { ...base, ...props }));

describe("Connect Google on the Google place", () => {
  it("offers the owner Connect Google with their own account, and never routes to Strelva", () => {
    const page = render();
    expect(page).toContain("Connect Google"); expect(page).toContain("Sign in with the Google account that runs your Business Profile");
    expect(page).toContain("Nothing changes on Google until you approve it");
    expect(page).not.toMatch(/Ask Strelva|Strelva Agency/);
  });
  it("gives an agency a copy-a-link action and says Strelva doesn't send it", () => {
    const page = render({ viewer: "agency" });
    expect(page).toContain("Send the owner a connect link"); expect(page).toContain("Strelva doesn&#x27;t send it");
    expect(page).not.toContain(">Connect Google<");
  });
  it("tells a member the owner connects and offers no connect action", () => {
    const page = render({ viewer: "member" });
    expect(page).toContain("The business owner connects it with their own Google account.");
    expect(page).not.toContain("<form");
  });
  it("shows Coming soon with a working Google alternative while connect is dark", () => {
    for (const viewer of ["owner", "agency", "member"] as const) {
      const page = render({ viewer, enabled: false });
      expect(page).toContain("Coming soon");
      expect(page).toContain('href="https://business.google.com/"');
      expect(page).toContain("manage your listing directly on Google today");
      expect(page).not.toContain("<form");
      expect(page).not.toContain("connect link");
    }
    expect(render({ enabled: false })).toContain("Update business details in Strelva");
    expect(render({ enabled: false, viewer: "agency" })).not.toContain("Update business details in Strelva");
  });
  it("lists the found listings to choose from, and explains quota 0 plainly", () => {
    const page = render({ params: { connect: "choose" }, choices: { googleEmail: "owner@gmail.test", listings: [{ accountId: "accounts/1", locationId: "9", title: "Synthetic Bakery", address: "1 Main St, Buffalo" }], more: true } });
    expect(page).toContain("Choose your listing"); expect(page).toContain("Synthetic Bakery"); expect(page).toContain("Connect this listing"); expect(page).toContain("Only the first 1 are shown");
    expect(render({ params: { connect: "access_pending" } })).toContain("Google hasn&#x27;t opened its Business Profile access to Strelva yet");
    expect(render({ hasListing: true, params: { connect: "connected", read: "access_pending" } })).toContain("Your Google connection is saved");
  });
  it("shows found facts as not in the record until the owner adds them; others wait", () => {
    const foundFacts = [{ id: "f1", key: "phone" as const, value: "(716) 555-0100", foundAt: "2026-10-12T00:00:00Z" }, { id: "f2", key: "categories" as const, value: ["Bakery"], foundAt: "2026-10-12T00:00:00Z" }];
    const owned = render({ hasListing: true, foundFacts });
    expect(owned).toContain("Found on your Google listing"); expect(owned).toContain("Not in your record until you add it");
    expect(owned).toContain("Add to your record"); expect(owned).toContain("Not right"); expect(owned).toContain("For reference");
    const member = render({ hasListing: true, viewer: "member", foundFacts });
    expect(member).toContain("Waiting for the owner"); expect(member).not.toContain("Add to your record");
    expect(foundFactText({ key: "hours", value: { weekly: [{ day: 1, opens: "07:00", closes: "15:00" }] } })).toBe("Mon 07:00–15:00");
  });
  it("keeps the listing page neutral when no connect panel is supplied", () => {
    const page = renderToStaticMarkup(createElement(WorkspaceGoogle, { workspaceId: WS, state: { kind: "ready", data: [] }, action }));
    expect(page).toContain("No Google listing is connected here yet."); expect(page).not.toContain("Ask Strelva");
  });
});

import { GoogleReadGrant } from "@/experience/places/GoogleReadGrant";
describe("Search Console and Analytics section", () => {
  const view = (connected: boolean) => ({ connected, googleEmail: connected ? "web@agency.test" : null, gsc: { granted: connected, property: null }, ga4: { granted: connected, property: "properties/42" } });
  const grant = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(GoogleReadGrant, { workspaceId: WS, owner: true, view: view(false), actions: { start: action, choose: action, disconnect: action }, ...props }));
  it("offers the owner a separate read-only sign-in and says it's separate from the listing", () => {
    const page = grant({});
    expect(page).toContain("Connect Search Console and Analytics"); expect(page).toContain("separate from your listing"); expect(page).toContain("Read only");
    expect(grant({ owner: false })).toContain("The business owner connects Search Console and Analytics.");
  });
  it("shows the summary to everyone and honest unavailable states", () => {
    const page = grant({ owner: false, view: view(true), summary: { gsc: { status: "unconfigured" }, ga4: { status: "ok", report: { users: 1200, sessions: 1500, pageviews: 4000 } } } });
    expect(page).toContain("No Search Console site chosen yet."); expect(page).toContain("1,200"); expect(page).not.toContain("Disconnect");
    expect(grant({ view: view(true), summary: { gsc: { status: "unavailable" }, ga4: { status: "unavailable" } } })).toContain("Couldn&#x27;t be read right now. The connection is kept.");
  });
});

describe("Connect Google from the claim review", () => {
  it("carries a validated returnTo through the one-click start and offers skip / continue", () => {
    const fresh = render({ returnTo: "/workspace/claim/t" });
    expect(fresh).toContain('name="returnTo" value="/workspace/claim/t"'); expect(fresh).toContain("Skip for now");
    expect(render({ hasListing: true, returnTo: "/workspace/claim/t" })).toContain("Continue where you were");
  });
});
