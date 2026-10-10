import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/platform/bookings/updates", () => ({ bookingCustomerEmailAllowed: async () => true, deliverBookingUpdates: async () => ({ sent: 0 }) }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedAsync: async () => false, rateLimitKey: () => "fixture" }));
import { setBookingStoreDb } from "@/platform/bookings/store";
import { resetBookingFlagCache } from "@/platform/bookings/flags";
import { POST } from "@/app/api/v1/bookings/[tenant]/reservations/route";

beforeEach(() => {
  resetBookingFlagCache();
  for (const flag of ["STRELVA_BOOKING_AGENTS", "STRELVA_BOOKING_STORE_WRITE", "STRELVA_BOOKING_MESSAGES", "STRELVA_BOOKING_MANAGE_PAGE", "STRELVA_BOOKING_REMINDERS"]) vi.stubEnv(flag, "1");
  vi.stubEnv("STRELVA_BOOKING_STORE_READ", "postgres");
});
afterEach(() => { vi.unstubAllEnvs(); setBookingStoreDb(undefined); resetBookingFlagCache(); });

it("gives an agent the paused business's record phone before claiming a hold", async () => {
  const rpc = vi.fn(async (name: string) => ({ data: name === "booking_parity_streak" ? { days: 7 } : {
    tenantStableId: "calendar", workspaceId: "workspace", paused: true, phone: "716-555-0100", settings: null, hours: null,
    services: [{ id: "svc", name: "Consult", active: true }],
  }, error: null }));
  setBookingStoreDb({ rpc });
  const result = await POST(new Request("http://localhost/api/v1/bookings/fixture/reservations", { method: "POST", body: JSON.stringify({
    origin: "agent", serviceId: "svc", start: "2026-11-03T15:00:00Z", requestId: "request_123", agent: { name: "Assistant" }, customer: { name: "Dana", email: "dana@example.test" },
  }) }), { params: Promise.resolve({ tenant: "fixture" }) });
  expect(result.status).toBe(409);
  expect((await result.json()).error).toBe("Bookings are paused right now. Call 716-555-0100 to reach the business.");
  expect(rpc.mock.calls.some(([name]) => name === "hold_agent_booking")).toBe(false);
});
