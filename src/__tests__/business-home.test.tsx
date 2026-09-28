import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
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
    onWork: noop,
    onOngoing: noop,
    onAccess: noop,
    onSettings: noop,
    onWorkspace: noop,
    onHelp: noop,
    onExplore: noop,
    onOfferings: noop,
    accountHref: "/workspace/account",
    signOut: createElement("button", { type: "button" }, "Sign out"),
  }));
}

describe("business home", () => {
  it("leads with the business, its real facts and the work inside it", () => {
    const html = renderHome();

    expect(html).toContain("Needs you");
    expect(html).toContain("Review urgency field");
    expect(html).toContain("Opening checklist");
    expect(html).toMatch(/<h1[^>]*>Alder Workshop<\/h1>/);
    expect(html).toContain("Inside Alder Workshop");
    expect(html).toContain("What should Alder Workshop do next?");
    expect(html).toMatch(/\d+ (?:thing needs|things need) you/);
    expect(html).not.toMatch(/>Applications<|>Documents</);
  });

  it("offers a truthful route to allowance and payer details without inventing a Home metric", () => {
    const html = renderHome([]);

    expect(html).toContain("Current workspace");
    expect(html).toContain("Alder Workshop");
    expect(html).toContain("Work allowance");
    expect(html).toContain("Review allowance and payer details in Settings.");
    expect(html).toContain("Open Settings");
    expect(html).not.toContain("$0");
  });
});
