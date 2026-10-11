import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBookingStore } from "./support/booking-store-fake";
import { setBookingStoreDb } from "@/platform/bookings/store";
import { resetBookingFlagCache } from "@/platform/bookings/flags";
import { setCalendarBusyPorts } from "@/platform/bookings/calendar-busy";
import { recordPublicAvailability, confirmPublicRecord, changePublicRecord, cancelPublicRecord } from "@/platform/bookings/public-record";
import { publicBookingStoreHook } from "@/platform/bookings/public-api";
import { createPublicBookingService, type PublicBookingBinding, type PublicBookingReservationRef } from "@/products/scheduling/public-booking";

let store: ReturnType<typeof fakeBookingStore>;
const tenant = "northstar";
const from = "2026-11-06T00:00:00Z", to = "2026-11-07T00:00:00Z";
async function binding(input?: { requestId?: string }): Promise<PublicBookingBinding> {
  const available = await recordPublicAvailability({ tenantId: tenant, capabilityId: "consultation", name: "Consultation", range: { from, to }, includeRevoked: true, requestId: input?.requestId });
  return { ...available, tenantId: tenant, tenantStableId: "00000000-0000-4000-8000-000000000001", capabilityId: "consultation", version: 1,
    provider: "google", slots: available.slots.map(s => ({ id: `slot-${Date.parse(s.start)}`, start: s.start, end: s.end })), owner: { userId: "owner", verifiedEmail: "owner@example.test" }, workId: "schedule" };
}
function service(options: { failReceipt?: boolean; barrier?: () => Promise<void> } = {}) {
  const refs: PublicBookingReservationRef[] = [];
  const provider = vi.fn();
  const api = createPublicBookingService({ resolve: async input => { const result = await binding(input); await options.barrier?.(); return result; }, inquiries: { capture: vi.fn(async () => ({ inquiryId: "inquiry-1" })) },
    store: publicBookingStoreHook(), tokens: {
      findByRequest: async i => refs.find(r => r.requestId === i.requestId) ?? null,
      findByToken: async i => refs.find(r => r.managementToken === i.managementToken) ?? null,
      save: async value => { if (options.failReceipt) throw new Error("receipt store down"); store.publicReceipts.add(value.reservationId); const index = refs.findIndex(r => r.reservationId === value.reservationId); if (index < 0) refs.push(value); else refs[index] = value; return value; },
    }, calendar: {
      reserve: i => i.binding.recordBooking ? confirmPublicRecord(i.binding, i.reservationId) : provider(i),
      change: async i => (await changePublicRecord(i.binding, i.reservationId, i.start, i.end))!,
      cancel: async i => (await cancelPublicRecord(i.binding, i.reservationId))!,
    } });
  return { api, refs, provider };
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-01T12:00:00Z"));
  vi.stubEnv("SECRETS_ENC_KEY", "ab".repeat(32));
  vi.stubEnv("STRELVA_BOOKING_STORE_WRITE", "1"); vi.stubEnv("STRELVA_BOOKING_STORE_READ", "postgres");
  vi.stubEnv("STRELVA_BOOKING_CALENDAR_BUSY", "1"); vi.stubEnv("STRELVA_BOOKING_MESSAGES", "0");
  store = fakeBookingStore(); store.state.streakDays = 7;
  store.tenants.set(tenant, { stableId: "00000000-0000-4000-8000-000000000001", workspaceId: "workspace", systemId: "system", paused: false, phone: "555-0100",
    hours: { timezone: "America/New_York", weekly: [{ day: 5, opens: "09:00", closes: "15:00" }] },
    services: [{ id: "service", externalRef: "consultation", name: "Consultation", durationMinutes: 30, active: true }] });
  store.settings.set("00000000-0000-4000-8000-000000000001", { revision: 1, mode: "request", bufferMinutes: 15, minNoticeMinutes: 0,
    maxAdvanceDays: 60, defaultLengthMinutes: 60, maxPerDay: null, timezone: "America/New_York", bookableHours: null, bookableOverrides: null });
  setBookingStoreDb(store.db); resetBookingFlagCache(); setCalendarBusyPorts(null);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); setBookingStoreDb(undefined); resetBookingFlagCache(); setCalendarBusyPorts(undefined); });

describe("record-served public visitor bookings", () => {
  it("uses live Friday hours and service length, and refuses a removed service", async () => {
    const first = await binding();
    expect(first.slots[0]).toMatchObject({ start: "2026-11-06T14:00:00.000Z", end: "2026-11-06T14:30:00.000Z" });
    expect(first.slots.every(s => Date.parse(s.end) <= Date.parse("2026-11-06T20:00:00Z"))).toBe(true);
    store.tenants.get(tenant)!.hours!.weekly[0]!.closes = "12:00";
    const changed = await binding();
    expect(changed.slots.every(s => Date.parse(s.end) <= Date.parse("2026-11-06T17:00:00Z"))).toBe(true);
    store.tenants.get(tenant)!.services[0]!.active = false;
    await expect(recordPublicAvailability({ tenantId: tenant, capabilityId: "consultation", name: "Consultation", range: { from, to } })).rejects.toMatchObject({ code: "not_found" });
  });
  it("refuses an ambiguous display-name mapping rather than guessing another service", async () => {
    store.tenants.get(tenant)!.services.push({ id: "other-service", externalRef: "other", name: "Consultation", durationMinutes: 45, active: true });
    await expect(recordPublicAvailability({ tenantId: tenant, capabilityId: "old-grant", name: "Consultation", range: { from, to } })).rejects.toMatchObject({ code: "not_found" });
  });
  it("keeps request mode pending, stores the record buffer/service and dedupes without calendar writes", async () => {
    const { api, provider } = service(); const offered = await api.read({ tenantId: tenant, capabilityId: "consultation" });
    const input = { tenantId: tenant, capabilityId: "consultation", capabilityVersion: 1, slotId: offered.slots[0]!.id,
      visitor: { name: "Dana", email: "dana@example.test" }, requestId: "request-one-".repeat(4) };
    const receipt = await api.reserve(input);
    expect(offered.bookingAuthority).toBe("business");
    expect(receipt.status).toBe("pending"); expect((await api.reserve(input)).reservationId).toBe(receipt.reservationId);
    expect(store.rows).toHaveLength(1); expect(store.rows[0]).toMatchObject({ status: "requested", bufferMinutes: 15, serviceRef: "consultation" });
    expect(provider).not.toHaveBeenCalled();
    await expect(api.reserve({ ...input, requestId: "request-two-".repeat(4) })).rejects.toMatchObject({ code: "conflict" });
  });
  it("confirms instant bookings without a calendar, but requests owner approval when its read fails", async () => {
    store.settings.get("00000000-0000-4000-8000-000000000001")!.mode = "instant";
    const { api } = service(); const available = await api.read({ tenantId: tenant, capabilityId: "consultation" });
    const receipt = await api.reserve({ tenantId: tenant, capabilityId: "consultation", capabilityVersion: 1, slotId: available.slots[0]!.id,
      visitor: { name: "Dana", email: "dana@example.test" }, requestId: "instant-request-".repeat(3) });
    expect(receipt.status).toBe("confirmed");
    setCalendarBusyPorts({ connection: async () => ({ provider: "google", status: "error" }), busy: vi.fn() });
    const next = await api.read({ tenantId: tenant, capabilityId: "consultation" });
    const unchecked = await api.reserve({ tenantId: tenant, capabilityId: "consultation", capabilityVersion: 1, slotId: next.slots[0]!.id,
      visitor: { name: "Ada", email: "ada@example.test" }, requestId: "unchecked-request-".repeat(3) });
    expect(unchecked.status).toBe("pending");
  });
  it("reschedules under current mode and lets a paused business keep cancellation", async () => {
    const { api } = service(); let available = await api.read({ tenantId: tenant, capabilityId: "consultation" });
    const receipt = await api.reserve({ tenantId: tenant, capabilityId: "consultation", capabilityVersion: 1, slotId: available.slots[0]!.id,
      visitor: { name: "Dana", email: "dana@example.test" }, requestId: "manage-request-".repeat(3) });
    available = await api.read({ tenantId: tenant, capabilityId: "consultation" });
    const changed = await api.change({ tenantId: tenant, capabilityId: "consultation", capabilityVersion: 1, reservationId: receipt.reservationId, managementToken: receipt.managementToken, slotId: available.slots[1]!.id });
    expect(changed.status).toBe("pending"); expect(store.rows[0]!.start).toBe(changed.start);
    store.tenants.get(tenant)!.paused = true;
    expect((await api.read({ tenantId: tenant, capabilityId: "consultation" })).slots).toEqual([]);
    await expect(api.reserve({ tenantId: tenant, capabilityId: "consultation", capabilityVersion: 1, slotId: available.slots[0]!.id, visitor: { name: "Ada", email: "ada@example.test" }, requestId: "paused-request-".repeat(3) })).rejects.toMatchObject({ code: "conflict", message: "Bookings are paused right now. Call 555-0100 to reach the business." });
    await expect(api.change({ tenantId: tenant, capabilityId: "consultation", capabilityVersion: 1, reservationId: receipt.reservationId, managementToken: receipt.managementToken, slotId: available.slots[0]!.id })).rejects.toMatchObject({ code: "conflict", message: "Bookings are paused right now. Call 555-0100 to reach the business. You can still cancel your reservation." });
    expect((await api.cancel({ tenantId: tenant, reservationId: receipt.reservationId, managementToken: receipt.managementToken })).status).toBe("cancelled");
    expect(store.rows[0]!.status).toBe("cancelled");
  });
  it("simultaneous identical requests return one receipt, token and booking", async () => {
    let arrived = 0; let release!: () => void;
    const bothResolved = new Promise<void>(r => { release = r; });
    const { api } = service({ barrier: async () => { if (++arrived === 2) release(); await bothResolved; } });
    const current = await binding();
    const input = { tenantId: tenant, capabilityId: "consultation", capabilityVersion: 1, slotId: current.slots[0]!.id,
      visitor: { name: "Dana", email: "dana@example.test" }, requestId: "simultaneous-request-".repeat(3) };
    const [one, two] = await Promise.all([api.reserve(input), api.reserve(input)]);
    expect(two).toEqual(one); expect(store.rows).toHaveLength(1); expect(store.rows[0]!.status).toBe("requested");
  });
  it("concurrent reuse with different customer details refuses the changed intent without rewriting the winner", async () => {
    let arrived = 0; let release!: () => void;
    const bothResolved = new Promise<void>(r => { release = r; });
    const { api } = service({ barrier: async () => { if (++arrived === 2) release(); await bothResolved; } });
    const current = await binding();
    const input = { tenantId: tenant, capabilityId: "consultation", capabilityVersion: 1, slotId: current.slots[0]!.id,
      visitor: { name: "Dana", email: "dana@example.test" }, requestId: "changed-request-".repeat(3) };
    const results = await Promise.allSettled([api.reserve(input), api.reserve({ ...input, visitor: { name: "Ada", email: "ada@example.test" } })]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find(r => r.status === "rejected");
    expect(failed?.status === "rejected" && failed.reason).toMatchObject({ code: "conflict" });
    expect(store.rows).toHaveLength(1); expect(store.rows[0]!.status).toBe("requested");
  });
  it("a failed receipt insert releases the held slot and never confirms it", async () => {
    const { api } = service({ failReceipt: true }); const current = await binding();
    await expect(api.reserve({ tenantId: tenant, capabilityId: "consultation", capabilityVersion: 1, slotId: current.slots[0]!.id,
      visitor: { name: "Dana", email: "dana@example.test" }, requestId: "failed-receipt-".repeat(3) })).rejects.toMatchObject({ code: "unavailable" });
    expect(store.rows[0]!.status).toBe("cancelled");
    expect((await binding()).slots.some(s => s.id === current.slots[0]!.id)).toBe(true);
  });
  it("a losing receipt response cannot release the winner's durable receipt", async () => {
    const { api } = service(); const current = await binding();
    const result = await api.reserve({ tenantId: tenant, capabilityId: "consultation", capabilityVersion: 1, slotId: current.slots[0]!.id,
      visitor: { name: "Dana", email: "dana@example.test" }, requestId: "durable-receipt-".repeat(3) });
    const hook = publicBookingStoreHook()!;
    await hook.release!(current, result.reservationId);
    expect(store.rows[0]!.status).toBe("requested");
  });
  it("fails closed when the authoritative claim fails, before storing a receipt or touching a provider", async () => {
    const { api, refs, provider } = service(); const current = await binding();
    const hook = publicBookingStoreHook()!;
    store.state.down = true;
    await expect(hook.claim({ binding: current, reservationId: "reservation", requestFingerprint: "fingerprint", title: current.name, start: current.slots[0]!.start, end: current.slots[0]!.end, visitor: { name: "Dana", email: "dana@example.test" }, inquiryId: "inquiry" })).rejects.toMatchObject({ code: "unavailable" });
    await expect(api.reserve({ tenantId: tenant, capabilityId: "consultation", capabilityVersion: 1, slotId: current.slots[0]!.id, visitor: { name: "Dana", email: "dana@example.test" }, requestId: "down-request-".repeat(4) })).rejects.toMatchObject({ code: "unavailable" });
    expect(refs).toEqual([]); expect(provider).not.toHaveBeenCalled();
  });
});


it("keeps an optional phone in the native record and binds retries to it", async () => {
  const { api } = service(); const offered = await api.read({ tenantId: tenant, capabilityId: "consultation" });
  const input = { tenantId: tenant, capabilityId: "consultation", capabilityVersion: 1, slotId: offered.slots[0]!.id,
    visitor: { name: "Dana", email: "dana@example.test", phone: " 716-555-0123 " }, requestId: "phone-request-".repeat(3) };
  const receipt = await api.reserve(input); expect(store.rows[0]).toMatchObject({ customer: { phone: "716-555-0123" } });
  expect(await api.reserve(input)).toEqual(receipt);
  await expect(api.reserve({ ...input, visitor: { ...input.visitor, phone: "716-555-0999" } })).rejects.toMatchObject({ code: "conflict" });
  expect(store.rows).toHaveLength(1);
});
