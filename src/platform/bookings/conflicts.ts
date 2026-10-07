import { PublicBookingError } from "./errors";
import { bookingReadSource } from "./flags";
import { nativeSlots } from "./native";

export interface BookingAlternatives {
  timeZone: string;
  nextSlots: Array<{ id: string; start: string; end: string }>;
}

/** Conflict suggestions are fresh offers, never commitments. Gate the additive
 * response with the same authority flip; unavailable reads leave the refusal intact. */
export async function bookingConflictAlternatives(error: unknown, read: () => Promise<{ timeZone: string; slots: BookingAlternatives["nextSlots"] }>): Promise<Partial<BookingAlternatives>> {
  if (!(error instanceof PublicBookingError) || error.code !== "conflict" || error.status === 429 || await bookingReadSource() !== "postgres") return {};
  try {
    const offered = await read();
    return { timeZone: offered.timeZone, nextSlots: offered.slots.slice(0, 3).map(({ id, start, end }) => ({ id, start, end })) };
  } catch { return {}; }
}

export function bookingAlternativeRange(now = new Date()) {
  return { from: now.toISOString(), to: new Date(now.getTime() + 14 * 86400000).toISOString() };
}

export async function nativeBookingAlternatives(tenant: string, serviceId: string) {
  const range = bookingAlternativeRange();
  return nativeSlots(tenant, serviceId, range.from, range.to);
}
