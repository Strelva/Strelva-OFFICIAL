import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { managedSettingsHref, WorkspaceBusinessSettings } from "@/experience/workspace/WorkspaceBusinessSettings";
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
  it("links an authorized managed-site dashboard to its native tenant-scoped settings", () => {
    const dashboard = "https://app.strelva.com/client/gldf/dashboard";
    expect(managedSettingsHref(dashboard, "business")).toBe("https://app.strelva.com/client/gldf/dashboard/settings#profile");
    expect(managedSettingsHref(dashboard, "connections")).toBe("https://app.strelva.com/client/gldf/dashboard/integrations");
    expect(managedSettingsHref(dashboard, "domains")).toBe("https://app.strelva.com/client/gldf/dashboard/settings#domains");
    expect(managedSettingsHref(dashboard, "subscription")).toBe("https://app.strelva.com/client/gldf/dashboard/settings#plan");
  });

  it("supports native app tenant paths and the gated local preview without changing authorization", () => {
    expect(managedSettingsHref("/app/tenant-id/dashboard", "business")).toBe("/app/tenant-id/dashboard/settings#profile");
    expect(managedSettingsHref("/app/tenant-id/dashboard", "connections")).toBe("/app/tenant-id/dashboard/integrations");
    expect(managedSettingsHref("/preview/strelva/website", "domains")).toBe("/preview/strelva/website/dashboard/settings#domains");
  });

  it("rejects untrusted and non-dashboard destinations", () => {
    expect(managedSettingsHref("https://evil.example/client/gldf/dashboard", "business")).toBeNull();
    expect(managedSettingsHref("https://app.strelva.com/admin", "domains")).toBeNull();
    expect(managedSettingsHref("javascript:alert(1)", "connections")).toBeNull();
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
    expect(markup).toContain("People and access");
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
