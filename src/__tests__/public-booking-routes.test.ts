import { describe, expect, it, vi } from "vitest";

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
