import type { BookingConfig, DateOverride, Booking } from "./types";

export const DEFAULT_BOOKING_CONFIG: BookingConfig = {
  timezone: "America/New_York",
  weeklySchedule: [
    { day: 0, start: "09:00", end: "17:00", enabled: false },
    { day: 1, start: "09:00", end: "17:00", enabled: false },
    { day: 2, start: "12:00", end: "18:00", enabled: true },
    { day: 3, start: "10:00", end: "16:00", enabled: true },
    { day: 4, start: "12:00", end: "18:00", enabled: true },
    { day: 5, start: "10:00", end: "16:00", enabled: true },
    { day: 6, start: "09:00", end: "17:00", enabled: false },
  ],
  slotDuration: 60,
  bufferTime: 15,
  bookingLeadTime: 24,
  maxAdvanceBooking: 60,
  requirePayment: false,
};

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function dayOfWeekForDate(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function zonedNowAsUtcTimestamp(timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );

  const hour = values.hour === 24 ? 0 : values.hour;
  return Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    hour,
    values.minute,
    values.second
  );
}

/**
 * The tenant's LOCAL calendar day (YYYY-MM-DD) for a given instant. Bookings
 * store their date as the tenant-local day, so "today" must be resolved in the
 * tenant's timezone — a plain `new Date().toISOString()` is UTC and rolls to
 * tomorrow after ~8pm ET, hiding tonight's appointments. `en-CA` formats as
 * YYYY-MM-DD. `now` is injectable for deterministic tests.
 */
export function zonedTodayIso(timezone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
}

function localSlotAsUtcTimestamp(date: string, time: string): number {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return Date.UTC(year, month - 1, day, hour, minute, 0);
}

export function generateSlots(
  config: BookingConfig,
  date: string,
  serviceDuration: number,
  existingBookings: Booking[],
  overrides: DateOverride[]
): string[] {
  const dayOfWeek = dayOfWeekForDate(date);

  // Check date override
  const override = overrides.find((o) => o.date === date);
  if (override && !override.available) return [];

  let startTime: string;
  let endTime: string;

  if (override?.available && override.start && override.end) {
    startTime = override.start;
    endTime = override.end;
  } else {
    const schedule = config.weeklySchedule.find((s) => s.day === dayOfWeek);
    if (!schedule || !schedule.enabled) return [];
    startTime = schedule.start;
    endTime = schedule.end;
  }

  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  const totalSlotTime = serviceDuration + config.bufferTime;

  // Get booked time ranges for this date
  const bookedRanges = existingBookings
    .filter((b) => b.date === date && b.status !== "cancelled")
    .map((b) => ({
      start: timeToMinutes(b.startTime),
      end: timeToMinutes(b.endTime) + config.bufferTime,
    }));

  const slots: string[] = [];
  let current = startMinutes;

  while (current + serviceDuration <= endMinutes) {
    const slotEnd = current + serviceDuration;

    // Check if slot overlaps with any booking
    const overlaps = bookedRanges.some(
      (r) => current < r.end && slotEnd > r.start
    );

    if (!overlaps) {
      slots.push(minutesToTime(current));
    }

    current += totalSlotTime;
  }

  // Check lead time — filter out slots that are too soon
  const leadTimeMs = config.bookingLeadTime * 60 * 60 * 1000;
  const minBookingTime = zonedNowAsUtcTimestamp(config.timezone) + leadTimeMs;

  return slots.filter((slot) => {
    const slotTime = localSlotAsUtcTimestamp(date, slot);
    return slotTime > minBookingTime;
  });
}

export function isDateBookable(
  config: BookingConfig,
  date: string,
  overrides: DateOverride[]
): boolean {
  const dayOfWeek = dayOfWeekForDate(date);

  const override = overrides.find((o) => o.date === date);
  if (override) return override.available;

  const schedule = config.weeklySchedule.find((s) => s.day === dayOfWeek);
  return !!schedule?.enabled;
}

export function generateBookingId(): string {
  return `bk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
