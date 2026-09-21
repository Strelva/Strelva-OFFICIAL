import { describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  db: null as unknown as object | null,
  getTenantConfig: vi.fn(async () => ({ stableId: "stable-tenant", active: true })),
  readWorkspaceSchedule: vi.fn(async () => ({ payload: { version: 1, revision: 4, title: "Consultation", createdBy: "owner-1", createdAt: "2026-09-20T00:00:00.000Z", history: [], availability: [
    { start: "2026-10-01T13:00:00+00:00", end: "2026-10-01T14:00:00+00:00" },
    { start: "2026-10-01T14:00:00+00:00", end: "2026-10-01T15:00:00+00:00" },
  ], reservations: [] } })),
  readWorkspaceProviderAvailability: vi.fn(async () => ({ provider: "outlook", timeZone: "America/New_York", busy: [{ start: "2026-10-01T13:00:00+00:00", end: "2026-10-01T14:00:00+00:00", sourceId: "private-provider-event" }] })),
  readWorkspaceExitCompleted: vi.fn(async () => false),
  inspectOfferings: vi.fn(async () => ({ websiteBindings: [{
    id: "binding-1", businessId: "workspace-1", status: "active", revision: 1,
    tenantId: "northstar", siteName: "Northstar", tenantActive: true, actorHasTenantAccess: true,
    createdBy: "owner-1", createdAt: "2026-09-20T00:00:00.000Z", updatedBy: "owner-1", updatedAt: "2026-09-20T00:00:00.000Z",
  }] })),
}));

vi.mock("@/lib/tenants", () => ({ getTenantConfig: boundary.getTenantConfig }));
vi.mock("@/lib/db/client", () => ({ getSupabase: () => boundary.db }));
vi.mock("@/platform/offerings/store", () => ({
  PostgresOfferingStore: class {
    inspect = boundary.inspectOfferings;
  },
}));
vi.mock("@/products/scheduling/server", () => ({
  readWorkspaceSchedule: boundary.readWorkspaceSchedule,
  readWorkspaceProviderAvailability: boundary.readWorkspaceProviderAvailability,
  readWorkspaceExitCompleted: boundary.readWorkspaceExitCompleted,
  changeWorkspaceSchedule: vi.fn(),
  calendarSchedulingService: { create: vi.fn(), reschedule: vi.fn(), cancel: vi.fn() },
}));
vi.mock("@/products/inquiries/server", () => ({
  getInquiryRepository: vi.fn(),
  projectPublishedInquiry: vi.fn(),
  recordInquiryEvidence: vi.fn(),
  resolveInquiryWorkspace: vi.fn(),
  validateInquiryFields: vi.fn(),
}));

import { resolvePublishedPublicBooking } from "@/products/scheduling/public-booking-server";

function fakeClient(options: { bindingStatus?: "active" | "revoked"; grantStatus?: "published" | "revoked" } = {}) {
  const rows: Record<string, Record<string, unknown>> = {
    public_website_booking_grants: {
      id: "grant-1", tenant_stable_id: "stable-tenant", business_workspace_id: "workspace-1", work_id: "work-1",
      capability_id: "consultations", capability_version: 2, inquiry_capability_id: "inquiries", inquiry_version: 6,
      provider: "outlook", display_name: "Consultation", time_zone: "America/New_York", status: options.grantStatus ?? "published",
    },
    saved_product_work: { id: "work-1", workspace_id: "workspace-1", product_id: "scheduling", resource_kind: "schedule", created_by: "owner-1" },
    users: { id: "owner-1", email: "owner@example.test", verified_at: "2026-09-20T00:00:00.000Z" },
  };
  return { from(table: string) {
    const filters: Record<string, unknown> = {};
    const query = {
      select() { return query; },
      eq(column: string, value: unknown) { filters[column] = value; return query; },
      async maybeSingle() {
        const row = rows[table];
        const matches = row && Object.entries(filters).every(([key, value]) => row[key] === value);
        return { data: matches ? row : null, error: null };
      },
    };
    return query;
  } };
}

describe("published public booking resolver", () => {
  it("requires the explicit grant, filters provider-busy slots, and keeps provider ids server-side", async () => {
    boundary.db = fakeClient();
    const result = await resolvePublishedPublicBooking({ tenantId: "northstar", capabilityId: "consultations" });
    expect(result).toMatchObject({ tenantId: "northstar", grantId: "grant-1", workspaceId: "workspace-1", workId: "work-1", provider: "outlook", inquiryCapabilityId: "inquiries", inquiryVersion: 6 });
    expect(result?.slots).toHaveLength(1);
    expect(result?.slots[0]).not.toHaveProperty("sourceId");
    expect(JSON.stringify(result?.slots)).not.toContain("private-provider-event");
    expect(boundary.readWorkspaceProviderAvailability).toHaveBeenCalledWith(expect.objectContaining({ userId: "owner-1", verifiedEmail: "owner@example.test" }), "workspace-1", "outlook", expect.any(Object));
    expect(boundary.inspectOfferings).toHaveBeenCalledWith({ userId: "owner-1", verifiedEmail: "owner@example.test" }, "workspace-1");
  });

  it("returns no public capability when the published grant is absent", async () => {
    boundary.db = fakeClient();
    boundary.getTenantConfig.mockResolvedValueOnce({ stableId: "stable-tenant", active: true });
    const client = boundary.db as { from: (table: string) => { select: () => unknown } };
    void client;
    // A different capability cannot fall through to a tenant booking URL or
    // another schedule in the workspace.
    await expect(resolvePublishedPublicBooking({ tenantId: "northstar", capabilityId: "other" })).resolves.toBeNull();
  });

  it("can resolve an existing receipt for cancellation after the website binding is revoked", async () => {
    boundary.db = fakeClient();
    boundary.inspectOfferings.mockResolvedValueOnce({ websiteBindings: [{
      id: "binding-1", businessId: "workspace-1", status: "revoked", revision: 2,
      tenantId: "northstar", siteName: "Northstar", tenantActive: true, actorHasTenantAccess: true,
      createdBy: "owner-1", createdAt: "2026-09-20T00:00:00.000Z", updatedBy: "owner-1", updatedAt: "2026-09-20T00:00:00.000Z",
    }] });
    const result = await resolvePublishedPublicBooking({ tenantId: "northstar", capabilityId: "consultations", includeRevoked: true });
    expect(result).toMatchObject({ websiteBindingActive: false, status: "published" });
  });

  it("prefers a current active binding when an older revoked row is also retained", async () => {
    boundary.db = fakeClient();
    const base = {
      id: "binding-1", businessId: "workspace-1", revision: 1,
      tenantId: "northstar", siteName: "Northstar", tenantActive: true, actorHasTenantAccess: true,
      createdBy: "owner-1", createdAt: "2026-09-20T00:00:00.000Z", updatedBy: "owner-1", updatedAt: "2026-09-20T00:00:00.000Z",
    };
    boundary.inspectOfferings.mockResolvedValueOnce({ websiteBindings: [
      { ...base, status: "revoked" },
      { ...base, id: "binding-2", status: "active" },
    ] });

    const result = await resolvePublishedPublicBooking({ tenantId: "northstar", capabilityId: "consultations", includeRevoked: true });

    expect(result).toMatchObject({ websiteBindingActive: true, status: "published" });
  });

  it("fails with unavailable binding evidence when the owned offering store fails", async () => {
    boundary.db = fakeClient();
    boundary.inspectOfferings.mockRejectedValueOnce(new Error("rpc unavailable"));

    await expect(resolvePublishedPublicBooking({ tenantId: "northstar", capabilityId: "consultations" }))
      .rejects.toThrow("Public website binding is unavailable.");
  });
});
