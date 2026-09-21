import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fakes = vi.hoisted(() => ({
  inspect: vi.fn(),
  getTenantConfig: vi.fn(),
  readInquiryWorkspace: vi.fn(),
  projectPublishedInquiry: vi.fn(),
  listPublicWebsiteBookingGrants: vi.fn(),
  readWorkspaceSchedule: vi.fn(),
  listWorkspaces: vi.fn(),
}));

vi.mock("@/platform/offerings/store", () => ({
  PostgresOfferingStore: class {
    inspect = fakes.inspect;
  },
}));
vi.mock("@/platform/workspaces/repository", () => ({ listWorkspaces: fakes.listWorkspaces }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: fakes.getTenantConfig }));
vi.mock("@/products/inquiries/server", () => ({
  readInquiryWorkspace: fakes.readInquiryWorkspace,
  projectPublishedInquiry: fakes.projectPublishedInquiry,
}));
vi.mock("@/products/scheduling/server", () => ({
  listPublicWebsiteBookingGrants: fakes.listPublicWebsiteBookingGrants,
  readWorkspaceSchedule: fakes.readWorkspaceSchedule,
  scheduleSchema: { safeParse: (value: unknown) => ({ success: true, data: value }) },
}));

import {
  listPublishedWebsiteCapabilityOptions,
  resolvePublishedWebsiteCapabilities,
} from "@/products/websites/published-capabilities";

const actor = { userId: "11111111-1111-4111-8111-111111111111", verifiedEmail: "owner@example.com" };
const workspaceId = "33333333-3333-4333-8333-333333333333";
const websiteWorkId = "44444444-4444-4444-8444-444444444444";
const bookingGrantId = "55555555-5555-4555-8555-555555555555";
const binding = { status: "active", tenantId: "northstar", siteName: "Northstar Bakery", tenantActive: true, actorHasTenantAccess: true };

describe("published website capability resolution", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example");
    fakes.listWorkspaces.mockResolvedValue([{ id: workspaceId, kind: "customer" }]);
    fakes.inspect.mockResolvedValue({ websiteBindings: [binding] });
    fakes.getTenantConfig.mockResolvedValue({ stableId: "tenant-stable" });
    fakes.readInquiryWorkspace.mockResolvedValue({ snapshot: { state: { capabilities: [] } } });
    fakes.projectPublishedInquiry.mockReturnValue(null);
    fakes.listPublicWebsiteBookingGrants.mockResolvedValue([]);
    fakes.readWorkspaceSchedule.mockResolvedValue({ payload: { availability: [] } });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  function configurePublishedConnections() {
    fakes.readInquiryWorkspace.mockResolvedValue({ snapshot: { state: { capabilities: [{ id: "inquiry-main" }] } } });
    fakes.projectPublishedInquiry.mockReturnValue({ capabilityId: "inquiry-main", version: 3, name: "Buyer inquiries" });
    fakes.listPublicWebsiteBookingGrants.mockResolvedValue([{
      id: bookingGrantId,
      status: "published",
      tenant_stable_id: "tenant-stable",
      capability_id: "booking-main",
      capability_version: 4,
      work_id: "22222222-2222-4222-8222-222222222222",
      provider: "outlook",
      display_name: "Consultations",
    }]);
    fakes.readWorkspaceSchedule.mockResolvedValue({ payload: {
      availability: [
        { start: "2026-10-01T13:00:00+00:00", end: "2026-10-01T14:00:00+00:00" },
        { start: "2026-10-31T21:00:00+00:00", end: "2026-10-31T22:00:00+00:00" },
      ],
    } });
  }

  it("lists explicit inquiry and booking choices without selecting one", async () => {
    configurePublishedConnections();

    await expect(listPublishedWebsiteCapabilityOptions(actor, workspaceId, websiteWorkId)).resolves.toEqual({
      tenants: [{
        tenantId: "northstar",
        siteName: "Northstar Bakery",
        inquiry: [{ capabilityId: "inquiry-main", version: 3, name: "Buyer inquiries" }],
        booking: [{
          grantId: bookingGrantId,
          capabilityId: "booking-main",
          version: 4,
          name: "Consultations",
          provider: "outlook",
          range: { from: "2026-10-01T13:00:00+00:00", to: "2026-10-31T22:00:00+00:00" },
        }],
      }],
    });
    expect(fakes.inspect).toHaveBeenCalledWith(actor, workspaceId);
    expect(fakes.readWorkspaceSchedule).toHaveBeenCalledWith(actor, "22222222-2222-4222-8222-222222222222");
  });

  it("authorizes non-customer workspaces without asking the offering store for customer bindings", async () => {
    fakes.listWorkspaces.mockResolvedValue([{ id: workspaceId, kind: "personal" }]);

    await expect(listPublishedWebsiteCapabilityOptions(actor, workspaceId, websiteWorkId)).resolves.toEqual({ tenants: [] });
    expect(fakes.inspect).not.toHaveBeenCalled();
  });

  it("keeps delegated read access read-only without requesting customer offering authority", async () => {
    fakes.listWorkspaces.mockResolvedValue([{ id: workspaceId, kind: "customer", access: "delegated_read" }]);

    await expect(listPublishedWebsiteCapabilityOptions(actor, workspaceId, websiteWorkId)).resolves.toEqual({ tenants: [] });
    expect(fakes.inspect).not.toHaveBeenCalled();
  });

  it("resolves only the exact saved selection", async () => {
    configurePublishedConnections();

    await expect(resolvePublishedWebsiteCapabilities(actor, workspaceId, websiteWorkId, {
      tenantId: "northstar",
      inquiryCapabilityId: "inquiry-main",
      bookingGrantId,
    })).resolves.toEqual({
      baseUrl: "https://app.example",
      tenant: "northstar",
      inquiry: { capabilityId: "inquiry-main", version: 3 },
      booking: {
        capabilityId: "booking-main",
        version: 4,
        range: { from: "2026-10-01T13:00:00+00:00", to: "2026-10-31T22:00:00+00:00" },
      },
    });
    await expect(resolvePublishedWebsiteCapabilities(actor, workspaceId, websiteWorkId)).resolves.toBeUndefined();
  });

  it("fails closed for a stale selection instead of choosing another connection", async () => {
    configurePublishedConnections();

    await expect(resolvePublishedWebsiteCapabilities(actor, workspaceId, websiteWorkId, {
      tenantId: "northstar",
      bookingGrantId: "66666666-6666-4666-8666-666666666666",
    })).resolves.toBeUndefined();
  });

  it("keeps multiple tenant options explicit rather than using the first binding", async () => {
    configurePublishedConnections();
    fakes.inspect.mockResolvedValue({ websiteBindings: [
      binding,
      { ...binding, tenantId: "southstar", siteName: "Southstar Bakery" },
    ] });
    fakes.getTenantConfig.mockImplementation(async (tenantId: string) => ({
      stableId: tenantId === "southstar" ? "tenant-stable-south" : "tenant-stable",
    }));
    fakes.readInquiryWorkspace.mockImplementation(async ({ tenantId }: { tenantId: string }) => ({
      snapshot: { state: { capabilities: [{ id: tenantId === "southstar" ? "inquiry-south" : "inquiry-main" }] } },
    }));
    fakes.projectPublishedInquiry.mockImplementation((candidate: { id: string }) => ({
      capabilityId: candidate.id,
      version: candidate.id === "inquiry-south" ? 2 : 3,
      name: candidate.id === "inquiry-south" ? "South inquiries" : "Buyer inquiries",
    }));

    const options = await listPublishedWebsiteCapabilityOptions(actor, workspaceId, websiteWorkId);
    expect(options.tenants.map(tenant => tenant.tenantId)).toEqual(["northstar", "southstar"]);
    await expect(resolvePublishedWebsiteCapabilities(actor, workspaceId, websiteWorkId, {
      tenantId: "southstar",
      inquiryCapabilityId: "inquiry-south",
    })).resolves.toMatchObject({ tenant: "southstar", inquiry: { capabilityId: "inquiry-south", version: 2 } });
  });
});
