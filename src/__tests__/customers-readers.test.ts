import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HomeFinderServerAdapter } from "../products/home-finder/server-adapter";
import {
  createCustomerResourceReaders,
  createHomeFinderResourceReader,
  readAssessmentResource,
  readWebsiteResource,
} from "../platform/customers/readers";
import { CustomerService } from "../platform/customers/service";
import { CustomerUnavailableError } from "../platform/customers/errors";
import type { CustomerMappingStore } from "../platform/customers/store";
import type {
  CustomerActor,
  CustomerAssignmentRecord,
  CustomerOrganizationMembership,
  CustomerRelationshipRecord,
  CustomerResourceRecord,
} from "../platform/customers/types";

const mocks = vi.hoisted(() => ({
  requireTenantAccess: vi.fn(),
  getTenantConfig: vi.fn(),
  getWork: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireTenantAccess: mocks.requireTenantAccess }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: mocks.getTenantConfig }));
vi.mock("@/platform/workspaces/repository", () => ({ getWork: mocks.getWork }));

const actor: CustomerActor = {
  userId: "20000000-0000-4000-8000-000000000001",
  verifiedEmail: "assigned@example.test",
};

const resource: CustomerResourceRecord = {
  id: "40000000-0000-4000-8000-000000000001",
  relationshipId: "30000000-0000-4000-8000-000000000001",
  kind: "website",
  resourceReference: "fictional-tenant",
  label: "Mapped website",
  status: "active",
  provenance: "direct_mapping",
  recordedBy: "10000000-0000-4000-8000-000000000001",
  updatedBy: "10000000-0000-4000-8000-000000000001",
  createdAt: "2026-09-08T12:00:00.000Z",
  updatedAt: "2026-09-08T12:00:00.000Z",
  version: 1,
};

const relationship: CustomerRelationshipRecord = {
  id: resource.relationshipId,
  organizationId: "10000000-0000-4000-8000-000000000001",
  displayName: "Fictional Tenant Relationship",
  kind: "organization",
  status: "active",
  provenance: "operator_reviewed",
  recordedBy: "90000000-0000-4000-8000-000000000001",
  updatedBy: "90000000-0000-4000-8000-000000000001",
  createdAt: resource.createdAt,
  updatedAt: resource.updatedAt,
  version: 1,
};

const assignment: CustomerAssignmentRecord = {
  id: "50000000-0000-4000-8000-000000000001",
  organizationId: relationship.organizationId,
  userId: actor.userId,
  relationshipId: relationship.id,
  resourceId: resource.id,
  allowedOperations: ["customer:read", "resource:read"],
  status: "active",
  grantSource: "operator_reviewed",
  grantedBy: "90000000-0000-4000-8000-000000000001",
  updatedBy: "90000000-0000-4000-8000-000000000001",
  createdAt: resource.createdAt,
  updatedAt: resource.updatedAt,
  version: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireTenantAccess.mockResolvedValue(null);
  mocks.getTenantConfig.mockResolvedValue({
    id: "fictional-tenant",
    siteName: "Fictional Tenant",
    active: true,
    updatedAt: "2026-09-08T13:00:00.000Z",
  });
  mocks.getWork.mockResolvedValue({
    id: "50000000-0000-4000-8000-000000000001",
    workspaceId: "60000000-0000-4000-8000-000000000001",
    title: "Private assessment",
    updatedAt: "2026-09-08T13:30:00.000Z",
    payload: { privateBuyerEmail: "must-not-leak@example.test" },
  });
});

function nativeStore(): CustomerMappingStore {
  const membership: CustomerOrganizationMembership = {
    organizationId: relationship.organizationId,
    role: "member",
    workspaceKind: "agency",
  };
  return {
    verifyActor: async () => true,
    getOrganizationMembership: async () => membership,
    listAssignments: async () => [assignment],
    listRelationships: async () => [relationship],
    getRelationship: async () => relationship,
    listResources: async () => [resource],
  };
}

describe("Customers native resource readers", () => {
  it("keeps Website access on requireTenantAccess and reports denied native access safely", async () => {
    const website = await readWebsiteResource({
      actor,
      organizationId: "10000000-0000-4000-8000-000000000001",
      customerId: "30000000-0000-4000-8000-000000000001",
      resource,
    });
    expect(website).toEqual({
      availability: "available",
      observedAt: "2026-09-08T13:00:00.000Z",
      label: "Fictional Tenant",
      href: "http://localhost:3000/client/fictional-tenant/dashboard/site",
      hrefTrust: "native",
    });
    expect(mocks.requireTenantAccess).toHaveBeenCalledWith("fictional-tenant");

    mocks.requireTenantAccess.mockResolvedValue(new Response(null, { status: 403 }));
    await expect(readWebsiteResource({
      actor,
      organizationId: "10000000-0000-4000-8000-000000000001",
      customerId: "30000000-0000-4000-8000-000000000001",
      resource,
    })).rejects.toBeInstanceOf(CustomerUnavailableError);
    expect(mocks.getTenantConfig).toHaveBeenCalledTimes(1);
  });

  it("retains the trusted tenant fallback link through the full customer projection", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      const result = await new CustomerService(nativeStore(), {
        website: readWebsiteResource,
      }).readCustomer(actor, relationship.organizationId, relationship.id);
      expect(result.resources).toEqual([
        {
          id: resource.id,
          kind: "website",
          label: "Fictional Tenant",
          availability: "available",
          observedAt: "2026-09-08T13:00:00.000Z",
          href: "https://app.strelva.com/client/fictional-tenant/dashboard/site",
        },
      ]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("uses getWork for assessment authorization and projects no saved payload", async () => {
    const assessment = await readAssessmentResource({
      actor,
      organizationId: "10000000-0000-4000-8000-000000000001",
      customerId: "30000000-0000-4000-8000-000000000001",
      resource: { ...resource, kind: "assessment", resourceReference: "assessment-work" },
    });
    expect(assessment).toEqual({
      availability: "available",
      observedAt: "2026-09-08T13:30:00.000Z",
      label: "Private assessment",
      href: "/workspace?view=work&workspaceId=60000000-0000-4000-8000-000000000001&work=50000000-0000-4000-8000-000000000001",
      hrefTrust: "internal",
    });
    expect(mocks.getWork).toHaveBeenCalledWith(actor, "assessment-work");
    expect(JSON.stringify(assessment)).not.toContain("privateBuyerEmail");

    mocks.getWork.mockResolvedValue(null);
    await expect(
      readAssessmentResource({
        actor,
        organizationId: "10000000-0000-4000-8000-000000000001",
        customerId: "30000000-0000-4000-8000-000000000001",
        resource: { ...resource, kind: "assessment", resourceReference: "missing-work" },
      }),
    ).rejects.toBeInstanceOf(CustomerUnavailableError);
  });

  it("derives a fixed Home Finder installation scope and accepts only the safe summary", async () => {
    const adapter = {
      readInstallationSummary: vi.fn().mockResolvedValue({
        schemaVersion: "1",
        id: "installation-1",
        brokerageName: "Fictional Brokerage",
        mode: "demo",
        previewHref: "https://idx.example/embed/agency-preview",
        observedAt: "2026-09-08T14:00:00.000Z",
        readiness: [],
      }),
    } as unknown as HomeFinderServerAdapter;
    const homeFinder = createHomeFinderResourceReader(adapter);
    const result = await homeFinder({
      actor,
      organizationId: "10000000-0000-4000-8000-000000000001",
      customerId: "30000000-0000-4000-8000-000000000001",
      resource: {
        ...resource,
        kind: "home_finder_installation",
        resourceReference: "installation-1",
      },
    });

    expect(result).toEqual({
      availability: "available",
      observedAt: "2026-09-08T14:00:00.000Z",
      label: "Fictional Brokerage",
      href: "/api/customers/30000000-0000-4000-8000-000000000001/resources/40000000-0000-4000-8000-000000000001?organizationId=10000000-0000-4000-8000-000000000001&view=summary",
      hrefTrust: "internal",
    });
    expect(adapter.readInstallationSummary).toHaveBeenCalledWith({
      installationId: "installation-1",
      managementReads: ["readInstallationSummary"],
    });
  });

  it("reports missing dedicated IDX configuration as not configured", async () => {
    const previousBase = process.env.HOME_FINDER_MANAGEMENT_BASE_URL;
    const previousKey = process.env.HOME_FINDER_MANAGEMENT_SIGNING_KEY;
    delete process.env.HOME_FINDER_MANAGEMENT_BASE_URL;
    delete process.env.HOME_FINDER_MANAGEMENT_SIGNING_KEY;
    try {
      const readers = createCustomerResourceReaders({
        website: async () => ({ availability: "available" }),
        assessment: async () => ({ availability: "available" }),
      });
      await expect(
        readers.home_finder_installation!({
          actor,
          organizationId: "10000000-0000-4000-8000-000000000001",
          customerId: "30000000-0000-4000-8000-000000000001",
          resource: { ...resource, kind: "home_finder_installation" },
        }),
      ).resolves.toEqual({
        availability: "not_configured",
        observedAt: resource.updatedAt,
      });
    } finally {
      if (previousBase === undefined) delete process.env.HOME_FINDER_MANAGEMENT_BASE_URL;
      else process.env.HOME_FINDER_MANAGEMENT_BASE_URL = previousBase;
      if (previousKey === undefined) delete process.env.HOME_FINDER_MANAGEMENT_SIGNING_KEY;
      else process.env.HOME_FINDER_MANAGEMENT_SIGNING_KEY = previousKey;
    }
  });
});
