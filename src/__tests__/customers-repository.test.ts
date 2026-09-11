import { beforeEach, describe, expect, it } from "vitest";
import {
  customerFixture,
  customerFixtureAssignments,
  customerFixtureMemberships,
  customerFixtureRelationships,
  customerFixtureResources,
} from "@/platform/customers/fixtures";
import {
  CustomerAccessError,
  CustomerScopeChangedError,
  CustomerUnavailableError,
} from "@/platform/customers";
import { createCustomerService } from "@/platform/customers/repository";
import type {
  CustomerActor,
  CustomerAssignmentRecord,
  CustomerMappingStore,
  CustomerOrganizationMembership,
  CustomerRelationshipRecord,
  CustomerResourceReaders,
  CustomerResourceRecord,
} from "@/platform/customers";

const operators = {
  northstarAssigned: customerFixture.actors.northstarAssigned,
  northstarUnassigned: customerFixture.actors.northstarUnassigned,
  lakeshoreAssigned: customerFixture.actors.lakeshoreAssigned,
  directBrokerage: customerFixture.actors.directBrokerage,
  revoked: customerFixture.actors.revoked,
} satisfies Record<string, CustomerActor>;

const membershipByUser: Record<string, CustomerOrganizationMembership> = {
  [operators.northstarAssigned.userId]: customerFixtureMemberships[0]!,
  [operators.northstarUnassigned.userId]: customerFixtureMemberships[0]!,
  [operators.lakeshoreAssigned.userId]: customerFixtureMemberships[1]!,
  [operators.directBrokerage.userId]: customerFixtureMemberships[2]!,
  [operators.revoked.userId]: customerFixtureMemberships[0]!,
};

class FixtureStore implements CustomerMappingStore {
  relationships = customerFixtureRelationships.map((item) => ({ ...item }));
  resources = customerFixtureResources.map((item) => ({ ...item }));
  assignments = customerFixtureAssignments.map((item) => ({ ...item }));
  calls: string[] = [];
  revokeOnNextRead = false;
  revokeRelationshipOnNextRead = false;

  async verifyActor(actor: CustomerActor): Promise<boolean> {
    this.calls.push("verify");
    return Object.values(operators).some(
      (candidate) => candidate.userId === actor.userId && candidate.verifiedEmail === actor.verifiedEmail,
    );
  }

  async getOrganizationMembership(userId: string, organizationId: string) {
    this.calls.push("membership");
    const membership = membershipByUser[userId];
    return membership?.organizationId === organizationId ? membership : null;
  }

  async listAssignments(userId: string, organizationId: string): Promise<CustomerAssignmentRecord[]> {
    this.calls.push("assignments");
    if (this.revokeOnNextRead) {
      this.revokeOnNextRead = false;
      this.assignments = this.assignments.map((assignment) =>
        assignment.userId === userId && assignment.organizationId === organizationId
          ? { ...assignment, status: "revoked", revokedBy: "90000000-0000-4000-8000-000000000001", revokedAt: "2026-09-08T13:00:00.000Z", version: assignment.version + 1 }
          : assignment,
      );
    }
    return this.assignments.filter(
      (assignment) => assignment.userId === userId && assignment.organizationId === organizationId,
    );
  }

  async listRelationships(organizationId: string, ids: string[]): Promise<CustomerRelationshipRecord[]> {
    this.calls.push("relationships");
    return this.relationships.filter(
      (relationship) => relationship.organizationId === organizationId && ids.includes(relationship.id),
    );
  }

  async getRelationship(organizationId: string, id: string): Promise<CustomerRelationshipRecord | null> {
    this.calls.push("relationship");
    if (this.revokeRelationshipOnNextRead) {
      this.revokeRelationshipOnNextRead = false;
      this.relationships = this.relationships.map((relationship) =>
        relationship.id === id
          ? { ...relationship, status: "revoked", revokedBy: "90000000-0000-4000-8000-000000000001", revokedAt: "2026-09-08T13:00:00.000Z", version: relationship.version + 1, updatedAt: "2026-09-08T13:00:00.000Z" }
          : relationship,
      );
    }
    return this.relationships.find(
      (relationship) => relationship.organizationId === organizationId && relationship.id === id,
    ) || null;
  }

  async listResources(
    organizationId: string,
    relationshipId: string,
    ids: string[],
  ): Promise<CustomerResourceRecord[]> {
    this.calls.push("resources");
    const relationship = this.relationships.find(
      (candidate) => candidate.organizationId === organizationId && candidate.id === relationshipId,
    );
    return relationship
      ? this.resources.filter((resource) => resource.relationshipId === relationshipId && ids.includes(resource.id))
      : [];
  }
}

const readers: CustomerResourceReaders = {
  website: async ({ resource }) => ({
    availability: "available",
    observedAt: "2026-09-08T14:00:00.000Z",
    href: `https://app.strelva.com/client/${resource.resourceReference}/dashboard`,
  }),
  home_finder_installation: async ({ resource }) => ({
    availability: resource.resourceReference === "installation-fixture-2" ? "unavailable" : "not_configured",
    observedAt: "2026-09-08T14:01:00.000Z",
  }),
};

function service(store: FixtureStore, resourceReaders: CustomerResourceReaders = readers) {
  return createCustomerService(store, resourceReaders, "fixture-cursor-secret");
}

beforeEach(() => {
  // Fixtures are copied in each test; this hook exists as a visible reminder
  // that the scenarios are synthetic and must not share mutable state.
});

describe("IMP-05 Customers scoped repository", () => {
  it("authorizes membership before enumerating explicitly assigned customers", async () => {
    const store = new FixtureStore();
    const result = await service(store).listCustomers(
      operators.northstarAssigned,
      customerFixture.organizations.northstar,
    );

    expect(store.calls.slice(0, 3)).toEqual(["verify", "membership", "assignments"]);
    expect(result.customers.map((customer) => customer.id)).toEqual([
      customerFixtureRelationships[0]!.id,
    ]);
    expect(result).not.toHaveProperty("count");
    expect(result).not.toHaveProperty("total");
  });

  it("does not turn owner/admin titles into blanket customer grants", async () => {
    const store = new FixtureStore();
    const ownerWithNoAssignment = operators.northstarUnassigned;
    membershipByUser[ownerWithNoAssignment.userId] = {
      organizationId: customerFixture.organizations.northstar,
      role: "owner",
      workspaceKind: "agency",
    };
    const result = await service(store).listCustomers(ownerWithNoAssignment, customerFixture.organizations.northstar);
    expect(result.customers).toEqual([]);
  });

  it("supports a direct brokerage/customer context only through an explicit mapping", async () => {
    const store = new FixtureStore();
    const result = await service(store).listCustomers(
      operators.directBrokerage,
      customerFixture.organizations.directBrokerage,
    );
    expect(result.customers).toMatchObject([
      { id: customerFixtureRelationships[3]!.id, displayName: "Alder & Pine Realty" },
    ]);
    expect(result.customers[0]!.id).not.toBe(customerFixtureRelationships[0]!.id);
  });

  it("keeps a direct brokerage Home Finder installation explicit and readable", async () => {
    const store = new FixtureStore();
    const result = await service(store, {
      ...readers,
      home_finder_installation: async ({ resource }) => ({
        availability: resource.resourceReference === "installation-fixture-direct"
          ? "available"
          : "not_configured",
        observedAt: "2026-09-08T14:01:00.000Z",
      }),
    }).readCustomer(
      operators.directBrokerage,
      customerFixture.organizations.directBrokerage,
      customerFixtureRelationships[3]!.id,
    );
    expect(result.resources).toMatchObject([
      { id: customerFixtureResources[5]!.id, kind: "website", availability: "available" },
      { id: customerFixtureResources[6]!.id, kind: "home_finder_installation", availability: "available" },
    ]);
  });

  it("bounds search to authorized rows and returns a real empty no-match result", async () => {
    const store = new FixtureStore();
    const result = await service(store).listCustomers(
      operators.northstarAssigned,
      customerFixture.organizations.northstar,
      { query: "does-not-exist" },
    );
    expect(result).toEqual({
      organizationId: customerFixture.organizations.northstar,
      customers: [],
    });
  });

  it("uses a scope-bound stable cursor and rejects a cursor from another actor/query", async () => {
    const store = new FixtureStore();
    // Add a second explicitly assigned relationship to make pagination visible.
    store.assignments.push({
      ...customerFixtureAssignments[1]!,
      id: "50000000-0000-4000-8000-000000000007",
      relationshipId: customerFixtureRelationships[1]!.id,
      resourceId: customerFixtureResources[2]!.id,
    });
    const first = await service(store).listCustomers(
      operators.northstarAssigned,
      customerFixture.organizations.northstar,
      { limit: 1 },
    );
    expect(first.customers).toHaveLength(1);
    expect(first.nextCursor).toBeTruthy();
    const second = await service(store).listCustomers(
      operators.northstarAssigned,
      customerFixture.organizations.northstar,
      { limit: 1, cursor: first.nextCursor },
    );
    expect(second.customers).toHaveLength(1);
    await expect(service(store).listCustomers(
      operators.lakeshoreAssigned,
      customerFixture.organizations.northstar,
      { cursor: first.nextCursor },
    )).rejects.toBeInstanceOf(CustomerAccessError);
    await expect(service(store).listCustomers(
      operators.northstarAssigned,
      customerFixture.organizations.northstar,
      { query: "different", cursor: first.nextCursor },
    )).rejects.toThrow();
  });

  it("returns only assigned resources, strips provider references, and keeps source failures distinct", async () => {
    const store = new FixtureStore();
    const result = await service(store).readCustomer(
      operators.northstarAssigned,
      customerFixture.organizations.northstar,
      customerFixtureRelationships[0]!.id,
    );
    expect(result.resources).toMatchObject([
      { id: customerFixtureResources[0]!.id, kind: "website", availability: "available" },
      { id: customerFixtureResources[1]!.id, kind: "home_finder_installation", availability: "not_configured" },
    ]);
    expect(JSON.stringify(result)).not.toContain("resourceReference");
    expect(JSON.stringify(result)).not.toContain("installation-fixture-1");
    expect(result).not.toHaveProperty("payer");
    expect(result).not.toHaveProperty("service");
  });

  it("requires installation:read in addition to resource:read", async () => {
    const store = new FixtureStore();
    store.assignments = store.assignments.map((assignment) =>
      assignment.resourceId === customerFixtureResources[1]!.id
        ? { ...assignment, allowedOperations: ["customer:read", "resource:read"] as const }
        : assignment,
    );
    const homeFinderRead = { calls: 0 };
    const result = await service(store, {
      home_finder_installation: async () => {
        homeFinderRead.calls += 1;
        return { availability: "available" };
      },
    }).readCustomer(operators.northstarAssigned, customerFixture.organizations.northstar, customerFixtureRelationships[0]!.id);
    expect(homeFinderRead.calls).toBe(0);
    expect(result.resources.map((resource) => resource.id)).toEqual([customerFixtureResources[0]!.id]);
  });

  it("fails closed for revoked assignments and unavailable customer mappings", async () => {
    const store = new FixtureStore();
    store.assignments = store.assignments.map((assignment) =>
      assignment.userId === operators.northstarAssigned.userId
        ? { ...assignment, status: "revoked", revokedBy: "90000000-0000-4000-8000-000000000001", revokedAt: "2026-09-08T13:00:00.000Z" }
        : assignment,
    );
    await expect(service(store).readCustomer(
      operators.northstarAssigned,
      customerFixture.organizations.northstar,
      customerFixtureRelationships[0]!.id,
    )).rejects.toBeInstanceOf(CustomerUnavailableError);
  });

  it("rechecks scope after slow resource reads and never returns stale data", async () => {
    const store = new FixtureStore();
    const slowReaders: CustomerResourceReaders = {
      website: async () => {
        // Revoke only after the initial authorization has completed, while a
        // product adapter is still in flight.
        store.revokeOnNextRead = true;
        return { availability: "available" };
      },
    };
    await expect(service(store, slowReaders).readCustomer(
      operators.northstarAssigned,
      customerFixture.organizations.northstar,
      customerFixtureRelationships[0]!.id,
    )).rejects.toBeInstanceOf(CustomerScopeChangedError);
  });

  it("does not merge same-name/domain relationships across agencies", async () => {
    const store = new FixtureStore();
    const result = await service(store).listCustomers(
      operators.lakeshoreAssigned,
      customerFixture.organizations.lakeshore,
    );
    expect(result.customers).toMatchObject([{ id: customerFixtureRelationships[2]!.id, domain: "cedarlane.example" }]);
    expect(result.customers.some((customer) => customer.id === customerFixtureRelationships[0]!.id)).toBe(false);
  });
});
