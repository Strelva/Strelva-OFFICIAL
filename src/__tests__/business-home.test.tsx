import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }), usePathname: () => "/workspace", useSearchParams: () => new URLSearchParams() }));
import { BusinessHome } from "@/experience/workspace/BusinessHome";
import type { WorkspaceSnapshot, WorkspaceWork } from "@/experience/workspace/contracts";
import type { WorkspaceOfferingState } from "@/experience/workspace/WorkspaceOfferings";
import { HomeOutcomesProvider } from "@/experience/workspace/outcomes/HomeOutcomes";
import { BAKERY_LOOP } from "@/experience/workspace/preview/outcomes-fixture";

const offeringState: WorkspaceOfferingState = {
  status: "unavailable",
  reason: "Offerings are not available in this fixture.",
};

function work(id: string, extra: Partial<WorkspaceWork> = {}): WorkspaceWork {
  return {
    id,
    workspaceId: "business-1",
    title: id,
    productId: "documents",
    resourceKind: "document",
    payload: null,
    input: {},
    createdAt: "2026-09-19T12:00:00Z",
    ...extra,
  };
}

function snapshot(items: WorkspaceWork[]): WorkspaceSnapshot {
  return {
    actor: { email: "owner@alder.example", localPreview: true },
    workspaces: [{ id: "business-1", kind: "customer", name: "Alder Workshop", role: "owner" }],
    workspaceId: "business-1",
    work: items,
    handoffs: [],
    delegations: [],
    products: [],
  };
}

const noop = () => undefined;

function renderHome(items: WorkspaceWork[] = [
  work("Review urgency field", { productId: "operations", resourceKind: "responsibility", operation: { status: "needs_attention", reason: "Review the proposed change." } }),
  work("Opening checklist"),
], systemsReleased = false) {
  return renderToStaticMarkup(createElement(BusinessHome, {
    snapshot: snapshot(items),
    sites: [],
    unassignedSites: [],
    siteAssignmentsKnown: true,
    offerings: offeringState,
    busy: false,
    onOpen: noop,
    onStart: noop,
    onRequest: noop,
    onNavigate: noop,
    onWorkspace: noop,
    onOfferings: noop,
    accountHref: "/workspace/account",
    signOut: createElement("button", { type: "button" }, "Sign out"),
    systemsReleased,
  }));
}

describe("business home", () => {
  it("shows the outcome loop only when a preview provides it", () => {
    expect(renderHome()).not.toContain('data-outcome="loop"');
    const props = { snapshot: snapshot([]), sites: [], unassignedSites: [], siteAssignmentsKnown: true, offerings: offeringState, busy: false,
      onOpen: noop, onStart: noop, onRequest: noop, onNavigate: noop, onWorkspace: noop, onOfferings: noop, accountHref: "/workspace/account" };
    const html = renderToStaticMarkup(createElement(HomeOutcomesProvider, { value: { loop: BAKERY_LOOP } }, createElement(BusinessHome, props)));
    expect(html).toContain('data-outcome="loop"');
    expect(html).toContain("412 people found you. 9 became bookings.");
  });

  it("presents the business's actual Systems and Needs you, and keeps Systems out of the files list", () => {
    const items = [work("Mediation intake", { productId: "applications" }), work("AI check", { productId: "ai_visibility" })];
    const html = renderToStaticMarkup(createElement(BusinessHome, {
      snapshot: snapshot(items), sites: [], unassignedSites: [], siteAssignmentsKnown: true, offerings: offeringState, busy: false,
      onOpen: noop, onStart: noop, onRequest: noop, onNavigate: noop, onWorkspace: noop, onOfferings: noop, accountHref: "/workspace/account",
      systems: [{ id: "work:Mediation intake", kind: "app", name: "Mediation intake", detail: "Used by your team", lifecycle: "live", health: { state: "unknown", summary: "Nothing has checked this yet." }, surface: { kind: "work", workId: "Mediation intake", productId: "applications" }, connections: [], possibilities: [], versions: [] }],
      files: [items[1]!], systemsReleased: true,
    }));
    // October 6: the dusk band greets the owner; the business is named on the line above.
    expect(html).toContain("<h1 id=\"business-start-title\" class=\"font-display\">Welcome back.</h1>");
    expect(html).toContain("Alder Workshop</p>");
    expect(html).toContain("1 system live");
    expect(html.indexOf("Needs you")).toBeLessThan(html.indexOf("id=\"home-systems\""));
    expect(html).toContain("Open Mediation intake, Internal tool, Live, Unknown");
    expect(html).toContain("Ask Strelva for anything your business needs");
    expect(html).toContain("All systems and files");
    expect(html).not.toContain("Open Mediation intake\"");
    expect(html).toContain("Open AI check");
  });

  it("tells an empty business that Strelva builds its systems, without a build-it-yourself prompt", () => {
    const html = renderToStaticMarkup(createElement(BusinessHome, {
      snapshot: snapshot([]), sites: [], unassignedSites: [], siteAssignmentsKnown: true, offerings: offeringState, busy: false,
      onOpen: noop, onStart: noop, onRequest: noop, onNavigate: noop, onWorkspace: noop, onOfferings: noop, accountHref: "/workspace/account", systems: [], files: [], systemsReleased: true,
    }));
    expect(html).toContain("Nothing is running yet.");
    expect(html).toContain("once Strelva builds them");
    expect(html).not.toContain("Get or build");
  });

  it("links to /workspace/site to bring the business's own website in, only while connected sites are on for it", () => {
    const base = { sites: [], unassignedSites: [], siteAssignmentsKnown: true, offerings: offeringState, busy: false,
      onOpen: noop, onStart: noop, onRequest: noop, onNavigate: noop, onWorkspace: noop, onOfferings: noop, accountHref: "/workspace/account", files: [], systemsReleased: true };
    const on = { ...snapshot([]), releases: { systems: true, connectedSites: true } };
    const empty = renderToStaticMarkup(createElement(BusinessHome, { ...base, snapshot: on, systems: [] }));
    expect(empty).toContain("Already have a website?");
    expect(empty).toContain('href="/workspace/site?workspaceId=business-1"');
    const website = { id: "site-1", kind: "website" as const, name: "alder.example", detail: "", lifecycle: "live" as const, health: { state: "unknown" as const, summary: "" }, surface: { kind: "website" as const, previewSrc: "", previewLabel: "", domain: "alder.example" }, connections: [], possibilities: [], versions: [] };
    const withSite = renderToStaticMarkup(createElement(BusinessHome, { ...base, snapshot: on, systems: [website] as never }));
    expect(withSite).toContain("Have another website?");
    const rebuild = { ...snapshot([]), releases: { systems: true, websiteRebuild: true } };
    expect(renderToStaticMarkup(createElement(BusinessHome, { ...base, snapshot: rebuild, systems: [] }))).toContain("Open website options");
    // Off for this business, or a read-only agency view: no link.
    expect(renderToStaticMarkup(createElement(BusinessHome, { ...base, snapshot: { ...snapshot([]), releases: { systems: true } }, systems: [] }))).not.toContain("/workspace/site");
    const shared = { ...on, workspaces: [{ id: "business-1", kind: "customer" as const, name: "Alder Workshop", access: "delegated_read" as const }] };
    expect(renderToStaticMarkup(createElement(BusinessHome, { ...base, snapshot: shared, systems: [] }))).not.toContain("/workspace/site");
    // While Systems load, no link yet.
    expect(renderToStaticMarkup(createElement(BusinessHome, { ...base, snapshot: on, systems: [], systemsLoading: true }))).not.toContain("Already have a website?");
  });

  it("renders the pre-Systems Home while STRELVA_SYSTEMS_RELEASE is off, even if Systems are passed", () => {
    const items = [work("Mediation intake", { productId: "applications" }), work("AI check", { productId: "ai_visibility" })];
    const html = renderToStaticMarkup(createElement(BusinessHome, {
      snapshot: snapshot(items), sites: [{ id: "alder", title: "alder.example", href: "/dashboard", productId: "managed_presence", relationship: "client" }], unassignedSites: [], siteAssignmentsKnown: true, offerings: offeringState, busy: false,
      onOpen: noop, onStart: noop, onRequest: noop, onNavigate: noop, onWorkspace: noop, onOfferings: noop, accountHref: "/workspace/account",
      systems: [{ id: "work:Mediation intake", kind: "app", name: "Mediation intake", detail: "Used by your team", lifecycle: "live", health: { state: "unknown", summary: "Nothing has checked this yet." }, surface: { kind: "work", workId: "Mediation intake", productId: "applications" }, connections: [], possibilities: [], versions: [] }],
      files: [items[1]!],
    }));
    // The greeting and composer lead, as before Systems; no business header or Systems list.
    expect(html).toContain("id=\"business-start-title\"");
    expect(html.indexOf("Ask Strelva for anything your business needs")).toBeLessThan(html.indexOf("Needs you"));
    for (const gone of ["id=\"home-systems\"", "Systems", "All systems and files", "Files and results", "live ·", "Nothing is running yet.", "Internal tool, Live"]) expect(html).not.toContain(gone);
    // Every saved result, the managed website and apps are where they were.
    expect(html).toContain("2 saved results");
    expect(html).toContain("1 connected website");
    expect(html).toContain(">Recent<");
    expect(html).toContain("All apps and files (2)");
    expect(html).toContain("Open Mediation intake");
    expect(html).toContain("Open AI check");
    expect(html).toContain("aria-label=\"Website and apps\"");
    expect(html).toContain(">alder.example<");
    // The Customers page is retired in both states (October 6).
    expect(html).not.toContain(">Customers<");
  });

  it("keeps intent primary while putting saved work and next actions in front of category counts", () => {
    expect(renderHome()).toContain("Recent");
    const html = renderHome(undefined, true);

    expect(html).toContain("Needs you");
    expect(html).toContain("Review urgency field");
    expect(html).toContain("What changed");
    expect(html).toContain("In progress");
    expect(html).toContain("All requests");
    expect(html).toContain("Files and results");
    expect(html).toContain("Opening checklist");
    for (const retired of ["Waiting on you", "id=\"home-work\"", "Strelva is handling"]) expect(html).not.toContain(retired);
    expect(html).not.toMatch(/>Applications<|>Documents</);
  });

  it("offers a truthful route to allowance and payer details without inventing a Home metric", () => {
    const html = renderHome([]);

    expect(html).toContain("Current workspace");
    expect(html).toContain("Alder Workshop");
    expect(html).toContain("Work allowance");
    expect(html).toContain("Review allowance and payer details in Business details.");
    expect(html).toContain("Open Business details");
    expect(html).not.toContain("$0");
  });

  it("with Systems released, What changed is the receipt feed and In progress lists Make real", () => {
    const base = snapshot([work("Opening checklist")]);
    const props = { sites: [], unassignedSites: [], siteAssignmentsKnown: true, offerings: offeringState, busy: false,
      onOpen: noop, onStart: noop, onRequest: noop, onNavigate: noop, onWorkspace: noop, onOfferings: noop, accountHref: "/workspace/account", systemsReleased: true };
    const html = renderToStaticMarkup(createElement(BusinessHome, { ...props, snapshot: { ...base, systems: {
      status: "ready", systems: [], connections: [], possibilities: [],
      handled: [{ id: "h1", systemId: null, sentence: "Strelva: Publish the booking page", at: "2026-10-05T12:00:00Z", undo: "Undo from History" }],
      activations: [{ id: "a1", possibilityId: "p1", title: "Consult booking", status: "in_progress", headline: "Making consult booking live: 2 of 4 done", partlyLive: false, done: 2, total: 4, affects: [], lines: [] },
        { id: "a2", possibilityId: "p2", title: "Rebuilt site", status: "needs_attention", headline: "Partly live", partlyLive: true, done: 3, total: 5, affects: [], lines: [] }],
    } } }));
    expect(html).toContain("Strelva: Publish the booking page");
    expect(html).toContain("Undo from History");
    expect(html).toContain("Making consult booking live: 2 of 4 done");
    expect(html).toContain("Rebuilt site: Partly live");
    const quiet = renderToStaticMarkup(createElement(BusinessHome, { ...props, snapshot: base }));
    expect(quiet).toContain("Nothing this week.");
  });

  it("keeps a personal workspace to what it can use: no business request lists, saved work still one click away", () => {
    const html = renderToStaticMarkup(createElement(BusinessHome, {
      snapshot: { ...snapshot([work("Opening checklist")]), workspaces: [{ id: "business-1", kind: "personal", name: "Alex’s work" }] },
      sites: [], unassignedSites: [], siteAssignmentsKnown: true, offerings: offeringState, busy: false,
      onOpen: noop, onStart: noop, onRequest: noop, onNavigate: noop, onWorkspace: noop, onOfferings: noop, accountHref: "/workspace/account",
    }));
    expect(html).toContain("Needs you");
    expect(html).toContain("Open Opening checklist");
    expect(html).not.toContain("What changed");
    expect(html).not.toContain("All requests");
  });
});
