import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { managedSiteLinks, WorkspaceBusinessSettings } from "@/experience/workspace/WorkspaceBusinessSettings";
import { WebsiteAssignmentHandoff } from "@/experience/workspace/WorkspaceOfferings";

const site = { id: "website-a", title: "Harbor Dental", href: "/preview/strelva/website", productId: "managed_presence" as const, relationship: "client" as const };

function offeringState(canManage = true, mutationError?: string) {
  return {
    status: "ready" as const,
    saving: false,
    mutationError,
    collection: {
      businessId: "business-id",
      permissions: { canRead: true as const, canManage, role: canManage ? "owner" as const : "member" as const },
      definitions: [],
      installations: [],
      websiteBindings: [],
    },
  };
}

describe("workspace business settings destinations", () => {
  it("links each website setting to its workspace home, never to /dashboard/settings anchors (October 16)", () => {
    const links = managedSiteLinks({ ...site, href: "/client/gldf/dashboard", domain: "www.harbordental.com" }, "business-id");
    expect(links.map((link) => [link.label, link.href])).toEqual([
      ["Pages, photos and look", "/client/gldf/dashboard"],
      ["Connections", "/workspace?view=connections&workspaceId=business-id"],
      ["Web address: harbordental.com", "/workspace?view=help&workspaceId=business-id"],
    ]);
    for (const link of links) expect(link.href).not.toMatch(/\/dashboard\/settings/);
    const html = renderToStaticMarkup(createElement(WorkspaceBusinessSettings, { workspace: { id: "business-id", kind: "customer" as const, name: "Harbor Dental", access: "member" as const }, sites: [site], siteAssignmentState: "known", accountHref: "/workspace/account" }));
    expect(html).not.toContain("Website profile");
    expect(html).not.toContain("Subscription");
    expect(html).not.toContain("#domains");
  });

  it("drops an untrusted website link instead of rendering it", () => {
    expect(managedSiteLinks({ ...site, href: "javascript:alert(1)" }, "business-id").map((link) => link.id)).toEqual(["connections", "address"]);
  });

  it("does not report a confirmed empty assignment while access is loading or unavailable", () => {
    const props = {
      workspace: { id: "business-id", kind: "customer" as const, name: "Harbor Dental", access: "member" as const },
      sites: [],
      accountHref: "/workspace/account",
    };
    const loading = renderToStaticMarkup(createElement(WorkspaceBusinessSettings, { ...props, siteAssignmentState: "loading" }));
    expect(loading).toContain("Checking linked websites");
    expect(loading).not.toContain("No managed website is linked");

    const unavailable = renderToStaticMarkup(createElement(WorkspaceBusinessSettings, { ...props, siteAssignmentState: "unavailable" }));
    expect(unavailable).toContain("Linked website access is unavailable right now");
    expect(unavailable).not.toContain("No managed website is linked");

    const known = renderToStaticMarkup(createElement(WorkspaceBusinessSettings, { ...props, siteAssignmentState: "known" }));
    expect(known).toContain("No managed website is linked");
  });

  it("keeps business identity, people, work, and usage available without a website", () => {
    const markup = renderToStaticMarkup(createElement(WorkspaceBusinessSettings, {
      workspace: { id: "business-id", kind: "customer" as const, name: "Harbor Dental", access: "member" as const, role: "owner" as const },
      sites: [],
      siteAssignmentState: "known" as const,
      accountHref: "/workspace/account",
    }));
    expect(markup).toContain("Business information");
    expect(markup).toContain("People &amp; access");
    expect(markup).toContain("Work");
    expect(markup).toContain("Usage and limits");
    expect(markup).not.toContain(">Connections<");
    expect(markup).not.toContain(">Domains<");
    expect(markup).not.toContain(">Subscription<");
  });

  it("names the business and website in the direct assignment handoff", () => {
    const markup = renderToStaticMarkup(createElement(WorkspaceBusinessSettings, {
      workspace: { id: "business-id", kind: "customer" as const, name: "Harbor Dental", access: "member" as const, role: "owner" as const },
      sites: [],
      unassignedSites: [site],
      offerings: offeringState(),
      siteAssignmentState: "known" as const,
      onWebsiteCommand: async () => null,
      accountHref: "/workspace/account",
    }));
    expect(markup).toContain("Assign a website to Harbor Dental");
    expect(markup).toContain("Authorized for your account · not assigned to Harbor Dental");
    expect(markup).toContain('aria-label="Assign Harbor Dental to Harbor Dental"');
    expect(markup).toContain("Domains, connections, and billing stay in that website");
  });

  it("shows the assignment relationship to a member without offering a mutation", () => {
    const markup = renderToStaticMarkup(createElement(WebsiteAssignmentHandoff, {
      businessName: "Harbor Dental",
      state: offeringState(false),
      sites: [site],
      onCommand: async () => null,
    }));
    expect(markup).toContain("Only a business owner or admin can assign a website to Harbor Dental");
    expect(markup).not.toContain("Assign site to this business");
  });

  it("keeps unavailable and retry states visible", () => {
    const unavailableState = renderToStaticMarkup(createElement(WebsiteAssignmentHandoff, {
      businessName: "Harbor Dental",
      state: { status: "unavailable" as const, reason: "The current workspace cannot manage business offerings." },
      sites: [site],
      onRetry: () => undefined,
    }));
    expect(unavailableState).toContain("Website assignment is unavailable for Harbor Dental");
    expect(unavailableState).toContain("Try again");

    const unavailable = renderToStaticMarkup(createElement(WebsiteAssignmentHandoff, {
      businessName: "Harbor Dental",
      state: { status: "error" as const, message: "The assignment source is unavailable." },
      sites: [site],
      onRetry: () => undefined,
    }));
    expect(unavailable).toContain("Website assignment could not be checked for Harbor Dental");
    expect(unavailable).toContain("Try again");

    const retry = renderToStaticMarkup(createElement(WebsiteAssignmentHandoff, {
      businessName: "Harbor Dental",
      state: offeringState(true, "The website assignment could not be saved."),
      sites: [site],
      onCommand: async () => null,
    }));
    expect(retry).toContain("Retry the same assignment after checking the current state.");
  });
});


describe("export label matches available data", () => {
  it.each([false, true])("schema-3 archive available: %s", exportSchema3 => {
    const html = renderToStaticMarkup(createElement(WorkspaceBusinessSettings, { workspace: { id: "business-id", kind: "customer", access: "member", name: "Juniper" }, sites: [], siteAssignmentState: "known", accountHref: "/workspace/account", exportSchema3 }));
    expect(html).toContain(exportSchema3 ? "Export workspace archive" : "Export available workspace snapshot");
    expect(html).not.toContain("Export all workspace data");
  });
});


describe("owner plan and exit destinations", () => {
  it.each([false, true])("only links the available billing route: %s", businessBillingReleased => {
    const html = renderToStaticMarkup(createElement(WorkspaceBusinessSettings, { workspace: { id: "business-id", kind: "customer", access: "member", role: "owner", name: "Juniper" }, sites: [], siteAssignmentState: "known", accountHref: "/workspace/account", businessBillingReleased }));
    expect(html.includes('/workspace/billing?workspaceId=business-id')).toBe(businessBillingReleased);
    if (!businessBillingReleased) expect(html).toContain("No plan price is published yet");
    expect(html).toContain('/workspace/export?workspaceId=business-id');
    expect(html).toContain('/workspace/exit?workspaceId=business-id');
  });
  it("does not offer an owner exit action to a read-only visitor", () => {
    const html = renderToStaticMarkup(createElement(WorkspaceBusinessSettings, { workspace: { id: "business-id", kind: "customer", access: "provider_seat", name: "Juniper" }, sites: [], siteAssignmentState: "known", accountHref: "/workspace/account", businessBillingReleased: true }));
    expect(html).not.toContain('/workspace/billing?workspaceId=business-id');
    expect(html).not.toContain('/workspace/exit?workspaceId=business-id');
  });
});
