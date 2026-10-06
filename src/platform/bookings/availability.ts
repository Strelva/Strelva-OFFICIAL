/**
 * Open times from the one store: the business record's hours, narrowed by the
 * booking settings, minus every booking that holds a slot. Pure.
 *
 * Rules (bookings spec, "Hours and services read from the record"):
 *  1. Bookable hours can only narrow. The schedule's bookable hours and
 *     overrides are intersected with the record's hours; they never open a
 *     time the business is closed.
 *  2. Where the record has no hours (a site not yet converted to a business),
 *     the booking settings' hours are the hours, which is today's behaviour.
 *  3. A service the record has removed or marked inactive is not bookable.
 *     A site whose record has no services keeps its site services.
 *
 * Slot generation reuses the legacy engine (src/lib/booking.ts generateSlots)
 * once per open range, so a store-served slot list matches the legacy list
 * for the same inputs; that is what the 7-day compare checks.
 */
import { DEFAULT_BOOKING_CONFIG, generateSlots } from "@/lib/booking";
import type { Booking, BookingConfig, DateOverride } from "@/lib/types";
import type { BookingContext, BookingSettings, RecordHours, StoreBooking, StoreBookingInput } from "./store";
import { SLOT_HOLDING_STATUSES } from "./store";

export interface TimeRange {
  opens: string;
  closes: string;
}

/** Legacy BookingConfig + overrides → booking settings (the migration's field map). */
export function legacyConfigToSettings(config: BookingConfig, overrides: DateOverride[]): BookingSettings {
  return {
    mode: "instant",
    bufferMinutes: clamp(Math.round(config.bufferTime), 0, 240),
    minNoticeMinutes: clamp(Math.round(config.bookingLeadTime * 60), 0, 525_600),
    maxAdvanceDays: clamp(Math.round(config.maxAdvanceBooking), 1, 730),
    defaultLengthMinutes: clamp(Math.round(config.slotDuration), 5, 1440),
    maxPerDay: null,
    timezone: config.timezone,
    bookableHours: config.weeklySchedule
      .filter((slot) => slot.enabled && slot.start < slot.end)
      .map((slot) => ({ day: slot.day, opens: slot.start, closes: slot.end })),
    bookableOverrides: overrides.map((o) => ({
      date: o.date,
      closed: !o.available,
      ...(o.available && o.start && o.end ? { opens: o.start, closes: o.end } : {}),
      ...(o.reason ? { label: o.reason.slice(0, 120) } : {}),
    })),
    legacyRequiresPayment: config.requirePayment === true,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** The settings a calendar uses: its own row, or the legacy default config's mapping. */
export function settingsOrDefault(context: BookingContext): BookingSettings {
  return context.settings ?? legacyConfigToSettings(DEFAULT_BOOKING_CONFIG, []);
}

export function timeZoneOf(context: BookingContext): string {
  return context.hours?.timezone ?? settingsOrDefault(context).timezone;
}

function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function recordRanges(hours: RecordHours | null, date: string | null, day: number): TimeRange[] | null {
  if (!hours) return null;
  const override = date ? hours.overrides?.find((o) => o.date === date) : undefined;
  if (override) return override.closed || !override.opens || !override.closes ? [] : [{ opens: override.opens, closes: override.closes }];
  return hours.weekly.filter((w) => w.day === day).map((w) => ({ opens: w.opens, closes: w.closes }));
}

function bookableRanges(settings: BookingSettings, date: string | null, day: number, hasRecordHours: boolean): TimeRange[] | null {
  const override = date ? settings.bookableOverrides?.find((o) => o.date === date) : undefined;
  if (override) return override.closed || !override.opens || !override.closes ? [] : [{ opens: override.opens, closes: override.closes }];
  if (settings.bookableHours) return settings.bookableHours.filter((w) => w.day === day).map((w) => ({ opens: w.opens, closes: w.closes }));
  return hasRecordHours ? null : [];
}

export function intersectRanges(a: TimeRange[], b: TimeRange[]): TimeRange[] {
  const out: TimeRange[] = [];
  for (const x of a) {
    for (const y of b) {
      const opens = x.opens > y.opens ? x.opens : y.opens;
      const closes = x.closes < y.closes ? x.closes : y.closes;
      if (opens < closes) out.push({ opens, closes });
    }
  }
  return out.sort((l, r) => l.opens.localeCompare(r.opens));
}

/** Open ranges for one local date (or, with date null, the plain weekly hours for a weekday). */
export function openRanges(context: BookingContext, date: string | null, day = date ? weekday(date) : 0): TimeRange[] {
  const settings = settingsOrDefault(context);
  const record = recordRanges(context.hours, date, day);
  const bookable = bookableRanges(settings, date, day, record !== null);
  if (record === null) return bookable ?? [];
  if (bookable === null) return record;
  return intersectRanges(record, bookable);
}

/** Parts of the legacy hours outside the record's hours: listed for the operator, never imported as open time. */
export function hoursOutsideRecord(context: BookingContext): Array<{ day: number; opens: string; closes: string }> {
  const settings = settingsOrDefault(context);
  if (!context.hours || !settings.bookableHours) return [];
  const outside: Array<{ day: number; opens: string; closes: string }> = [];
  for (const slot of settings.bookableHours) {
    const record = recordRanges(context.hours, null, slot.day) ?? [];
    const inside = intersectRanges([{ opens: slot.opens, closes: slot.closes }], record);
    const covered = inside.reduce((sum, r) => sum + minutes(r.closes) - minutes(r.opens), 0);
    if (covered < minutes(slot.closes) - minutes(slot.opens)) outside.push(slot);
  }
  return outside;
}

function minutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export type ServiceResolution =
  | { bookable: true; durationMinutes: number; name: string; businessServiceId: string | null }
  | { bookable: false; reason: "removed" | "inactive" };

/**
 * A legacy service id resolved through the record's services (`external_ref`).
 * When the record has no services, the site's own service (name and length)
 * stands, so an unconverted site behaves as today.
 */
export function resolveService(
  context: BookingContext,
  serviceId: string,
  siteService: { name: string; duration?: string | number | null } | null,
): ServiceResolution {
  const settings = settingsOrDefault(context);
  if (context.services.length > 0) {
    const service = context.services.find((s) => s.externalRef === serviceId || s.id === serviceId);
    if (!service) return { bookable: false, reason: "removed" };
    if (!service.active) return { bookable: false, reason: "inactive" };
    return { bookable: true, durationMinutes: service.durationMinutes ?? settings.defaultLengthMinutes, name: service.name, businessServiceId: service.id };
  }
  if (!siteService) return { bookable: false, reason: "removed" };
  const parsed = typeof siteService.duration === "number" ? siteService.duration : parseInt(String(siteService.duration ?? ""), 10);
  return { bookable: true, durationMinutes: Number.isFinite(parsed) && parsed > 0 ? parsed : settings.defaultLengthMinutes, name: siteService.name, businessServiceId: null };
}

/** Store rows that hold time on a calendar: held, requested, confirmed, plus imported bookings. */
export function blocksTime(booking: StoreBooking): boolean {
  return SLOT_HOLDING_STATUSES.has(booking.status) || (booking.origin === "import" && booking.status === "confirmed");
}

/** Open start times (HH:MM, local) for one date and service length. Empty when paused. */
export function storeSlotsForDate(context: BookingContext, date: string, durationMinutes: number, bookings: readonly StoreBooking[]): string[] {
  if (context.paused) return [];
  const settings = settingsOrDefault(context);
  const blocking = bookings.filter((b) => b.localDate === date && blocksTime(b));
  if (settings.maxPerDay !== null && blocking.length >= settings.maxPerDay) return [];
  const asLegacy: Booking[] = blocking.map((b) => ({
    id: b.id, serviceId: b.serviceRef ?? "", serviceName: b.serviceName, date: b.localDate,
    startTime: b.localStart, endTime: b.localEnd, clientName: b.customer.name, clientEmail: b.customer.email ?? "",
    clientPhone: b.customer.phone ?? "", status: "confirmed", createdAt: b.createdAt,
  }));
  const day = weekday(date);
  const slots = new Set<string>();
  for (const range of openRanges(context, date, day)) {
    const config: BookingConfig = {
      timezone: timeZoneOf(context),
      weeklySchedule: [{ day, start: range.opens, end: range.closes, enabled: true }],
      slotDuration: settings.defaultLengthMinutes,
      bufferTime: settings.bufferMinutes,
      bookingLeadTime: settings.minNoticeMinutes / 60,
      maxAdvanceBooking: settings.maxAdvanceDays,
      requirePayment: false,
    };
    for (const slot of generateSlots(config, date, durationMinutes, asLegacy, [])) slots.add(slot);
  }
  return [...slots].sort();
}

/** The legacy BookingConfig a store-served dashboard shows: first open range per weekday. */
export function composeLegacyConfig(context: BookingContext): BookingConfig {
  const settings = settingsOrDefault(context);
  return {
    timezone: timeZoneOf(context),
    weeklySchedule: [0, 1, 2, 3, 4, 5, 6].map((day) => {
      const first = openRanges(context, null, day)[0];
      const fallback = DEFAULT_BOOKING_CONFIG.weeklySchedule.find((s) => s.day === day)!;
      return first ? { day, start: first.opens, end: first.closes, enabled: true } : { day, start: fallback.start, end: fallback.end, enabled: false };
    }),
    slotDuration: settings.defaultLengthMinutes,
    bufferTime: settings.bufferMinutes,
    bookingLeadTime: settings.minNoticeMinutes / 60,
    maxAdvanceBooking: settings.maxAdvanceDays,
    requirePayment: settings.legacyRequiresPayment,
  };
}

/** The legacy DateOverride list a store-served dashboard shows: the calendar's own closures and special hours. */
export function composeLegacyOverrides(context: BookingContext): DateOverride[] {
  return (settingsOrDefault(context).bookableOverrides ?? []).map((o) => ({
    date: o.date,
    available: !o.closed,
    ...(o.opens ? { start: o.opens } : {}),
    ...(o.closes ? { end: o.closes } : {}),
    ...(o.label ? { reason: o.label } : {}),
  }));
}

// --- Time zones ------------------------------------------------------------

function offsetMinutes(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60_000);
}

/** A local wall-clock date and time in an IANA zone → UTC ISO. Handles DST (a skipped hour moves forward). */
export function zonedLocalToUtc(date: string, time: string, timeZone: string): string {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const naive = Date.UTC(y!, mo! - 1, d!, h!, mi!, 0);
  let utc = naive - offsetMinutes(naive, timeZone) * 60_000;
  const second = offsetMinutes(utc, timeZone);
  utc = naive - second * 60_000;
  return new Date(utc).toISOString();
}

// --- Legacy booking ↔ store booking ------------------------------------------

/** A legacy `Booking` as a store booking (field map in the bookings spec). */
export function legacyBookingToStoreInput(booking: Booking, options: { timeZone: string; bufferMinutes: number; reason?: string }): StoreBookingInput {
  const start = zonedLocalToUtc(booking.date, booking.startTime, options.timeZone);
  let end = zonedLocalToUtc(booking.date, booking.endTime, options.timeZone);
  // A booking that runs past midnight local ends the next day.
  if (Date.parse(end) <= Date.parse(start)) end = new Date(Date.parse(end) + 24 * 60 * 60 * 1000).toISOString();
  return {
    legacyId: booking.id,
    status: booking.status === "requested" ? "requested" : booking.status,
    origin: "legacy",
    serviceRef: booking.serviceId || undefined,
    serviceName: (booking.serviceName || "Appointment").slice(0, 160),
    start,
    end,
    bufferMinutes: clamp(options.bufferMinutes, 0, 240),
    timeZone: options.timeZone,
    customer: {
      name: (booking.clientName || "Customer").slice(0, 160),
      ...(booking.clientEmail ? { email: booking.clientEmail.slice(0, 320) } : {}),
      ...(booking.clientPhone ? { phone: booking.clientPhone.slice(0, 80) } : {}),
    },
    ...(booking.notes ? { intakeAnswers: { notes: booking.notes.slice(0, 5000) } } : {}),
    createdAt: booking.createdAt,
    ...(booking.cancelledAt ? { cancelledAt: booking.cancelledAt } : {}),
    ...(options.reason ? { reason: options.reason } : {}),
  };
}

/**
 * A store booking in the legacy `Booking` shape the dashboard and widget read.
 * Held bookings (an agent's unconfirmed hold) are not shown. Declined reads
 * as cancelled and no-show as completed, the nearest legacy states.
 */
export function storeBookingToLegacy(booking: StoreBooking): Booking | null {
  if (booking.status === "held") return null;
  const status: Booking["status"] = booking.status === "declined" ? "cancelled"
    : booking.status === "no_show" ? "completed"
      : booking.status;
  return {
    id: booking.legacyId ?? booking.id,
    serviceId: booking.serviceRef ?? "",
    serviceName: booking.serviceName,
    date: booking.localDate,
    startTime: booking.localStart,
    endTime: booking.localEnd,
    clientName: booking.customer.name,
    clientEmail: booking.customer.email ?? "",
    clientPhone: booking.customer.phone ?? "",
    ...(booking.intakeAnswers.notes ? { notes: booking.intakeAnswers.notes } : {}),
    status,
    createdAt: booking.createdAt,
    ...(booking.cancelledAt ? { cancelledAt: booking.cancelledAt } : {}),
  };
}

/** The fields parity compares for one legacy booking: what a person would notice. */
export function legacyBookingDigest(booking: Booking): string {
  return [booking.id, booking.status, booking.date, booking.startTime, booking.endTime, booking.serviceName, booking.clientName, booking.clientEmail.toLowerCase()].join("|");
}
