import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBookingStore } from "./support/booking-store-fake";
import { recordBooking, readTenantBookings, setBookingStoreDb, type StoreBooking } from "@/platform/bookings/store";
import { setCalendarBusyPorts } from "@/platform/bookings/calendar-busy";
import { nextOpenTimes } from "@/platform/bookings/lifecycle-ports";
import { changeNativeBooking, nativeSlots } from "@/platform/bookings/native";

let store: ReturnType<typeof fakeBookingStore>;
let booking: StoreBooking;
let changes: Array<Record<string, unknown>>;
const tenant = "mooney";
const now = new Date("2026-11-02T12:00:00Z");
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
  vi.stubEnv("STRELVA_BOOKING_CALENDAR_BUSY", "1");
  store = fakeBookingStore(); changes = [];
  store.tenants.set(tenant, { stableId: "calendar", workspaceId: "workspace", systemId: "bookings", paused: false, phone: null,
    hours: { timezone: "America/New_York", weekly: [{ day: 5, opens: "09:00", closes: "15:00" }] },
    services: [{ id: "consultation", externalRef: "consult", name: "Consultation", durationMinutes: 75, active: true }] });
  store.settings.set("calendar", { revision: 1, mode: "instant", bufferMinutes: 15, minNoticeMinutes: 0, maxAdvanceDays: 60,
    defaultLengthMinutes: 60, maxPerDay: null, timezone: "America/New_York", bookableHours: null, bookableOverrides: null });
  const recorded = await recordBooking(tenant, { legacyId: "existing-booking", origin: "site", status: "confirmed", serviceRef: "consult", serviceName: "Consultation",
    start: "2026-11-06T14:00:00Z", end: "2026-11-06T14:30:00Z", bufferMinutes: 15, timeZone: "America/New_York", customer: { name: "Dana", email: "dana@example.test" } }, "native", store.db);
  if (recorded.status === "conflict") throw new Error("fixture conflict");
  booking = recorded.booking;
  setBookingStoreDb({ rpc(name, args) {
    if (name === "read_native_booking_access") return Promise.resolve({ data: { ...booking, siteName: "Mooney", confirmationRequired: false }, error: null });
    if (name === "change_native_booking") {
      changes.push(args.p_change as Record<string, unknown>);
      return Promise.resolve({ data: { ...booking, ...(args.p_change as Record<string, unknown>) }, error: null });
    }
    return store.db.rpc(name, args);
  } });
  setCalendarBusyPorts(null);
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); setBookingStoreDb(undefined); setCalendarBusyPorts(undefined); });

describe("booking changes follow the current service contract", () => {
  it("reschedules a formerly 30-minute booking to the service's current 75-minute slot", async () => {
    const changed = await changeNativeBooking("manage-hash", "reschedule", "2026-11-06T15:30:00Z");
    expect(changed.start).toBe("2026-11-06T15:30:00.000Z");
    expect(changed.end).toBe("2026-11-06T16:45:00.000Z");
    expect(changes[0]).toMatchObject({ action: "reschedule", start: changed.start, end: changed.end, forceRequest: false });
  });
  it("expired-request alternatives use the current length and omit provider-busy slots", async () => {
    setCalendarBusyPorts({ connection: async () => ({ provider: "google", status: "connected" }), busy: async () => [{ start: "2026-11-06T15:30:00Z", end: "2026-11-06T16:45:00Z" }] });
    const offered = await nativeSlots(tenant, "consult", now.toISOString(), new Date(now.getTime() + 14 * 86400000).toISOString());
    expect(offered.slots[0]).toMatchObject({ start: "2026-11-06T17:00:00.000Z", end: "2026-11-06T18:15:00.000Z" });
    const alternatives = await nextOpenTimes(booking, now);
    expect(alternatives[0]).toBe("Fri, Nov 6 at 12:00 PM (America/New_York)");
    expect(alternatives).toHaveLength(3);
  });
  it("removed services produce no new alternatives or reschedules and keep the original booking", async () => {
    store.tenants.get(tenant)!.services[0]!.active = false;
    expect(await nextOpenTimes(booking, now)).toEqual([]);
    await expect(changeNativeBooking("manage-hash", "reschedule", "2026-11-06T15:30:00Z")).rejects.toMatchObject({ code: "not_found" });
    expect(changes).toEqual([]); expect((await readTenantBookings(tenant))[0]).toMatchObject({ start: booking.start, end: booking.end, status: "confirmed" });
  });
  it("pause and unavailable storage produce no alternative times", async () => {
    store.tenants.get(tenant)!.paused = true;
    expect(await nextOpenTimes(booking, now)).toEqual([]);
    store.tenants.get(tenant)!.paused = false; store.state.down = true;
    expect(await nextOpenTimes(booking, now)).toEqual([]);
  });
});
