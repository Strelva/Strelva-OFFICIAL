// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import type { OfferingCollection } from "@/platform/offerings";
import {
  BusinessOfferingSummary,
  WorkspaceOfferingDirectory,
  boundManagedWebsiteIds,
  boundOfferingResourceIds,
  type PresentedProviderDelivery,
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

function renderDirectory(state: WorkspaceOfferingState, selectedId: string | null, availableWork: WorkspaceWork[] = [work]): string {
  return renderToStaticMarkup(createElement(WorkspaceOfferingDirectory, {
    state,
    businessName: "Harbor Dental",
    work: availableWork,
    managedSites: [],
    selectedId,
    onSelect: () => undefined,
    onOpenWork: () => undefined,
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

  it("keeps native product discovery visible when business offerings are unavailable", () => {
    const html = renderToStaticMarkup(createElement(WorkspaceOfferingDirectory, {
      state: { status: "unavailable", reason: "This work-share does not include business-wide offering access." },
      businessName: "Harbor Dental",
      work: [],
      managedSites: [],
      products: [{ id: "documents", name: "Documents", description: "Write useful documents.", availability: "available" }],
      selectedId: null,
      onSelect: () => undefined,
      onOpenWork: () => undefined,
      onOpenProduct: () => undefined,
      onRetry: () => undefined,
      onCommand: async () => null,
      onWebsiteCommand: async () => null,
    }));
    expect(html).toContain("Useful outcomes for this workspace.");
    expect(html).toContain("Documents");
    expect(html).toContain("This work-share does not include business-wide offering access.");
  });

  it("sends gated product setup requests through the durable parent request seam", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    let requested: string | undefined;
    act(() => root.render(createElement(WorkspaceOfferingDirectory, {
      state: { status: "unavailable", reason: "Business offering access is unavailable." },
      businessName: "Harbor Dental",
      work: [],
      managedSites: [],
      products: [{ id: "managed_presence", name: "Managed Websites", description: "A managed website.", availability: "managed" }],
      selectedId: null,
      onSelect: () => undefined,
      onOpenWork: () => undefined,
      onOpenProduct: () => undefined,
      onRequestSetup: (entry) => { requested = entry.product?.id; },
      onRetry: () => undefined,
      onCommand: async () => null,
      onWebsiteCommand: async () => null,
    })));
    const requestButton = [...container.querySelectorAll("button")].find((button) => button.textContent === "Request setup");
    expect(requestButton).toBeTruthy();
    act(() => requestButton?.click());
    expect(requested).toBe("managed_presence");
    act(() => root.unmount());
    container.remove();
  });

  it("shows local availability without claiming an installation or provider", () => {
    const html = renderDirectory({ status: "ready", collection, saving: false }, null);
    expect(html).toContain("Staff request application");
    expect(html).toContain("Local release");
    expect(html).toContain("Availability does not grant access or promise a provider.");
    expect(html).not.toContain("Installed for this business");
  });

  it("renders products and concrete offerings in one outcome directory with honest next actions", () => {
    const html = renderToStaticMarkup(createElement(WorkspaceOfferingDirectory, {
      state: { status: "ready", collection, saving: false },
      businessName: "Harbor Dental",
      work: [work],
      managedSites: [],
      products: [
        { id: "applications", name: "Applications", description: "Build a small workflow.", availability: "available" },
        { id: "managed_presence", name: "Managed Websites", description: "Your managed website.", availability: "managed" },
        { id: "documents", name: "Documents", description: "Write useful documents.", availability: "available" },
      ],
      selectedId: null,
      onSelect: () => undefined,
      onOpenWork: () => undefined,
      onOpenProduct: () => undefined,
      onRequestSetup: () => undefined,
      onRetry: () => undefined,
      onCommand: async () => null,
      onWebsiteCommand: async () => null,
    }));
    expect(html).toContain("Useful outcomes for this business.");
    expect(html).toContain("Applications");
    expect(html).toContain("Staff request application");
    expect(html).toContain("Start setup");
    expect(html).toContain("Managed Websites");
    expect(html).toContain("Request setup");
    expect(html).toContain("Documents");
  });

  it("starts with customer operation and offers an explicit provider request", () => {
    const html = renderDirectory({ status: "ready", collection, saving: false }, definition.id);
    expect(html).toContain("Your business operates it");
    expect(html).toContain("Request a provider");
    expect(html).toContain('name="responsibility" checked=""');
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
    expect(html).toContain("Open Staff requests");
    expect(html).not.toContain(`<span>${applicationId}</span>`);
    expect(html).toContain("I published the connected application through its review.");
    expect(html).toContain("disabled=\"\"");
    expect([...boundOfferingResourceIds(state)]).toEqual([applicationId]);
    const unavailable = renderDirectory(state, installationId, []);
    expect(unavailable).toContain("Connected work unavailable");
    expect(unavailable).not.toContain("Open Staff requests");
    const wrongBusiness = renderDirectory(state, installationId, [{ ...work, workspaceId: "other-business" }]);
    expect(wrongBusiness).not.toContain("Open Staff requests");
    const inaccessible = renderDirectory(state, installationId, [{ ...work, unavailableReason: "Access is no longer available." }]);
    expect(inaccessible).toContain("Access is no longer available.");
    expect(inaccessible).not.toContain("Open Staff requests");
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

  it("shows the refreshed revision for review while retaining the editor's draft", () => {
    const installed: OfferingCollection = {
      ...collection,
      installations: [{
        id: installationId, businessId, definitionId: definition.id, definitionVersion: definition.version,
        status: "active", revision: 2, configuration: { displayName: "Saved by editor A" }, nativeResources: [{ kind: "application", id: applicationId }],
        responsibility: { kind: "customer_operated", providerName: "Harbor Dental" }, acceptedScope: ["submit_requests"], surfaces: [], installedBy: "owner", installedAt: "2026-09-15T12:00:00.000Z", updatedBy: "editor-a", updatedAt: "2026-09-15T12:01:00.000Z",
      }],
    };
    const html = renderDirectory({
      status: "ready",
      collection: installed,
      saving: false,
      mutationConflict: {
        kind: "installation",
        id: installationId,
        attemptedRevision: 1,
        authoritativeRevision: 2,
        message: "This offering changed while you were editing.",
      },
    }, installationId);
    expect(html).toContain("This offering changed while you were editing.");
    expect(html).toContain("revision 2");
    expect(html).toContain("Review the current version, then save your draft to retry");
    expect(html).toContain("Latest saved: Saved by editor A");
    expect(html).toContain("Your draft: Saved by editor A");
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

  it("shows provider delivery and customer decision from the business delivery list", () => {
    const providerInstallation: OfferingCollection["installations"][number] = {
      id: installationId,
      businessId,
      definitionId: definition.id,
      definitionVersion: definition.version,
      status: "active",
      revision: 2,
      configuration: {},
      nativeResources: [{ kind: "application", id: applicationId }],
      responsibility: { kind: "provider_requested", providerKind: "strelva", providerName: "Strelva" },
      acceptedScope: ["submit_requests"],
      surfaces: [],
      installedBy: "owner",
      installedAt: "2026-09-15T12:00:00.000Z",
      updatedBy: "owner",
      updatedAt: "2026-09-15T12:00:00.000Z",
    };
    const baseDelivery: PresentedProviderDelivery = {
      id: "88888888-8888-4888-8888-888888888888",
      businessId,
      installationId,
      assignmentId: "99999999-9999-4999-8999-999999999999",
      status: "requested",
      customerDecision: "pending",
      revision: 1,
      scope: ["submit_requests"],
      requestedBy: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      requestedAt: "2026-09-15T12:00:00.000Z",
      expiresAt: "2026-09-22T12:00:00.000Z",
      acceptedBy: null,
      acceptedAt: null,
      revokedBy: null,
      revokedAt: null,
      revocationReason: null,
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
      history: [],
      canManage: true,
      canAccept: false,
    };
    const providerCollection = { ...collection, installations: [providerInstallation] };
    const renderSummary = (delivery: PresentedProviderDelivery, status: "ready" | "error" = "ready") => renderToStaticMarkup(createElement(BusinessOfferingSummary, {
      state: { status: "ready", collection: providerCollection, saving: false },
      work: [],
      onOpen: () => undefined,
      providerDeliveryState: status === "ready" ? { status, deliveries: [delivery] } : { status, message: "Provider list unavailable" },
    }));

    expect(renderSummary(baseDelivery)).toContain("Provider requested · waiting for acceptance");
    expect(renderSummary(baseDelivery)).toContain("Customer decision: pending");
    expect(renderSummary({ ...baseDelivery, status: "accepted", customerDecision: "confirmed" })).toContain("Provider accepted");
    expect(renderSummary({ ...baseDelivery, status: "accepted", customerDecision: "confirmed" })).toContain("Customer decision: confirmed");
    expect(renderSummary({ ...baseDelivery, status: "revoked", customerDecision: "changes_requested" })).toContain("Provider delivery revoked");
    expect(renderSummary({ ...baseDelivery, status: "revoked", customerDecision: "changes_requested" })).toContain("Customer decision: changes requested");
    expect(renderSummary(baseDelivery, "error")).toContain("Acceptance cannot be inferred from the offering record.");
  });
});
