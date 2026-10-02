import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }), usePathname: () => "/workspace", useSearchParams: () => new URLSearchParams() }));
import { BusinessHome } from "@/experience/workspace/BusinessHome";
import type { WorkspaceSnapshot, WorkspaceWork } from "@/experience/workspace/contracts";
import type { WorkspaceOfferingState } from "@/experience/workspace/WorkspaceOfferings";

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
]) {
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
  }));
}

describe("business home", () => {
  it("keeps intent primary while putting saved work and next actions in front of category counts", () => {
    const html = renderHome();

    expect(html).toContain("Needs you");
    expect(html).toContain("Review urgency field");
    expect(html).toContain("Strelva handled");
    expect(html).toContain("In progress");
    expect(html).toContain("All requests");
    expect(html).toContain("Recent");
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

  it("keeps a personal workspace to what it can use: no business request lists, saved work still one click away", () => {
    const html = renderToStaticMarkup(createElement(BusinessHome, {
      snapshot: { ...snapshot([work("Opening checklist")]), workspaces: [{ id: "business-1", kind: "personal", name: "Alex’s work" }] },
      sites: [], unassignedSites: [], siteAssignmentsKnown: true, offerings: offeringState, busy: false,
      onOpen: noop, onStart: noop, onRequest: noop, onNavigate: noop, onWorkspace: noop, onOfferings: noop, accountHref: "/workspace/account",
    }));
    expect(html).toContain("Needs you");
    expect(html).toContain("Open Opening checklist");
    expect(html).not.toContain("Strelva handled");
    expect(html).not.toContain("All requests");
  });
});
