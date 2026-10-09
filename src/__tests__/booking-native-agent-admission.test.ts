import { afterEach, beforeEach, expect, it, vi } from "vitest";
const store = vi.hoisted(() => ({ context: vi.fn(), db: vi.fn() }));
vi.mock("@/platform/bookings/store", async original => ({ ...await original<typeof import("@/platform/bookings/store")>(), readBookingContext: store.context, bookingStoreDb: store.db }));
import { requireAgentBookings, requestAgentBooking } from "@/platform/bookings/native";
import { readAgentBookingAvailability } from "@/platform/agent-channel/public-tools";
import { resetBookingFlagCache } from "@/platform/bookings/flags";
const ws = "11111111-1111-4111-8111-111111111111";
const scope = `workspace:${ws}`;
const context = { tenantStableId: null, workspaceId: ws, calendarKey: ws, systemId: "native-booking", paused: false, services: [] };
beforeEach(() => {
 vi.clearAllMocks(); resetBookingFlagCache();
 vi.stubEnv("STRELVA_BOOKING_AGENTS", "1"); vi.stubEnv("STRELVA_BOOKING_STORE_WRITE", "1"); vi.stubEnv("STRELVA_BOOKING_STORE_READ", "postgres"); vi.stubEnv("DUAL_WRITE_PG", "1");
 vi.stubEnv("STRELVA_BOOKING_MESSAGES", "0"); vi.stubEnv("STRELVA_BOOKING_MANAGE_PAGE", "0"); vi.stubEnv("STRELVA_BOOKING_REMINDERS", "0");
 store.context.mockResolvedValue(context); store.db.mockReturnValue({ rpc: vi.fn(async () => ({ data: { days: 0 }, error: null })) });
});
afterEach(() => vi.unstubAllEnvs());
it("admits the exact live unlinked native calendar without unrelated tenant parity", async () => {
 await expect(requireAgentBookings(scope)).resolves.toBeUndefined(); expect(store.context).toHaveBeenCalledWith(scope); expect(store.db).not.toHaveBeenCalled();
});
it("retains legacy tenant cutover and every global/write rollback gate", async () => {
 await expect(requireAgentBookings("legacy-site")).rejects.toThrow("Agent bookings are not enabled");
 const gates: Array<[string, string]> = [["STRELVA_BOOKING_AGENTS", "0"], ["DUAL_WRITE_PG", "0"], ["STRELVA_BOOKING_STORE_WRITE", "0"]];
 for (const [flag, value] of gates) {
  vi.stubEnv(flag, value); store.context.mockClear(); await expect(requireAgentBookings(scope)).rejects.toThrow("not enabled"); expect(store.context).not.toHaveBeenCalled(); vi.stubEnv(flag, "1");
 }
});
it("refuses linked paused foreign or malformed native contexts", async () => {
 for (const changed of [{ tenantStableId: "legacy" }, { paused: true }, { workspaceId: "other" }, { calendarKey: "other" }, { systemId: null }]) {
  store.context.mockResolvedValue({ ...context, ...changed }); await expect(requireAgentBookings(scope)).rejects.toThrow("not enabled");
 }
 store.context.mockClear(); await expect(requireAgentBookings("workspace:not-a-uuid")).rejects.toThrow("not enabled"); expect(store.context).not.toHaveBeenCalled();
 vi.stubEnv("STRELVA_BOOKING_STORE_READ", "legacy"); await expect(requireAgentBookings(scope)).rejects.toThrow("not enabled");
});
it("reaches the still-disabled customer confirmation gate without a booking effect", async () => {
 await expect(requestAgentBooking(scope, { origin: "agent", serviceId: "service", start: "2026-11-03T15:00:00Z", requestId: "request_123", agent: { name: "Assistant" }, customer: { name: "Dana", email: "dana@example.test" } })).rejects.toThrow("Customer confirmation is not available");
 expect(store.context).toHaveBeenCalledTimes(1); expect(store.db).not.toHaveBeenCalled();
});
const directoryFor = (bookingScope: string) => ({ list: async () => [{ business: "native", name: "Native", industry: null, website: null }], scope: async () => bookingScope });
it("reports the native confirmation hold rather than unrelated tenant parity", async () => {
 store.context.mockResolvedValue({ ...context, services: [{ id: "service", active: true }] });
 await expect(readAgentBookingAvailability(directoryFor(scope), "Native")).resolves.toEqual({ status: "no", detail: "Customer confirmation is not available for this business." });
 expect(store.db).not.toHaveBeenCalled();
});
it("keeps legacy availability behind cutover and native availability behind rollback gates", async () => {
 await expect(readAgentBookingAvailability(directoryFor("legacy-site"), "Native")).resolves.toMatchObject({ status: "no", detail: "Strelva agent booking is not enabled for this business." });
 for (const flag of ["STRELVA_BOOKING_AGENTS", "STRELVA_BOOKING_STORE_WRITE", "DUAL_WRITE_PG"]) {
  vi.stubEnv(flag, "0"); store.context.mockClear();
  await expect(readAgentBookingAvailability(directoryFor(scope), "Native")).resolves.toMatchObject({ status: "no", detail: "Strelva agent booking is not enabled for this business." });
  expect(store.context).not.toHaveBeenCalled(); vi.stubEnv(flag, "1");
 }
});
it("keeps an unreadable native calendar unknown instead of claiming availability", async () => {
 store.context.mockRejectedValue(new Error("store unavailable"));
 await expect(readAgentBookingAvailability(directoryFor(scope), "Native")).resolves.toMatchObject({ status: "unknown" });
});
