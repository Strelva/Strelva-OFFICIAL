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

export function generateSlots(
  config: BookingConfig,
  date: string,
  serviceDuration: number,
  existingBookings: Booking[],
  overrides: DateOverride[]
): string[] {
  const dateObj = new Date(date + "T00:00:00");
  const dayOfWeek = dateObj.getDay();

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
  const now = new Date();
  const leadTimeMs = config.bookingLeadTime * 60 * 60 * 1000;
  const minBookingTime = new Date(now.getTime() + leadTimeMs);

  return slots.filter((slot) => {
    const slotDate = new Date(`${date}T${slot}:00`);
    return slotDate > minBookingTime;
  });
}

export function isDateBookable(
  config: BookingConfig,
  date: string,
  overrides: DateOverride[]
): boolean {
  const dateObj = new Date(date + "T00:00:00");
  const dayOfWeek = dateObj.getDay();

  const override = overrides.find((o) => o.date === date);
  if (override) return override.available;

  const schedule = config.weeklySchedule.find((s) => s.day === dayOfWeek);
  return !!schedule?.enabled;
}

export function generateBookingId(): string {
  return `bk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
