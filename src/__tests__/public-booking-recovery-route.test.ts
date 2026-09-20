import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recover: vi.fn(),
}));

vi.mock("@/products/scheduling/server", () => ({
  recoverPublicWebsiteBooking: mocks.recover,
  createPublicWebsiteBookingService: vi.fn(),
  PublicBookingError: class PublicBookingError extends Error {
    constructor(readonly code: "unavailable" | "invalid" | "conflict" | "not_found", message: string, readonly status = code === "invalid" ? 400 : code === "not_found" ? 404 : code === "conflict" ? 409 : 503) {
      super(message);
      this.name = "PublicBookingError";
    }
  },
}));

import { POST } from "@/app/api/v1/bookings/[tenant]/reservations/[reservationId]/readback/route";

const tenant = "northstar";
const reservationId = "reservation-12345678";
const managementToken = "management-12345678";
const receipt = {
  schemaVersion: 1,
  reservationId,
  managementToken,
  capabilityId: "consultations",
  version: 2,
  provider: "outlook",
  status: "confirmed",
  title: "Consultation",
  start: "2026-10-01T13:00:00+00:00",
  end: "2026-10-01T14:00:00+00:00",
  timeZone: "America/New_York",
};

beforeEach(() => mocks.recover.mockReset().mockResolvedValue(receipt));

describe("public booking readback route", () => {
  it("requires the tenant and management token", async () => {
    const invalidTenant = await POST(new Request("https://app.example/api/v1/bookings/INVALID/reservations/reservation-12345678/readback", { method: "POST", body: JSON.stringify({ managementToken }) }), { params: Promise.resolve({ tenant: "INVALID", reservationId }) });
    expect(invalidTenant.status).toBe(400);
    expect(mocks.recover).not.toHaveBeenCalled();

    const missingToken = await POST(new Request(`https://app.example/api/v1/bookings/${tenant}/reservations/${reservationId}/readback`, { method: "POST", body: "{}" }), { params: Promise.resolve({ tenant, reservationId }) });
    expect(missingToken.status).toBe(400);
    expect(mocks.recover).not.toHaveBeenCalled();
  });

  it("passes only the exact receipt identity to the readback service", async () => {
    const response = await POST(new Request(`https://app.example/api/v1/bookings/${tenant}/reservations/${reservationId}/readback`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ managementToken, ignored: "not used" }) }), { params: Promise.resolve({ tenant, reservationId }) });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(receipt);
    expect(mocks.recover).toHaveBeenCalledWith({ tenantId: tenant, reservationId, managementToken });
  });
});
