import { describe, expect, it, vi } from "vitest";
import { recoverPublicWebsiteBooking } from "@/products/scheduling/public-booking-recovery";
import type { PublicBookingBinding, PublicBookingReservationRef } from "@/products/scheduling/public-booking";

const owner = { userId: "11111111-1111-4111-8111-111111111111", verifiedEmail: "owner@example.test" };
const tenantId = "northstar";
const workspaceId = "22222222-2222-4222-8222-222222222222";
const workId = "33333333-3333-4333-8333-333333333333";
const reservationId = "reservation-12345678";
const managementToken = "management-12345678";
const started = "2026-10-01T13:00:00+00:00";
const ended = "2026-10-01T14:00:00+00:00";

function schedule(revision: number, reservations: unknown[] = []) {
  return {
    version: 1,
    revision,
    title: "Consultations",
    createdBy: owner.userId,
    createdAt: "2026-09-20T00:00:00.000Z",
    history: [],
    availability: [{ start: started, end: ended }],
    reservations,
  };
}

function ref(overrides: Partial<PublicBookingReservationRef> = {}): PublicBookingReservationRef {
  return {
    tenantId,
    tenantStableId: "44444444-4444-4444-8444-444444444444",
    grantId: "55555555-5555-4555-8555-555555555555",
    capabilityId: "consultations",
    version: 2,
    provider: "outlook",
    reservationId,
    requestId: "public-request-123456789012345678901234",
    requestFingerprint: "a".repeat(64),
    slotId: "slot-12345678",
    slotStart: started,
    slotEnd: ended,
    workspaceId,
    workId,
    inquiryId: "inquiry-12345678",
    managementToken,
    expectedRevision: 1,
    title: "Consultation",
    start: started,
    end: ended,
    timeZone: "America/New_York",
    status: "pending",
    ...overrides,
  };
}

function binding(overrides: Partial<PublicBookingBinding> = {}): PublicBookingBinding {
  return {
    tenantId,
    tenantStableId: "44444444-4444-4444-8444-444444444444",
    grantId: "55555555-5555-4555-8555-555555555555",
    status: "published",
    websiteBindingActive: true,
    capabilityId: "consultations",
    version: 2,
    name: "Consultation",
    provider: "outlook",
    timeZone: "America/New_York",
    slots: [{ id: "slot-12345678", start: started, end: ended }],
    owner,
    workspaceId,
    workId,
    ...overrides,
  };
}

function nativeReservation(overrides: Record<string, unknown> = {}) {
  return {
    requestId: ref().requestId,
    title: "Consultation",
    start: started,
    end: ended,
    status: "accepted",
    provider: "outlook",
    providerId: "event-1",
    verification: "verified",
    ...overrides,
  };
}

function dependencies(options: {
  current?: ReturnType<typeof schedule>;
  afterRecover?: ReturnType<typeof schedule>;
  saved?: PublicBookingReservationRef[];
  currentRef?: PublicBookingReservationRef;
  currentBinding?: PublicBookingBinding;
} = {}) {
  const saved = options.saved ?? [];
  const tokenRef = options.currentRef ?? ref();
  const read = vi.fn(async () => ({ payload: options.current ?? schedule(2) }));
  const recover = vi.fn(async () => ({ payload: options.afterRecover ?? options.current ?? schedule(2) }));
  const tokens = {
    findByToken: vi.fn(async () => tokenRef),
    save: vi.fn(async (value: PublicBookingReservationRef) => { saved.push(value); return value; }),
  };
  const resolve = vi.fn(async () => options.currentBinding ?? binding());
  return { calendar: { read, recover }, tokens, resolve, saved };
}

describe("public booking readback recovery", () => {
  it("returns a truthful pending receipt without native recovery when the durable claim has no reservation", async () => {
    const deps = dependencies({ currentRef: ref({ status: "confirmed" }), current: schedule(4) });
    const result = await recoverPublicWebsiteBooking({ tenantId, reservationId, managementToken }, deps);

    expect(result.status).toBe("pending");
    expect(deps.resolve).toHaveBeenCalledWith({ tenantId, capabilityId: "consultations", includeRevoked: true });
    expect(deps.calendar.recover).not.toHaveBeenCalled();
    expect(deps.saved.at(-1)).toMatchObject({ status: "pending", expectedRevision: 4 });
  });

  it("does not preserve a cancelled claim when no native reservation exists", async () => {
    const deps = dependencies({ currentRef: ref({ status: "cancelled" }), current: schedule(5) });
    const result = await recoverPublicWebsiteBooking({ tenantId, reservationId, managementToken }, deps);

    expect(result.status).toBe("pending");
    expect(deps.saved.at(-1)).toMatchObject({ status: "pending", expectedRevision: 5 });
    expect(deps.calendar.recover).not.toHaveBeenCalled();
  });

  it("recovers an uncertain native reservation and persists only its sanitized status and revision", async () => {
    const first = schedule(2, [nativeReservation({ status: "unknown", verification: "failed" })]);
    const recovered = schedule(3, [nativeReservation({ status: "accepted", verification: "verified", start: "2026-10-02T13:00:00+00:00", end: "2026-10-02T14:00:00+00:00" })]);
    const deps = dependencies({ current: first, afterRecover: recovered });
    deps.calendar.read.mockResolvedValueOnce({ payload: first }).mockResolvedValueOnce({ payload: recovered });

    const result = await recoverPublicWebsiteBooking({ tenantId, reservationId, managementToken }, deps);

    expect(result.status).toBe("confirmed");
    expect(result.start).toBe("2026-10-02T13:00:00+00:00");
    expect(deps.calendar.recover).toHaveBeenCalledWith(owner, workId, ref().requestId, "outlook");
    expect(deps.saved.at(-1)).toMatchObject({ status: "confirmed", expectedRevision: 3, start: "2026-10-02T13:00:00+00:00" });
  });

  it("keeps existing cancellation recovery available after the binding is revoked", async () => {
    const cancelled = nativeReservation({ status: "cancelled", verification: "verified" });
    const deps = dependencies({
      current: schedule(6, [cancelled]),
      currentRef: ref({ status: "pending" }),
      currentBinding: binding({ status: "revoked", websiteBindingActive: false }),
    });

    const result = await recoverPublicWebsiteBooking({ tenantId, reservationId, managementToken }, deps);

    expect(result.status).toBe("cancelled");
    expect(deps.resolve).toHaveBeenCalledWith({ tenantId, capabilityId: "consultations", includeRevoked: true });
    expect(deps.calendar.recover).toHaveBeenCalledTimes(1);
  });

  it("recovers a receipt through the current tenant slug after a rename", async () => {
    const currentTenantId = "renamed-northstar";
    const deps = dependencies({
      currentRef: ref({ tenantId: currentTenantId, tenantIdAtReservation: tenantId, status: "confirmed" }),
      current: schedule(4),
      currentBinding: binding({ tenantId: currentTenantId }),
    });

    const result = await recoverPublicWebsiteBooking({ tenantId: currentTenantId, reservationId, managementToken }, deps);

    expect(result.status).toBe("pending");
    expect(deps.tokens.findByToken).toHaveBeenCalledWith({ tenantId: currentTenantId, managementToken });
    expect(deps.resolve).toHaveBeenCalledWith({ tenantId: currentTenantId, capabilityId: "consultations", includeRevoked: true });
    expect(deps.saved.at(-1)).toMatchObject({ tenantId: currentTenantId, tenantIdAtReservation: tenantId });
  });

  it("does not disclose or recover a different reservation", async () => {
    const deps = dependencies({ currentRef: ref({ reservationId: "another-reservation" }) });

    await expect(recoverPublicWebsiteBooking({ tenantId, reservationId, managementToken }, deps)).rejects.toMatchObject({ code: "not_found", status: 404 });
    expect(deps.resolve).not.toHaveBeenCalled();
    expect(deps.calendar.read).not.toHaveBeenCalled();
  });

  it("never enters a provider write path", async () => {
    const deps = dependencies({ current: schedule(2, [nativeReservation({ status: "reserved", verification: undefined })]) });
    const result = await recoverPublicWebsiteBooking({ tenantId, reservationId, managementToken }, deps);

    expect(result.status).toBe("pending");
    expect(deps.calendar.recover).toHaveBeenCalledTimes(1);
  });
});
