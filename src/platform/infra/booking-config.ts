/** Canonical default booking configuration shared by legacy and workspace adapters. */
export const DEFAULT_BOOKING_CONFIG = {
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
