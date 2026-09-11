import { describe, expect, it, vi } from "vitest";
import {
  customerFixture,
  customerFixtureAssignments,
  customerFixtureHomeFinder,
  customerFixtureMemberships,
  customerFixtureRelationships,
  customerFixtureResources,
} from "@/platform/customers/fixtures";
import {
  CustomerSourceError,
  CustomerScopeChangedError,
  CustomerUnavailableError,
  createCustomerService,
  type CustomerActor,
  type CustomerAssignmentRecord,
  type CustomerMappingStore,
  type CustomerOrganizationMembership,
  type CustomerRelationshipRecord,
  type CustomerResourceReaders,
  type CustomerResourceRecord,
} from "@/platform/customers";
import type { HomeFinderServerAdapter } from "@/products/home-finder/server-adapter";

const actor = customerFixture.actors.northstarAssigned satisfies CustomerActor;
const organizationId = customerFixture.organizations.northstar;
const customerId = customerFixtureRelationships[0]!.id;
const resourceId = customerFixtureResources[1]!.id;
const installationId = customerFixtureResources[1]!.resourceReference;
const reviewer = "90000000-0000-4000-8000-000000000001";
const summary = customerFixtureHomeFinder.summary;
const observedAt = summary.observedAt;

class InstallationStore implements CustomerMappingStore {
  assignments = customerFixtureAssignments.map((value) => ({ ...value }));
  relationships = customerFixtureRelationships.map((value) => ({ ...value }));
  resources = customerFixtureResources.map((value) => ({ ...value }));
  assignmentReads = 0;
  revokeAfterAdapter = false;

  async verifyActor(value: CustomerActor): Promise<boolean> {
    return value.userId === actor.userId && value.verifiedEmail === actor.verifiedEmail;
  }

  async getOrganizationMembership(userId: string, scope: string): Promise<CustomerOrganizationMembership | null> {
    const index = userId === actor.userId ? 0 : -1;
    const membership = index >= 0 ? customerFixtureMemberships[index] : undefined;
    return membership?.organizationId === scope ? membership : null;
  }

  async listAssignments(userId: string, scope: string): Promise<CustomerAssignmentRecord[]> {
    this.assignmentReads += 1;
    if (this.revokeAfterAdapter && this.assignmentReads === 2) {
      this.assignments = this.assignments.map((value) =>
        value.userId === userId && value.organizationId === scope && value.resourceId === resourceId
          ? {
              ...value,
              status: "revoked",
              revokedBy: reviewer,
              revokedAt: observedAt,
              updatedBy: reviewer,
              version: value.version + 1,
            }
          : value,
      );
    }
    return this.assignments.filter((value) => value.userId === userId && value.organizationId === scope);
  }

  async listRelationships(scope: string, ids: string[]): Promise<CustomerRelationshipRecord[]> {
    return this.relationships.filter((value) => value.organizationId === scope && ids.includes(value.id));
  }

  async getRelationship(scope: string, id: string): Promise<CustomerRelationshipRecord | null> {
    return this.relationships.find((value) => value.organizationId === scope && value.id === id) ?? null;
  }

  async listResources(scope: string, relationship: string, ids: string[]): Promise<CustomerResourceRecord[]> {
    return this.resources.filter(
      (value) => value.relationshipId === relationship && ids.includes(value.id) &&
        value.relationshipId === customerId && scope === organizationId,
    );
  }
}

function adapter(overrides: Partial<HomeFinderServerAdapter> = {}): HomeFinderServerAdapter {
  return {
    readInstallationSummary: vi.fn().mockResolvedValue(summary),
    readReadiness: vi.fn().mockResolvedValue(customerFixtureHomeFinder.readiness),
    listDeliveryReceipts: vi.fn().mockResolvedValue(customerFixtureHomeFinder.receipts),
    readDeliveryReceipt: vi.fn().mockResolvedValue(customerFixtureHomeFinder.receipt),
    ...overrides,
  };
}

function service(store: InstallationStore, homeFinderAdapter: HomeFinderServerAdapter) {
  const readers: CustomerResourceReaders = {
    // The installation endpoint does not use generic resource readers, but an
    // explicit map makes this test's ownership boundary visible.
    home_finder_installation: async () => ({ availability: "available" }),
  };
  return createCustomerService(store, readers, "fixture-cursor-secret", homeFinderAdapter);
}

describe("IMP-05 scoped Home Finder installation reads", () => {
  it("resolves summary/readiness/receipts/detail through exact mapped scope", async () => {
    const homeFinder = adapter();
    const store = new InstallationStore();
    const customerService = service(store, homeFinder);

    await expect(customerService.readInstallation(actor, organizationId, customerId, resourceId)).resolves.toMatchObject({
      organizationId,
      customerId,
      resourceId,
      installation: { id: installationId },
    });
    await expect(customerService.readInstallation(actor, organizationId, customerId, resourceId, "readiness")).resolves.toMatchObject({
      installation: { installationId },
    });
    await expect(customerService.readInstallation(actor, organizationId, customerId, resourceId, "receipts", {
      cursor: "receipt-cursor",
      limit: 2,
    })).resolves.toMatchObject({
      installation: {
        installationId,
        items: [{ reference: customerFixtureHomeFinder.receipts.items[0]!.reference }],
      },
    });
    await expect(customerService.readInstallation(actor, organizationId, customerId, resourceId, "receipt", {
      reference: customerFixtureHomeFinder.receipt.reference,
    })).resolves.toMatchObject({
      installation: { installationId, reference: customerFixtureHomeFinder.receipt.reference },
    });

    expect(homeFinder.readInstallationSummary).toHaveBeenCalledWith({
      installationId,
      managementReads: ["readInstallationSummary"],
    });
    expect(homeFinder.readReadiness).toHaveBeenCalledWith({
      installationId,
      managementReads: ["readReadiness"],
    });
    expect(homeFinder.listDeliveryReceipts).toHaveBeenCalledWith(
      { installationId, managementReads: ["listDeliveryReceipts"] },
      { cursor: "receipt-cursor", limit: 2 },
    );
    expect(homeFinder.readDeliveryReceipt).toHaveBeenCalledWith(
      { installationId, managementReads: ["readDeliveryReceipt"] },
      customerFixtureHomeFinder.receipt.reference,
    );
  });

  it("requires the separate installation permission before invoking IDX", async () => {
    const homeFinder = adapter();
    const store = new InstallationStore();
    store.assignments = store.assignments.map((value) =>
      value.resourceId === resourceId
        ? { ...value, allowedOperations: ["customer:read", "resource:read"] as const }
        : value,
    );

    await expect(service(store, homeFinder).readInstallation(actor, organizationId, customerId, resourceId))
      .rejects.toBeInstanceOf(CustomerUnavailableError);
    expect(homeFinder.readInstallationSummary).not.toHaveBeenCalled();
  });

  it("fails closed for a source mismatch or a revoked scope after the read", async () => {
    const mismatched = adapter({
      readInstallationSummary: vi.fn().mockResolvedValue({ ...summary, id: "another-installation" }),
    });
    await expect(service(new InstallationStore(), mismatched).readInstallation(actor, organizationId, customerId, resourceId))
      .rejects.toBeInstanceOf(CustomerSourceError);

    const store = new InstallationStore();
    store.revokeAfterAdapter = true;
    await expect(service(store, adapter()).readInstallation(actor, organizationId, customerId, resourceId))
      .rejects.toBeInstanceOf(CustomerScopeChangedError);
  });
});
