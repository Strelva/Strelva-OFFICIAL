/**
 * Switches for moving bookings into the one store (bookings spec, "Moving
 * today's bookings", steps 3 to 6). All off by default; each production flip
 * is Jacob's yes.
 *
 *   STRELVA_BOOKING_STORE_WRITE=1   dual-write: both route families also write
 *                                   the one store. A failed store write never
 *                                   fails the visitor; it is queued and retried.
 *                                   DUAL_WRITE_PG=0 turns it off too.
 *   STRELVA_BOOKING_STORE_READ      legacy (default) | compare | postgres.
 *     compare   serve the legacy stores, compute the store's answer beside it
 *               and log any difference (bookings and offered slots).
 *     postgres  serve the one store, but only after 7 consecutive days of
 *               parity (client_record_parity_streak('bookings')) and only with
 *               the write switch on. Until then it acts as compare. Rollback is
 *               setting it back: both stores keep receiving every write.
 *   STRELVA_BOOKING_OWNER_NOTICE=1  the "New booking" owner email, through the
 *                                   owner-recipient rule.
 */
import { bookingStoreDb, type BookingStoreDb } from "./store";

export type BookingReadMode = "legacy" | "compare" | "postgres";
export const BOOKING_PARITY_STORE = "bookings";
export const BOOKING_PARITY_DAYS_REQUIRED = 7;
const STREAK_CACHE_MS = 5 * 60 * 1000;

type Env = Partial<Record<string, string | undefined>>;

export function bookingStoreWriteEnabled(env: Env = process.env): boolean {
  // DUAL_WRITE_PG=0 is the kill switch for every Postgres mirror (src/lib/db/dual-write.ts).
  const killed = env.DUAL_WRITE_PG === "0" || env.DUAL_WRITE_PG === "false";
  return env.STRELVA_BOOKING_STORE_WRITE?.trim() === "1" && !killed;
}

export function bookingReadMode(env: Env = process.env): BookingReadMode {
  const value = env.STRELVA_BOOKING_STORE_READ?.trim();
  return value === "compare" || value === "postgres" ? value : "legacy";
}

export function bookingOwnerNoticeEnabled(env: Env = process.env): boolean {
  return env.STRELVA_BOOKING_OWNER_NOTICE?.trim() === "1";
}

/**
 * STRELVA_BOOKING_REMINDERS=1 turns on the `booking-reminders` cron's work:
 * customer reminders (24 h and 2 h), the owner's one 24-hour chase of a
 * request, the 72-hour request lapse and the 15-minute hold sweep. It also
 * needs the store's write switch: the cron acts on the one store only.
 * Every email still goes through the one send path and its audience gates.
 */
export function bookingRemindersEnabled(env: Env = process.env): boolean {
  return env.STRELVA_BOOKING_REMINDERS?.trim() === "1" && bookingStoreWriteEnabled(env);
}

/** STRELVA_BOOKING_MANAGE_PAGE=1 serves the customer manage link (/b/[token]) and puts it in reminders. */
export function bookingManagePageEnabled(env: Env = process.env): boolean {
  return env.STRELVA_BOOKING_MANAGE_PAGE?.trim() === "1";
}

/**
 * STRELVA_BOOKING_CALENDAR_BUSY=1 subtracts a connected Google or Outlook
 * calendar's busy times from the tenant routes' store-served slots (60-second
 * cache). A failed read never refuses a booking: slots are offered and an
 * instant booking becomes a request for that booking.
 */
export function bookingCalendarBusyEnabled(env: Env = process.env): boolean {
  return env.STRELVA_BOOKING_CALENDAR_BUSY?.trim() === "1";
}

let streakCache: { days: number; at: number } | null = null;
export function resetBookingFlagCache(): void {
  streakCache = null;
}

/** The read source in force. Without the switch this does no I/O. */
export async function bookingReadSource(options: { env?: Env; db?: BookingStoreDb | null; now?: number } = {}): Promise<BookingReadMode> {
  const mode = bookingReadMode(options.env);
  if (mode === "legacy") return "legacy";
  // Reads never move to a store that isn't receiving writes.
  if (!bookingStoreWriteEnabled(options.env)) return "legacy";
  if (mode === "compare") return "compare";
  const now = options.now ?? Date.now();
  if (streakCache && now - streakCache.at < STREAK_CACHE_MS) {
    return streakCache.days >= BOOKING_PARITY_DAYS_REQUIRED ? "postgres" : "compare";
  }
  const db = options.db === undefined ? bookingStoreDb() : options.db;
  if (!db) return "legacy";
  try {
    const { data, error } = await db.rpc("client_record_parity_streak", { p_store: BOOKING_PARITY_STORE });
    if (error) return "compare";
    const days = Number((data as { days?: unknown } | null)?.days ?? 0);
    streakCache = { days: Number.isFinite(days) ? days : 0, at: now };
    return streakCache.days >= BOOKING_PARITY_DAYS_REQUIRED ? "postgres" : "compare";
  } catch {
    return "compare";
  }
}
