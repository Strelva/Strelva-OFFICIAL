import { afterEach, describe, expect, it, vi } from "vitest";
import { bookingCalendarMirrorEnabled, mirrorBookingCalendar, type BookingCalendarMirrorPorts, type BookingCalendarService } from "@/platform/bookings/calendar-mirror";
import type { StoreBooking } from "@/platform/bookings/store";

afterEach(() => vi.unstubAllEnvs());
const booking = { id: "booking-1", status: "confirmed", start: "2026-11-01T14:00:00Z", end: "2026-11-01T14:30:00Z" } as StoreBooking;
const reserved = { requestId: booking.id, status: "reserved" as const, start: booking.start, end: booking.end };
function fixture(options: { status?: "reserved" | "accepted" | "unknown" | "writing" | "cancelled"; verification?: "verified" | "failed"; bookingStatus?: "confirmed" | "cancelled"; moved?: boolean } = {}) {
  vi.stubEnv("STRELVA_BOOKING_CALENDAR_MIRROR", "1"); vi.stubEnv("STRELVA_BOOKING_STORE_WRITE", "1"); vi.stubEnv("DUAL_WRITE_PG", "1");
  let work = { payload: { revision: 0, reservations: [{ ...reserved, status: options.status ?? "reserved", verification: options.verification, ...(options.moved ? { start: "2026-11-01T13:00:00Z", end: "2026-11-01T13:30:00Z" } : {}) }] } };
  const mutate = (status: "accepted" | "cancelled") => { work = { payload: { revision: work.payload.revision + 1, reservations: [{ ...reserved, status, verification: "verified" }] } }; return work; };
  const calendar = {
    read: vi.fn(async () => work), create: vi.fn(async () => mutate("accepted")),
    recover: vi.fn(async () => work), reschedule: vi.fn(async () => mutate("accepted")), cancel: vi.fn(async () => mutate("cancelled")),
  } satisfies BookingCalendarService;
  const ports: BookingCalendarMirrorPorts = {
    prepare: vi.fn(async () => ({ actor: { userId: "owner", verifiedEmail: "owner@example.test" }, workId: "work-1", provider: "google" as const, booking: { ...booking, status: options.bookingStatus ?? "confirmed" } })),
    calendar, finish: vi.fn(async () => undefined),
  };
  return { ports, calendar, mutate };
}

describe("booking calendar mirror", () => {
  it("defaults off and obeys the store kill switch", async () => {
    expect(bookingCalendarMirrorEnabled({})).toBe(false);
    expect(bookingCalendarMirrorEnabled({ STRELVA_BOOKING_CALENDAR_MIRROR: "1", STRELVA_BOOKING_STORE_WRITE: "1", DUAL_WRITE_PG: "0" })).toBe(false);
    const { ports } = fixture(); vi.stubEnv("STRELVA_BOOKING_CALENDAR_MIRROR", "0");
    expect(await mirrorBookingCalendar(booking.id, ports)).toBe("skipped"); expect(ports.prepare).not.toHaveBeenCalled();
  });
  it("creates the calendar copy through the governed service and stores read-back evidence", async () => {
    const { ports, calendar } = fixture();
    expect(await mirrorBookingCalendar(booking.id, ports)).toBe("verified");
    expect(calendar.create).toHaveBeenCalledWith({ userId: "owner", verifiedEmail: "owner@example.test" }, "work-1", booking.id, "google");
    expect(ports.finish).toHaveBeenCalledWith(booking.id, expect.any(String), { status: "verified", eventId: undefined });
    expect(booking.status).toBe("confirmed");
  });
  it.each(["unknown", "writing"] as const)("uses read-only recovery after %s; never repeats a provider write", async status => {
    const { ports, calendar } = fixture({ status, bookingStatus: "cancelled" });
    expect(await mirrorBookingCalendar(booking.id, ports)).toBe("unknown");
    expect(calendar.recover).toHaveBeenCalledOnce(); expect(calendar.create).not.toHaveBeenCalled(); expect(calendar.cancel).not.toHaveBeenCalled(); expect(calendar.reschedule).not.toHaveBeenCalled();
  });
  it("preserves an accepted event with failed read-back and never writes it again", async () => {
    const { ports, calendar } = fixture({ status: "accepted", verification: "failed", moved: true });
    expect(await mirrorBookingCalendar(booking.id, ports)).toBe("failed"); expect(calendar.recover).toHaveBeenCalledOnce(); expect(calendar.reschedule).not.toHaveBeenCalled(); expect(calendar.create).not.toHaveBeenCalled();
  });
  it("does not duplicate an accepted and verified copy", async () => {
    const { ports, calendar } = fixture({ status: "accepted", verification: "verified" });
    expect(await mirrorBookingCalendar(booking.id, ports)).toBe("verified"); expect(calendar.create).not.toHaveBeenCalled();
  });
  it("mirrors a confirmed reschedule through the existing revision and event guard", async () => {
    const { ports, calendar } = fixture({ status: "accepted", verification: "verified", moved: true });
    expect(await mirrorBookingCalendar(booking.id, ports)).toBe("verified");
    expect(calendar.reschedule).toHaveBeenCalledWith(expect.any(Object), "work-1", booking.id, { provider: "google", expectedRevision: 0, start: booking.start, end: booking.end });
  });
  it("cancels existing copies without checking new-booking lifecycle or availability", async () => {
    const { ports, calendar } = fixture({ status: "accepted", verification: "verified", bookingStatus: "cancelled" });
    expect(await mirrorBookingCalendar(booking.id, ports)).toBe("verified"); expect(calendar.cancel).toHaveBeenCalledOnce();
  });
  it("keeps the booking confirmed when provider sync or evidence storage fails", async () => {
    const { ports, calendar } = fixture(); calendar.create.mockRejectedValue(new Error("lost response"));
    expect(await mirrorBookingCalendar(booking.id, ports)).toBe("failed"); expect(booking.status).toBe("confirmed");
    expect(ports.finish).toHaveBeenCalledWith(booking.id, expect.any(String), expect.objectContaining({ status: "failed" }));
    calendar.create.mockResolvedValue({ payload: { revision: 2, reservations: [{ ...reserved, status: "accepted", verification: "verified" }] } });
    vi.mocked(ports.finish).mockRejectedValue(new Error("storage failed"));
    expect(await mirrorBookingCalendar(booking.id, ports)).toBe("failed");
  });
  it("does nothing when no authorized connection or another active claim exists", async () => {
    const { ports, calendar } = fixture(); vi.mocked(ports.prepare).mockResolvedValue(null);
    expect(await mirrorBookingCalendar(booking.id, ports)).toBe("skipped"); expect(calendar.read).not.toHaveBeenCalled();
  });
});
