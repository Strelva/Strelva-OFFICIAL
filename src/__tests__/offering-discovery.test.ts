import { describe, expect, it } from "vitest";
import type { OfferingDefinitionView, OfferingInstallation } from "@/platform/offerings";
import type { WorkspaceProduct } from "@/experience/workspace/contracts";
import { composeOfferingDiscovery, discoveryActionForOffering, discoveryActionForProduct } from "@/experience/workspace/offering-discovery";

const offering: OfferingDefinitionView = {
  id: "managed_website_changes",
  version: "1.0.0",
  name: "Managed website changes",
  description: "Request changes to a website Strelva already manages.",
  availability: "existing_clients",
  installability: "available",
  installationNote: "Link an existing managed website first.",
  requiredResources: [],
  scopes: [],
  surfaces: [],
  configurationFields: [],
};

const product: WorkspaceProduct = {
  id: "managed_presence",
  name: "Managed Websites",
  description: "Your website and the work that keeps it useful.",
  availability: "managed",
};

function installation(status: OfferingInstallation["status"]): OfferingInstallation {
  return {
    id: "installation-1",
    businessId: "business-1",
    definitionId: offering.id,
    definitionVersion: offering.version,
    status,
    revision: 1,
    configuration: {},
    nativeResources: [],
    responsibility: { kind: "customer_operated", providerName: "Harbor Dental" },
    acceptedScope: [],
    surfaces: [],
    installedBy: "owner",
    installedAt: "2026-09-15T12:00:00.000Z",
    updatedBy: "owner",
    updatedAt: "2026-09-15T12:00:00.000Z",
  };
}

describe("workspace offering discovery", () => {
  it("uses Start for available work and Request setup for managed work", () => {
    expect(discoveryActionForOffering(offering)).toEqual({ kind: "start", label: "Start setup" });
    expect(discoveryActionForProduct(product)).toEqual({ kind: "request", label: "Request setup" });
  });

  it("merges the managed website product with its concrete offering without losing the outcome", () => {
    const entries = composeOfferingDiscovery({ products: [product], definitions: [offering], installations: [] });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ key: "managed_websites", title: offering.name, sourceIds: [product.id, offering.id] });
    expect(entries[0]?.action).toEqual({ kind: "start", label: "Start setup" });
    expect(entries[0]?.primaryTarget).toBe("offering");
    expect(entries[0]?.secondary).toMatchObject({ target: "product", action: { kind: "request", label: "Request setup" } });
  });

  it("keeps an available native product primary while exposing the offering setup as a secondary action", () => {
    const applications: WorkspaceProduct = { id: "applications", name: "Applications", description: "Build a workflow.", availability: "available" };
    const staffOffering: OfferingDefinitionView = { ...offering, id: "private_staff_requests", name: "Staff request application", description: "A private request form." };
    const entries = composeOfferingDiscovery({ products: [applications], definitions: [staffOffering], installations: [] });
    expect(entries[0]).toMatchObject({ title: "Applications", primaryTarget: "product", action: { kind: "start", label: "Start" } });
    expect(entries[0]?.secondary).toMatchObject({ target: "offering", title: "Staff request application", action: { kind: "start", label: "Start setup" } });
  });

  it("does not downgrade an available inquiry product because its business offering is release gated", () => {
    const inquiries: WorkspaceProduct = { id: "inquiries", name: "Inquiries", description: "Review customer requests.", availability: "available" };
    const gatedOffering: OfferingDefinitionView = { ...offering, id: "customer_inquiry_intake", name: "Customer inquiry intake", installability: "not_enabled", availability: "release_gated" };
    const entries = composeOfferingDiscovery({ products: [inquiries], definitions: [gatedOffering], installations: [] });
    expect(entries[0]?.action).toEqual({ kind: "start", label: "Start" });
    expect(entries[0]?.secondary).toMatchObject({ target: "offering", action: { kind: "request", label: "Request setup" } });
  });

  it("keeps every unrelated product and marks an installed offering as Open", () => {
    const products: WorkspaceProduct[] = [
      { id: "ai_visibility", name: "AI Visibility", description: "See what AI can understand.", availability: "available" },
      { id: "documents", name: "Documents", description: "Write useful documents.", availability: "available" },
      { id: "homefinder", name: "Home Finder", description: "Home search for a brokerage site.", availability: "not_enabled", previewHref: "/example" },
      { id: "tracker", name: "Spreadsheet tracker", description: "Turn a CSV into working data.", availability: "available" },
    ];
    const entries = composeOfferingDiscovery({ products, definitions: [offering], installations: [installation("active")] });
    expect(entries.map((entry) => entry.sourceIds)).toEqual(expect.arrayContaining(products.map((item) => [item.id])));
    expect(entries.find((entry) => entry.key === "managed_websites")?.action).toEqual({ kind: "open", label: "Open" });
    expect(entries.find((entry) => entry.key === "homefinder")?.action).toEqual({ kind: "explore", label: "Explore example" });
  });
});
