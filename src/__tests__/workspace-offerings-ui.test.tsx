import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { OfferingCollection } from "@/platform/offerings";
import {
  BusinessOfferingSummary,
  WorkspaceOfferingDirectory,
  boundManagedWebsiteIds,
  boundOfferingResourceIds,
  type WorkspaceOfferingState,
} from "@/experience/workspace/WorkspaceOfferings";
import type { WorkspaceWork } from "@/experience/workspace/contracts";

const businessId = "11111111-1111-4111-8111-111111111111";
const applicationId = "22222222-2222-4222-8222-222222222222";
const installationId = "33333333-3333-4333-8333-333333333333";

const definition = {
  id: "private_staff_requests",
  version: "1.0.0",
  name: "Staff request application",
  description: "Collect staff requests in a released private application.",
  availability: "local" as const,
  installability: "available" as const,
  installationNote: "Installation keeps publishing explicit.",
  requiredResources: [{ kind: "application" as const, minimum: 1, maximum: 1, description: "A released application." }],
  scopes: [{ id: "submit_requests", label: "Submit requests", description: "Add request records.", required: true }],
  surfaces: [{ id: "staff_app", label: "Staff application", description: "The staff form.", href: null, required: true }],
  configurationFields: [{ id: "displayName", label: "Display name", kind: "short_text" as const, required: false, maximumLength: 80 }],
};

const collection: OfferingCollection = {
  businessId,
  permissions: { canRead: true, canManage: true, role: "owner" },
  definitions: [definition],
  installations: [],
  websiteBindings: [],
};

const work: WorkspaceWork = {
  id: applicationId,
  workspaceId: businessId,
  title: "Staff requests",
  productId: "applications",
  resourceKind: "application",
  payload: null,
  input: {},
  createdAt: "2026-09-15T12:00:00.000Z",
};

function renderDirectory(state: WorkspaceOfferingState, selectedId: string | null): string {
  return renderToStaticMarkup(createElement(WorkspaceOfferingDirectory, {
    state,
    businessName: "Harbor Dental",
    work: [work],
    managedSites: [],
    selectedId,
    onSelect: () => undefined,
    onRetry: () => undefined,
    onCommand: async () => null,
    onWebsiteCommand: async () => null,
  }));
}

describe("workspace offering experience", () => {
  it("keeps scoped work sharing from implying business-wide offering access", () => {
    const html = renderDirectory({ status: "unavailable", reason: "This work-share does not include business-wide offering access." }, null);
    expect(html).toContain("Offerings belong to a business.");
    expect(html).toContain("does not include business-wide offering access");
  });

  it("shows local availability without claiming an installation or provider", () => {
    const html = renderDirectory({ status: "ready", collection, saving: false }, null);
    expect(html).toContain("Staff request application");
    expect(html).toContain("Local release");
    expect(html).toContain("Availability does not grant access or promise a provider.");
    expect(html).not.toContain("Installed for this business");
  });

  it("makes provider responsibility a request instead of an accepted commitment", () => {
    const html = renderDirectory({ status: "ready", collection, saving: false }, definition.id);
    expect(html).toContain("Your business operates it");
    expect(html).toContain("Request a provider");
    expect(html).toContain("does not confirm Strelva or a third party accepted the work");
  });

  it("requires an explicit publish confirmation before a draft offering can activate", () => {
    const draft: OfferingCollection = {
      ...collection,
      installations: [{
        id: installationId,
        businessId,
        definitionId: definition.id,
        definitionVersion: definition.version,
        status: "draft",
        revision: 1,
        configuration: {},
        nativeResources: [{ kind: "application", id: applicationId }],
        responsibility: { kind: "customer_operated", providerName: "Harbor Dental" },
        acceptedScope: ["submit_requests"],
        surfaces: [],
        installedBy: "owner",
        installedAt: "2026-09-15T12:00:00.000Z",
        updatedBy: "owner",
        updatedAt: "2026-09-15T12:00:00.000Z",
      }],
    };
    const state: WorkspaceOfferingState = { status: "ready", collection: draft, saving: false };
    const html = renderDirectory(state, installationId);
    expect(html).toContain("I published the connected application through its review.");
    expect(html).toContain("disabled=\"\"");
    expect([...boundOfferingResourceIds(state)]).toEqual([applicationId]);
  });

  it("mounts the provider lifecycle inside the installed offering", () => {
    const installed: OfferingCollection = {
      ...collection,
      installations: [{
        id: installationId, businessId, definitionId: definition.id, definitionVersion: definition.version,
        status: "active", revision: 2, configuration: {}, nativeResources: [{ kind: "application", id: applicationId }],
        responsibility: { kind: "provider_requested", providerKind: "strelva", providerName: "Strelva", requestNote: "Set up the approved workflow." },
        acceptedScope: ["submit_requests"], surfaces: [], installedBy: "owner", installedAt: "2026-09-15T12:00:00.000Z",
        updatedBy: "owner", updatedAt: "2026-09-15T12:00:00.000Z",
      }],
    };
    const html = renderDirectory({ status: "ready", collection: installed, saving: false }, installationId);
    expect(html).toContain("Strelva has been requested as the provider");
    expect(html).toContain("Checking provider delivery");
  });

  it("groups only active, explicitly bound managed websites into the business", () => {
    const installed: OfferingCollection = {
      ...collection,
      installations: [{
        id: installationId,
        businessId,
        definitionId: definition.id,
        definitionVersion: definition.version,
        status: "active",
        revision: 1,
        configuration: {},
        nativeResources: [{ kind: "managed_website", id: "77777777-7777-4777-8777-777777777777" }],
        responsibility: { kind: "customer_operated", providerName: "Harbor Dental" },
        acceptedScope: ["submit_requests"],
        surfaces: [],
        installedBy: "owner",
        installedAt: "2026-09-15T12:00:00.000Z",
        updatedBy: "owner",
        updatedAt: "2026-09-15T12:00:00.000Z",
      }],
      websiteBindings: [{
        id: "77777777-7777-4777-8777-777777777777",
        businessId,
        status: "active",
        revision: 1,
        tenantId: "bound-site",
        siteName: "Bound site",
        tenantActive: true,
        canOpen: true,
        surface: { id: "managed_website", label: "Bound site", description: "Management", href: "/client/bound-site" },
        createdBy: "owner",
        createdAt: "2026-09-15T12:00:00.000Z",
        updatedBy: "owner",
        updatedAt: "2026-09-15T12:00:00.000Z",
      }],
    };
    const state: WorkspaceOfferingState = { status: "ready", collection: installed, saving: false };
    expect([...boundManagedWebsiteIds(state)]).toEqual(["bound-site"]);
    const html = renderToStaticMarkup(createElement(BusinessOfferingSummary, { state, work: [], onOpen: () => undefined }));
    expect(html).toContain("Business offerings");
    expect(html).toContain("managed website");
  });
});
