import { afterEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  read: vi.fn(async () => ({ schemaVersion: 1, capabilityId: "consultations", version: 2, name: "Consultation", provider: "outlook", timeZone: "America/New_York", slots: [] })),
  reserve: vi.fn(async () => ({ schemaVersion: 1, reservationId: "reservation-12345678", managementToken: "management-12345678", capabilityId: "consultations", version: 2, provider: "outlook", status: "confirmed", title: "Consultation", start: "2026-10-01T13:00:00+00:00", end: "2026-10-01T14:00:00+00:00", timeZone: "America/New_York" })),
  change: vi.fn(async () => ({ schemaVersion: 1, reservationId: "reservation-12345678", managementToken: "management-12345678", capabilityId: "consultations", version: 2, provider: "outlook", status: "confirmed", title: "Consultation", start: "2026-10-01T14:00:00+00:00", end: "2026-10-01T15:00:00+00:00", timeZone: "America/New_York" })),
  cancel: vi.fn(async () => ({ schemaVersion: 1, reservationId: "reservation-12345678", managementToken: "management-12345678", capabilityId: "consultations", version: 2, provider: "outlook", status: "cancelled", title: "Consultation", start: "2026-10-01T14:00:00+00:00", end: "2026-10-01T15:00:00+00:00", timeZone: "America/New_York" })),
}));

vi.mock("@/products/scheduling/server", async importOriginal => ({
  ...(await importOriginal<typeof import("@/products/scheduling/server")>()),
  createPublicWebsiteBookingService: () => boundary,
}));

import { GET } from "@/app/api/v1/bookings/[tenant]/route";
import { POST } from "@/app/api/v1/bookings/[tenant]/reservations/route";
import { DELETE, PATCH } from "@/app/api/v1/bookings/[tenant]/reservations/[reservationId]/route";

import { PublicBookingError } from "@/platform/bookings/errors";
import { setBookingStoreDb } from "@/platform/bookings/store";
import { resetBookingFlagCache } from "@/platform/bookings/flags";
import { fakeBookingStore } from "./support/booking-store-fake";
afterEach(() => { vi.unstubAllEnvs(); setBookingStoreDb(undefined); resetBookingFlagCache(); });

const params = (tenant = "northstar") => ({ params: Promise.resolve({ tenant }) });

describe("public booking v1 routes", () => {
  it("publishes only the schedule returned by the explicit service binding", async () => {
    const response = await GET(new Request("https://control.example/api/v1/bookings/northstar?capabilityId=consultations"), params());
    expect(response.status).toBe(200);
    expect(boundary.read).toHaveBeenCalledWith({ tenantId: "northstar", capabilityId: "consultations" });
    expect(await response.json()).toMatchObject({ capabilityId: "consultations", provider: "outlook" });
  });

  it("captures a public visitor reservation without accepting provider ids or credentials", async () => {
    const response = await POST(new Request("https://control.example/api/v1/bookings/northstar/reservations", {
      method: "POST",
      body: JSON.stringify({
        capabilityId: "consultations",
        capabilityVersion: 2,
        slotId: "slot-12345678",
        requestId: "request-12345678",
        visitor: { name: "Avery Buyer", email: "avery@example.test", message: "Please call." },
        providerId: "should-never-be-accepted",
      }),
      headers: { "Content-Type": "application/json" },
    }), params());
    expect(response.status).toBe(201);
    expect(boundary.reserve).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "northstar",
      capabilityId: "consultations",
      slotId: "slot-12345678",
      visitor: { name: "Avery Buyer", email: "avery@example.test", message: "Please call." },
    }));
    expect(JSON.stringify(await response.json())).not.toContain("providerId");
  });

  it("uses only the opaque receipt for change and cancellation", async () => {
    const patchResponse = await PATCH(new Request("https://control.example/api/v1/bookings/northstar/reservations/reservation-12345678", {
      method: "PATCH",
      body: JSON.stringify({ managementToken: "management-12345678", capabilityId: "consultations", capabilityVersion: 2, slotId: "slot-87654321" }),
      headers: { "Content-Type": "application/json" },
    }), { params: Promise.resolve({ tenant: "northstar", reservationId: "reservation-12345678" }) });
    const deleteResponse = await DELETE(new Request("https://control.example/api/v1/bookings/northstar/reservations/reservation-12345678", {
      method: "DELETE",
      body: JSON.stringify({ managementToken: "management-12345678" }),
      headers: { "Content-Type": "application/json" },
    }), { params: Promise.resolve({ tenant: "northstar", reservationId: "reservation-12345678" }) });
    expect(patchResponse.status).toBe(200);
    expect(deleteResponse.status).toBe(200);
    expect(boundary.change).toHaveBeenCalledWith({ tenantId: "northstar", reservationId: "reservation-12345678", managementToken: "management-12345678", capabilityId: "consultations", capabilityVersion: 2, slotId: "slot-87654321" });
    expect(boundary.cancel).toHaveBeenCalledWith({ tenantId: "northstar", reservationId: "reservation-12345678", managementToken: "management-12345678" });
  });

  it("rejects malformed public inputs before resolving a tenant grant", async () => {
    const response = await GET(new Request("https://control.example/api/v1/bookings/northstar"), params());
    expect(response.status).toBe(400);
    expect(boundary.read).toHaveBeenCalledTimes(1);
  });
});


describe("store-served v1 conflict suggestions", () => {
  it("rechecks the authorized capability and returns three safe slots; flags off preserve the error", async () => {
    const next = Array.from({ length: 4 }, (_, i) => ({ id: `next-slot-${i}-abcdefgh`, start: `2026-11-06T${14+i}:00:00Z`, end: `2026-11-06T${15+i}:00:00Z` }));
    const request = () => new Request("https://control.example/api/v1/bookings/northstar/reservations", { method: "POST", body: JSON.stringify({ capabilityId: "consultations", capabilityVersion: 2, slotId: "taken-slot-abcdefgh", visitor: { name: "Avery", email: "avery@example.test" } }) });
    boundary.reserve.mockRejectedValueOnce(new PublicBookingError("conflict", "Taken"));
    vi.stubEnv("STRELVA_BOOKING_STORE_READ", "");
    expect(await (await POST(request(), params())).json()).toEqual({ error: "Taken", code: "conflict" });
    const fake = fakeBookingStore(); fake.state.streakDays = 7; setBookingStoreDb(fake.db);
    vi.stubEnv("STRELVA_BOOKING_STORE_WRITE", "1"); vi.stubEnv("STRELVA_BOOKING_STORE_READ", "postgres"); resetBookingFlagCache();
    boundary.reserve.mockRejectedValueOnce(new PublicBookingError("conflict", "Taken"));
    boundary.read.mockResolvedValueOnce({ schemaVersion: 1, capabilityId: "consultations", version: 2, name: "Consultation", provider: "outlook", timeZone: "America/New_York", slots: next } as Awaited<ReturnType<typeof boundary.read>>);
    const result = await POST(request(), params()); expect(result.status).toBe(409);
    expect(await result.json()).toEqual({ error: "Taken", code: "conflict", timeZone: "America/New_York", nextSlots: next.slice(0, 3) });
    expect(boundary.read).toHaveBeenLastCalledWith(expect.objectContaining({ tenantId: "northstar", capabilityId: "consultations", range: expect.any(Object) }));
    boundary.reserve.mockRejectedValueOnce(new PublicBookingError("conflict", "Taken")); boundary.read.mockRejectedValueOnce(new Error("Grant unavailable"));
    expect(await (await POST(request(), params())).json()).toEqual({ error: "Taken", code: "conflict" });
  });
});
