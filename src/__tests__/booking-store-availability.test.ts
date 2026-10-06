import { describe, expect, it } from "vitest";
import {
  composeLegacyConfig,
  composeLegacyOverrides,
  hoursOutsideRecord,
  intersectRanges,
  legacyBookingToStoreInput,
  legacyConfigToSettings,
  openRanges,
  resolveService,
  storeBookingToLegacy,
  zonedLocalToUtc,
} from "@/platform/bookings/availability";
import { DEFAULT_BOOKING_CONFIG } from "@/lib/booking";
import type { BookingContext, StoreBooking } from "@/platform/bookings/store";
import { bookingReadMode, bookingReadSource, bookingStoreWriteEnabled, resetBookingFlagCache } from "@/platform/bookings/flags";

// Pure rules of the one booking store: the field map from src/lib/booking.ts,
// hours that only narrow, services from the record, and local times across DST.

function context(over: Partial<BookingContext> = {}): BookingContext {
  return {
    tenantStableId: "s", workspaceId: "w", systemId: null, paused: false, phone: null,
    hours: { timezone: "America/New_York", weekly: [{ day: 5, opens: "09:00", closes: "12:00" }, { day: 5, opens: "13:00", closes: "17:00" }] },
    services: [],
    settings: { ...legacyConfigToSettings(DEFAULT_BOOKING_CONFIG, []), bookableHours: null, bookableOverrides: null },
    ...over,
  };
}

describe("legacy field map", () => {
  it("maps BookingConfig and overrides to booking settings", () => {
    const settings = legacyConfigToSettings({ ...DEFAULT_BOOKING_CONFIG, bookingLeadTime: 24, bufferTime: 10, slotDuration: 45, maxAdvanceBooking: 30, requirePayment: true },
      [{ date: "2026-12-24", available: false, reason: "Holiday" }, { date: "2026-12-26", available: true, start: "10:00", end: "12:00" }]);
    expect(settings).toMatchObject({
      bufferMinutes: 10, minNoticeMinutes: 1440, maxAdvanceDays: 30, defaultLengthMinutes: 45, timezone: "America/New_York", legacyRequiresPayment: true,
      bookableHours: [{ day: 2, opens: "12:00", closes: "18:00" }, { day: 3, opens: "10:00", closes: "16:00" }, { day: 4, opens: "12:00", closes: "18:00" }, { day: 5, opens: "10:00", closes: "16:00" }],
      bookableOverrides: [{ date: "2026-12-24", closed: true, label: "Holiday" }, { date: "2026-12-26", closed: false, opens: "10:00", closes: "12:00" }],
    });
  });

  it("maps a legacy booking to the store and back unchanged", () => {
    const booking = { id: "bk_1", serviceId: "svc", serviceName: "Massage", date: "2026-11-06", startTime: "10:00", endTime: "11:00", clientName: "Dana", clientEmail: "dana@example.test",
      clientPhone: "716", notes: "Back pain", status: "confirmed" as const, createdAt: "2026-10-01T12:00:00.000Z" };
    const input = legacyBookingToStoreInput(booking, { timeZone: "America/New_York", bufferMinutes: 15 });
    expect(input).toMatchObject({ legacyId: "bk_1", origin: "legacy", start: "2026-11-06T15:00:00.000Z", end: "2026-11-06T16:00:00.000Z", serviceRef: "svc", intakeAnswers: { notes: "Back pain" } });
    const stored = {
      id: "uuid", calendarKey: "s", tenantStableId: "s", tenantId: "t1", workspaceId: null, systemId: null, status: "confirmed", origin: "legacy", serviceRef: "svc",
      businessServiceId: null, serviceName: "Massage", start: input.start, end: input.end, bufferMinutes: 15, timeZone: "America/New_York", localDate: "2026-11-06",
      localStart: "10:00", localEnd: "11:00", customer: { name: "Dana", email: "dana@example.test", phone: "716" }, contactId: null, intakeAnswers: { notes: "Back pain" },
      inquiryId: null, legacyId: "bk_1", publicReservationId: null, externalSource: null, externalRef: null, recordedVia: "backfill", createdAt: booking.createdAt, cancelledAt: null,
    } as StoreBooking;
    expect(storeBookingToLegacy(stored)).toEqual(booking);
    expect(storeBookingToLegacy({ ...stored, status: "held" })).toBeNull();
    expect(storeBookingToLegacy({ ...stored, legacyId: null, status: "declined" })).toMatchObject({ id: "uuid", status: "cancelled" });
  });
});

describe("time zones", () => {
  it("converts local wall time to UTC on both sides of DST", () => {
    expect(zonedLocalToUtc("2026-10-30", "09:00", "America/New_York")).toBe("2026-10-30T13:00:00.000Z");
    expect(zonedLocalToUtc("2026-11-01", "09:00", "America/New_York")).toBe("2026-11-01T14:00:00.000Z");
    expect(zonedLocalToUtc("2026-03-08", "01:30", "America/New_York")).toBe("2026-03-08T06:30:00.000Z");
    expect(zonedLocalToUtc("2026-03-08", "09:00", "America/New_York")).toBe("2026-03-08T13:00:00.000Z");
    expect(zonedLocalToUtc("2026-07-01", "09:00", "Europe/London")).toBe("2026-07-01T08:00:00.000Z");
  });

  it("a booking that crosses midnight ends the next day", () => {
    const input = legacyBookingToStoreInput({ id: "bk", serviceId: "s", serviceName: "Late", date: "2026-11-06", startTime: "23:30", endTime: "00:30", clientName: "A",
      clientEmail: "", clientPhone: "", status: "confirmed", createdAt: "2026-10-01T00:00:00.000Z" }, { timeZone: "America/New_York", bufferMinutes: 0 });
    expect(Date.parse(input.end) - Date.parse(input.start)).toBe(60 * 60 * 1000);
  });
});

describe("hours only narrow", () => {
  it("record hours alone, with split ranges", () => {
    expect(openRanges(context(), "2026-11-06")).toEqual([{ opens: "09:00", closes: "12:00" }, { opens: "13:00", closes: "17:00" }]);
    expect(openRanges(context(), "2026-11-07")).toEqual([]);
  });

  it("bookable hours intersect; they never open a closed day or time", () => {
    const narrowed = context({ settings: { ...context().settings!, bookableHours: [{ day: 5, opens: "08:00", closes: "14:00" }, { day: 6, opens: "09:00", closes: "12:00" }] } });
    expect(openRanges(narrowed, "2026-11-06")).toEqual([{ opens: "09:00", closes: "12:00" }, { opens: "13:00", closes: "14:00" }]);
    expect(openRanges(narrowed, "2026-11-07")).toEqual([]);
    expect(hoursOutsideRecord(narrowed)).toEqual([{ day: 5, opens: "08:00", closes: "14:00" }, { day: 6, opens: "09:00", closes: "12:00" }]);
  });

  it("a record closure wins over a bookable override; a bookable closure narrows an open day", () => {
    const ctx = context({
      hours: { timezone: "America/New_York", weekly: [{ day: 5, opens: "09:00", closes: "17:00" }], overrides: [{ date: "2026-11-27", closed: true }] },
      settings: { ...context().settings!, bookableOverrides: [{ date: "2026-11-27", closed: false, opens: "10:00", closes: "12:00" }, { date: "2026-11-06", closed: true }] },
    });
    expect(openRanges(ctx, "2026-11-27")).toEqual([]);
    expect(openRanges(ctx, "2026-11-06")).toEqual([]);
    expect(openRanges(ctx, "2026-11-13")).toEqual([{ opens: "09:00", closes: "17:00" }]);
  });

  it("intersects ranges", () => {
    expect(intersectRanges([{ opens: "09:00", closes: "12:00" }], [{ opens: "11:00", closes: "13:00" }])).toEqual([{ opens: "11:00", closes: "12:00" }]);
    expect(intersectRanges([{ opens: "09:00", closes: "10:00" }], [{ opens: "10:00", closes: "11:00" }])).toEqual([]);
  });

  it("the dashboard sees the first open range per weekday and its own closures", () => {
    const ctx = context({ settings: { ...context().settings!, bookableOverrides: [{ date: "2026-12-24", closed: true, label: "Holiday" }] } });
    const config = composeLegacyConfig(ctx);
    expect(config.weeklySchedule.find((d) => d.day === 5)).toEqual({ day: 5, start: "09:00", end: "12:00", enabled: true });
    expect(config.weeklySchedule.find((d) => d.day === 1)).toMatchObject({ enabled: false });
    expect(composeLegacyOverrides(ctx)).toEqual([{ date: "2026-12-24", available: false, reason: "Holiday" }]);
  });
});

describe("services from the record", () => {
  it("record services decide; a site without record services keeps its own", () => {
    const withRecord = context({ services: [{ id: "u1", name: "Consult", durationMinutes: null, active: true, externalRef: "svc" }, { id: "u2", name: "Old", durationMinutes: 30, active: false, externalRef: "old" }] });
    expect(resolveService(withRecord, "svc", { name: "Site name", duration: "90" })).toEqual({ bookable: true, durationMinutes: 60, name: "Consult", businessServiceId: "u1" });
    expect(resolveService(withRecord, "old", null)).toEqual({ bookable: false, reason: "inactive" });
    expect(resolveService(withRecord, "gone", { name: "Gone", duration: "30" })).toEqual({ bookable: false, reason: "removed" });
    expect(resolveService(context(), "svc", { name: "Site name", duration: "90" })).toEqual({ bookable: true, durationMinutes: 90, name: "Site name", businessServiceId: null });
  });
});

describe("switches fail closed", () => {
  it("reads never leave legacy without writes, and a typo is legacy", async () => {
    resetBookingFlagCache();
    expect(bookingReadMode({ STRELVA_BOOKING_STORE_READ: "Postgres" })).toBe("legacy");
    expect(await bookingReadSource({ env: { STRELVA_BOOKING_STORE_READ: "postgres" }, db: null })).toBe("legacy");
    expect(bookingStoreWriteEnabled({ STRELVA_BOOKING_STORE_WRITE: "1", DUAL_WRITE_PG: "0" })).toBe(false);
    expect(bookingStoreWriteEnabled({ STRELVA_BOOKING_STORE_WRITE: "1" })).toBe(true);
    const failing = { rpc: async () => ({ data: null, error: { message: "down" } }) };
    expect(await bookingReadSource({ env: { STRELVA_BOOKING_STORE_READ: "postgres", STRELVA_BOOKING_STORE_WRITE: "1" }, db: failing as never })).toBe("compare");
    const short = { rpc: async () => ({ data: { days: 6 }, error: null }) };
    resetBookingFlagCache();
    expect(await bookingReadSource({ env: { STRELVA_BOOKING_STORE_READ: "postgres", STRELVA_BOOKING_STORE_WRITE: "1" }, db: short as never })).toBe("compare");
  });
});
