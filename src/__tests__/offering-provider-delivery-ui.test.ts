import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkspaceOfferingDirectory } from "@/experience/workspace/WorkspaceOfferings";
import type { OfferingCollection } from "@/platform/offerings";

describe("provider delivery offering UI", () => {
  it("places the provider lifecycle in the installed offering without claiming acceptance", () => {
    const businessId = "11111111-1111-4111-8111-111111111111";
    const installationId = "22222222-2222-4222-8222-222222222222";
    const collection: OfferingCollection = {
      businessId, permissions: { canRead: true, canManage: true, role: "owner" }, websiteBindings: [],
      definitions: [{
        id: "private_staff_requests", version: "1.0.0", name: "Staff requests", description: "One operating workflow.",
        availability: "local", installability: "available", installationNote: "", requiredResources: [], scopes: [], surfaces: [], configurationFields: [],
      }],
      installations: [{
        id: installationId, businessId, definitionId: "private_staff_requests", definitionVersion: "1.0.0", status: "active", revision: 2,
        configuration: {}, nativeResources: [{ kind: "application", id: "33333333-3333-4333-8333-333333333333" }],
        responsibility: { kind: "provider_requested", providerKind: "strelva", providerName: "Strelva", requestNote: "Set up the approved workflow." },
        acceptedScope: ["submit_requests"], surfaces: [], installedBy: "owner", installedAt: "2026-09-18T12:00:00.000Z",
        updatedBy: "owner", updatedAt: "2026-09-18T12:00:00.000Z",
      }],
    };
    const html = renderToStaticMarkup(createElement(WorkspaceOfferingDirectory, {
      state: { status: "ready", collection, saving: false }, businessName: "Harbor Dental", work: [], managedSites: [], selectedId: installationId,
      onSelect: () => undefined, onRetry: () => undefined, onCommand: async () => null, onWebsiteCommand: async () => null,
    }));
    expect(html).toContain("Strelva has been requested as the provider");
    expect(html).toContain("Checking provider delivery");
    expect(html).not.toContain("Accepted by the exact assigned Strelva operator");
  });
});
