import { afterEach, describe, expect, it, vi } from "vitest";
import { createManualBooking, manualBookingOptions, manualBookingsEnabled, type ManualBookingPorts } from "@/platform/bookings/manual";
import { recordBooking } from "@/platform/bookings/store";
import { fakeBookingStore } from "./support/booking-store-fake";
import { createSchedulingService } from "@/products/scheduling/server";
import { memoryBoundedStore, owner } from "./fixtures/bounded-store";
const actor = { userId: "5e000000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
const input = { workspaceId: "5e000000-0000-4000-8000-000000000002", tenantId: "mooney", serviceId: "consult", start: "2026-12-02T15:00:00Z", requestId: "manual-request-1", customer: { name: "Dana", email: "dana@example.test" } };
async function ports() {
  const store = fakeBookingStore();
  store.tenants.set("mooney", { stableId: "stable", workspaceId: input.workspaceId, systemId: "system", paused: false, hours: null, phone: null, services: [{ id: "service", externalRef: "consult", name: "Consultation", active: true, durationMinutes: 30 }] });
  const recorded = await recordBooking("mooney", { legacyId: "manual-manual-request-1", origin: "owner", status: "requested", start: input.start, end: "2026-12-02T15:30:00Z", serviceRef: "consult", serviceName: "Consultation", customer: input.customer, timeZone: "UTC", bufferMinutes: 15 }, "native", store.db);
  if (recorded.status === "conflict") throw new Error("fixture");
  const rpc = vi.fn(async (name: string) => name === "read_workspace_manual_booking_context" ? { ...store.tenants.get("mooney"), tenantStableId: "stable", settings: null } : { status: "recorded", booking: recorded.booking });
  const p: ManualBookingPorts = { enabled: async () => true, rpc, services: vi.fn(async () => ({ timeZone: "UTC", paused: false, services: [{ id: "consult", name: "Consultation", mode: "request" as const, bufferMinutes: 15, durationMinutes: 30 }] })),
    slots: vi.fn(async () => ({ version: 1, timeZone: "UTC", paused: false, slots: [{ id: input.start, start: input.start, end: "2026-12-02T15:30:00Z", calendarChecked: true }] })), bookings: vi.fn(async () => []), notify: vi.fn(async () => {}), updates: vi.fn(async () => ({ sent: 0, customerSent: 0, suppressed: 0, failed: 0 })) };
  return { p, rpc, booking: recorded.booking };
}
afterEach(() => vi.unstubAllEnvs());
describe("staff take bookings in the one store", () => {
  it("defaults off and authorizes before discovery or mutation", async () => {
    vi.stubEnv("STRELVA_BOOKING_MANUAL", ""); expect(await manualBookingsEnabled()).toBe(false);
    const { p, rpc } = await ports(); p.enabled = async () => false;
    await expect(manualBookingOptions(actor, {workspaceId: input.workspaceId, tenantId: input.tenantId}, "consult", p)).rejects.toMatchObject({ code: "unavailable" });
    await expect(createManualBooking(actor, input, p)).rejects.toMatchObject({ code: "unavailable" });
    expect(rpc).not.toHaveBeenCalled(); expect(p.slots).not.toHaveBeenCalled();
  });
  it("checks membership before reading services and bounded open times", async () => {
    const { p, rpc } = await ports(); rpc.mockRejectedValue(new Error("denied"));
    await expect(manualBookingOptions(actor, { workspaceId: input.workspaceId, tenantId: input.tenantId }, "consult", p)).rejects.toThrow("denied");
    expect(p.services).not.toHaveBeenCalled(); expect(p.slots).not.toHaveBeenCalled();
  });
  it("saves the requested slot and keeps a durable receipt despite notification failure", async () => {
    const { p, rpc } = await ports(); vi.mocked(p.notify).mockRejectedValue(new Error("mail down")); vi.mocked(p.updates).mockRejectedValue(new Error("mail down"));
    expect(await createManualBooking(actor, input, p)).toMatchObject({ created: true, booking: { status: "requested", origin: "owner" } });
    expect(rpc).toHaveBeenLastCalledWith("create_workspace_manual_booking", expect.objectContaining({ p_user_id: actor.userId, p_workspace_id: input.workspaceId, p_booking: expect.objectContaining({ legacyId: "manual-manual-request-1", end: "2026-12-02T15:30:00Z", requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) }) }));
  });
  it("rejects taken time without a store write or notice", async () => {
    const { p, rpc } = await ports(); vi.mocked(p.slots).mockResolvedValue({ version: 1, timeZone: "UTC", paused: false, slots: [] });
    await expect(createManualBooking(actor, input, p)).rejects.toMatchObject({ code: "conflict" });
    expect(rpc).toHaveBeenCalledOnce(); expect(p.notify).not.toHaveBeenCalled();
  });
  it("a matching retry uses durable replay checks instead of its occupied slot", async () => {
    const { p, booking, rpc } = await ports(); vi.mocked(p.bookings).mockResolvedValue([booking]); rpc.mockImplementation(async name => name === "read_workspace_manual_booking_context" ? { ...storeContext() } : { status: "unchanged", booking });
    expect(await createManualBooking(actor, input, p)).toMatchObject({ created: false }); expect(p.slots).not.toHaveBeenCalled();
  });
  it("does not accept status or origin from the browser", async () => {
    const { p, rpc } = await ports(); await expect(createManualBooking(actor, { ...input, status: "confirmed", origin: "site" }, p)).rejects.toThrow(); expect(rpc).not.toHaveBeenCalled();
  });
});
function storeContext() { return { tenantStableId: "stable", workspaceId: input.workspaceId, settings: null, services: [{ id: "service", externalRef: "consult", name: "Consultation", durationMinutes: 30, active: true }], hours: null }; }
describe("the old interval store after the read flip", () => {
  it("refuses separate reservation writes and provider delivery while retaining lifecycle commands", async () => {
    let source: "legacy" | "postgres" = "legacy";
    const service = createSchedulingService(memoryBoundedStore(), { bookingReadSource: async () => source, workspaceExitCompleted: async () => false, assertManager: async () => {} });
    const schedule = await service.create(owner, "workspace-a", { title: "Consultations", availability: [{ start: input.start, end: "2026-12-02T18:00:00Z" }] });
    const command = { kind: "reserve", expectedRevision: 0, requestId: "request-1", title: "Consultation", start: input.start, end: "2026-12-02T15:30:00Z" };
    const before = await service.command(owner, schedule.id, command); source = "postgres";
    await expect(service.command(owner, schedule.id, { ...command, requestId: "request-2", expectedRevision: 1 })).rejects.toThrow("in Bookings");
    await expect(service.command(owner, schedule.id, { kind: "cancel", requestId: "request-1", expectedRevision: 1 })).rejects.toThrow("in Bookings");
    const provider = { authorize: vi.fn(), reserve: vi.fn(), find: vi.fn(), verify: vi.fn() };
    await expect(service.deliver(owner, schedule.id, "request-1", provider)).rejects.toThrow("moved to Bookings"); expect(provider.authorize).not.toHaveBeenCalled();
    const paused = await service.command(owner, schedule.id, { kind: "pause", expectedRevision: 1, reason: "Closed for the week" });
    expect(paused.payload.reservations).toEqual(before.payload.reservations);
  });
});
