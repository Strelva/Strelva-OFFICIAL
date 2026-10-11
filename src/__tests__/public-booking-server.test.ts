import { afterEach, describe, expect, it, vi } from "vitest";

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
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => boundary.db }));
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

import { fakeBookingStore } from "./support/booking-store-fake";
import { setBookingStoreDb } from "@/platform/bookings/store";
import { resetBookingFlagCache } from "@/platform/bookings/flags";
import { resolvePublishedPublicBooking } from "@/products/scheduling/public-booking-server";
import { createPublicBookingService, publicBookingScheduleSchema } from "@/products/scheduling/public-booking";

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

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); setBookingStoreDb(undefined); resetBookingFlagCache(); });

describe("published public booking resolver", () => {
  it("after the flip resolves the granted service from live record hours without copying intervals or requiring a provider", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-02T12:00:00Z"));
    vi.stubEnv("STRELVA_BOOKING_STORE_WRITE", "1"); vi.stubEnv("STRELVA_BOOKING_STORE_READ", "postgres");
    vi.stubEnv("STRELVA_BOOKING_CALENDAR_BUSY", "0");
    const store = fakeBookingStore(); store.state.streakDays = 7;
    store.tenants.set("northstar", { stableId: "stable-tenant", workspaceId: "workspace-1", systemId: "system", paused: false, phone: null,
      hours: { timezone: "America/New_York", weekly: [{ day: 5, opens: "09:00", closes: "15:00" }] },
      services: [{ id: "service-1", externalRef: "consultations", name: "Consultation", durationMinutes: 30, active: true }] });
    store.settings.set("stable-tenant", { mode: "request", bufferMinutes: 15, minNoticeMinutes: 0, maxAdvanceDays: 60, defaultLengthMinutes: 60, maxPerDay: null, timezone: "UTC", bookableHours: null, bookableOverrides: null, revision: 1 });
    setBookingStoreDb(store.db); resetBookingFlagCache(); boundary.db = fakeClient(); boundary.readWorkspaceProviderAvailability.mockClear();
    const input = { tenantId: "northstar", capabilityId: "consultations", range: { from: "2026-11-06T00:00:00Z", to: "2026-11-07T00:00:00Z" } };
    const first = await resolvePublishedPublicBooking(input);
    expect(first?.slots[0]).toMatchObject({ start: "2026-11-06T14:00:00.000Z", end: "2026-11-06T14:30:00.000Z" });
    expect(first?.recordBooking).toMatchObject({ serviceRef: "consultations", mode: "request", bufferMinutes: 15 });
    store.tenants.get("northstar")!.hours!.weekly[0]!.closes = "12:00";
    const changed = await resolvePublishedPublicBooking(input);
    expect(changed?.slots.length).toBeLessThan(first!.slots.length);
    expect(changed?.slots.every(s => Date.parse(s.end) <= Date.parse("2026-11-06T17:00:00Z"))).toBe(true);
    expect(boundary.readWorkspaceProviderAvailability).not.toHaveBeenCalled();
    store.tenants.get("northstar")!.paused = true;
    expect((await resolvePublishedPublicBooking(input))?.slots).toEqual([]);
  });
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

  it("never offers legacy slots beyond the capped provider read window", async () => {
    boundary.db = fakeClient();
    boundary.readWorkspaceSchedule.mockResolvedValueOnce({ payload: { version: 1, revision: 4, title: "Consultation", createdBy: "owner-1", createdAt: "2026-09-20T00:00:00.000Z", history: [], availability: [
      { start: "2026-10-01T14:00:00+00:00", end: "2026-10-01T15:00:00+00:00" },
      { start: "2027-01-01T14:00:00+00:00", end: "2027-01-01T15:00:00+00:00" },
    ], reservations: [] } });
    const result = await resolvePublishedPublicBooking({ tenantId: "northstar", capabilityId: "consultations" });
    expect(result?.slots).toHaveLength(1);
    expect(result?.slots[0]?.start).toBe("2026-10-01T14:00:00+00:00");
    expect(boundary.readWorkspaceProviderAvailability).toHaveBeenLastCalledWith(expect.any(Object), "workspace-1", "outlook", expect.objectContaining({ end: "2026-11-30T14:00:00.000Z" }));
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

  describe("a paused workspace schedule on the live /api/v1/bookings path", () => {
    const pausedSchedule = async () => ({ payload: { version: 1, revision: 5, title: "Consultation", createdBy: "owner-1", createdAt: "2026-09-20T00:00:00.000Z", history: [], availability: [
      { start: "2026-10-01T14:00:00+00:00", end: "2026-10-01T15:00:00+00:00" },
    ], reservations: [], pause: { pausedAt: "2026-09-30T12:00:00.000Z", pausedBy: "owner-1", reason: "Owner away" } } });

    it("lists no open times, in the same response shape, without asking the provider", async () => {
      boundary.db = fakeClient();
      boundary.readWorkspaceProviderAvailability.mockClear();
      boundary.readWorkspaceSchedule.mockImplementationOnce(pausedSchedule);
      const binding = await resolvePublishedPublicBooking({ tenantId: "northstar", capabilityId: "consultations" });
      expect(binding?.slots).toEqual([]);
      expect(boundary.readWorkspaceProviderAvailability).not.toHaveBeenCalled();
      const service = createPublicBookingService({ resolve: async () => binding, inquiries: { capture: vi.fn() }, calendar: { reserve: vi.fn(), change: vi.fn(), cancel: vi.fn() }, tokens: { findByRequest: vi.fn(async () => null), findByToken: vi.fn(), save: vi.fn() } });
      const body = await service.read({ tenantId: "northstar", capabilityId: "consultations" });
      expect(Object.keys(body).sort()).toEqual(["capabilityId", "name", "provider", "schemaVersion", "slots", "timeZone", "version"]);
      expect(publicBookingScheduleSchema.parse(body).slots).toEqual([]);
    });

    it("refuses a booking for a time the visitor saw before the pause, before any inquiry or receipt is recorded", async () => {
      boundary.db = fakeClient();
      const live = await resolvePublishedPublicBooking({ tenantId: "northstar", capabilityId: "consultations" });
      const seen = live!.slots[0]!;
      boundary.readWorkspaceSchedule.mockImplementationOnce(pausedSchedule);
      const capture = vi.fn(async () => ({ inquiryId: "lead-1" }));
      const reserve = vi.fn(async () => { throw new Error("Bookings are paused."); });
      const save = vi.fn(async (value) => value);
      const service = createPublicBookingService({
        resolve: resolvePublishedPublicBooking,
        inquiries: { capture },
        calendar: { reserve, change: vi.fn(), cancel: vi.fn() },
        tokens: { findByRequest: vi.fn(async () => null), findByToken: vi.fn(), save },
      });
      const attempt = service.reserve({ tenantId: "northstar", capabilityId: "consultations", capabilityVersion: 2, slotId: seen.id, visitor: { name: "Ada", email: "ada@example.test" }, requestId: "r".repeat(40) });
      await expect(attempt).rejects.toMatchObject({ code: "conflict", status: 409 });
      await attempt.catch((error) => expect(error.message).toBe("This business is not taking new bookings right now."));
      expect(capture).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
      expect(reserve).not.toHaveBeenCalled();
    });

    it("refuses a time change while paused but still lets the visitor cancel", async () => {
      boundary.db = fakeClient();
      boundary.readWorkspaceSchedule.mockImplementationOnce(pausedSchedule);
      const binding = await resolvePublishedPublicBooking({ tenantId: "northstar", capabilityId: "consultations", includeRevoked: true });
      const ref = { tenantId: "northstar", capabilityId: "consultations", version: 2, provider: "outlook" as const, reservationId: "res-12345678", requestId: "r".repeat(40), requestFingerprint: "f", slotId: "slot-12345678", slotStart: "2026-10-01T14:00:00+00:00", slotEnd: "2026-10-01T15:00:00+00:00", workspaceId: "workspace-1", workId: "work-1", inquiryId: "lead-1", managementToken: "token-12345678", expectedRevision: 5, title: "Consultation", start: "2026-10-01T14:00:00+00:00", end: "2026-10-01T15:00:00+00:00", timeZone: "America/New_York", status: "confirmed" as const };
      const change = vi.fn();
      const cancel = vi.fn(async () => ({ verification: "verified" as const, start: ref.start, end: ref.end, expectedRevision: 6 }));
      const service = createPublicBookingService({ resolve: async () => binding, inquiries: { capture: vi.fn() }, calendar: { reserve: vi.fn(), change, cancel }, tokens: { findByRequest: vi.fn(), findByToken: vi.fn(async () => ref), save: vi.fn(async (value) => value) } });
      await expect(service.change({ tenantId: "northstar", reservationId: ref.reservationId, managementToken: ref.managementToken, capabilityId: "consultations", capabilityVersion: 2, slotId: "slot-12345678" })).rejects.toMatchObject({ code: "conflict" });
      expect(change).not.toHaveBeenCalled();
      expect((await service.cancel({ tenantId: "northstar", reservationId: ref.reservationId, managementToken: ref.managementToken })).status).toBe("cancelled");
    });
  });
});
