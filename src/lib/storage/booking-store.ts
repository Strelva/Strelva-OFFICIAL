/**
 * Booking storage - appointments, availability, and config.
 *
 * When DATA_SOURCE=postgres, the individual-booking functions (getBookings,
 * createBooking, updateBooking) read/write the Postgres `bookings` table;
 * otherwise they use the dev-file store.
 *
 * NOTE: only the `bookings` table exists in Postgres. There is no table for
 * BookingConfig or DateOverride — those are tableless per-tenant config, stored
 * as a Redis blob (`reb:booking:config:*` / `reb:booking:overrides:*`, the same
 * pattern as report-cadence/CRM) with the dev-file store as the local fallback
 * when Redis is absent. The Redis slot-lock layer is a separate concern and is
 * preserved as-is.
 */

import type { BookingConfig, DateOverride, Booking } from "../types";
import { DEFAULT_BOOKING_CONFIG, generateBookingId, generateSlots } from "../booking";
import { getRedis } from "../redis";
import { DEFAULT_TENANT, readDevContent, writeDevContent } from "./core";
import { getContent } from "./content-store";
import { dataSourceIsPostgres } from "../db/source-flags";
import { getSupabase, type Row, type Insert, type Update } from "../db/client";

// --- Authoritative Postgres `bookings` helpers -----------------------------

function bookingDb(operation: string): NonNullable<ReturnType<typeof getSupabase>> {
  const db = getSupabase();
  if (!db) throw new Error(`[bookings] ${operation} failed: Supabase is not configured`);
  return db;
}

/** Map a Postgres bookings row to the store's camelCase Booking shape. */
function mapPgBookingRow(row: Row<"bookings">): Booking {
  return {
    id: row.id,
    serviceId: row.service_id,
    serviceName: row.service_name,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    clientName: row.client_name,
    clientEmail: row.client_email,
    clientPhone: row.client_phone,
    notes: row.notes ?? undefined,
    status: row.status as Booking["status"],
    createdAt: row.created_at,
    cancelledAt: row.cancelled_at ?? undefined,
  };
}

/** Build a bookings Insert row from a fully-formed Booking + tenant. */
function bookingToInsert(booking: Booking, tenant: string): Insert<"bookings"> {
  return {
    id: booking.id,
    tenant_id: tenant,
    service_id: booking.serviceId,
    service_name: booking.serviceName,
    date: booking.date,
    start_time: booking.startTime,
    end_time: booking.endTime,
    client_name: booking.clientName,
    client_email: booking.clientEmail,
    client_phone: booking.clientPhone,
    notes: booking.notes ?? null,
    status: booking.status,
    created_at: booking.createdAt,
    cancelled_at: booking.cancelledAt ?? null,
  };
}

async function pgListBookings(
  tenant: string,
  dateRange?: { from: string; to: string }
): Promise<Booking[]> {
  const db = bookingDb(`list ${tenant}`);
  let q = db.from("bookings").select("*").eq("tenant_id", tenant);
  if (dateRange) {
    q = q.gte("date", dateRange.from).lte("date", dateRange.to);
  }
  const { data, error } = await q.order("date", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as Row<"bookings">[]).map(mapPgBookingRow);
}

async function pgInsertBooking(booking: Booking, tenant: string): Promise<void> {
  const db = bookingDb(`insert ${booking.id}`);
  const { error } = await db.from("bookings").insert(bookingToInsert(booking, tenant));
  if (error) throw error;
}

async function pgGetBooking(id: string, tenant: string): Promise<Booking | null> {
  const db = bookingDb(`read ${tenant}/${id}`);
  const { data, error } = await db
    .from("bookings")
    .select("*")
    .eq("tenant_id", tenant)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapPgBookingRow(data as Row<"bookings">) : null;
}

async function pgUpdateBooking(
  id: string,
  tenant: string,
  updates: Partial<Pick<Booking, "status" | "notes" | "cancelledAt">>
): Promise<void> {
  const db = bookingDb(`update ${tenant}/${id}`);
  const patch: Update<"bookings"> = {};
  if (updates.status !== undefined) patch.status = updates.status;
  if (updates.notes !== undefined) patch.notes = updates.notes ?? null;
  if (updates.cancelledAt !== undefined) patch.cancelled_at = updates.cancelledAt ?? null;
  const { error } = await db.from("bookings").update(patch).eq("tenant_id", tenant).eq("id", id);
  if (error) throw error;
}

const bookingConfigKey = (tenant: string) => `reb:booking:config:${tenant}`;
const dateOverridesKey = (tenant: string) => `reb:booking:overrides:${tenant}`;

export async function getBookingConfig(
  tenant: string = DEFAULT_TENANT
): Promise<BookingConfig> {
  const redis = getRedis();
  if (redis) {
    // Fail CLOSED: let a Redis error propagate (the caller fails the request)
    // rather than swallow it and serve DEFAULT_BOOKING_CONFIG — default hours
    // could offer slots on a day the tenant is actually closed, or hide a day
    // it's open, on a live booking surface. A genuine miss (null) means "no
    // custom config yet" → DEFAULT is the correct answer.
    const raw = await redis.get<BookingConfig>(bookingConfigKey(tenant));
    return raw ?? DEFAULT_BOOKING_CONFIG;
  }
  const store = await readDevContent(tenant);
  return (store[`__bookingConfig_${tenant}`] as BookingConfig) ?? DEFAULT_BOOKING_CONFIG;
}

export async function setBookingConfig(
  config: BookingConfig,
  tenant: string = DEFAULT_TENANT
): Promise<void> {
  const redis = getRedis();
  if (redis) {
    // Let a real Redis write failure surface (route → 500) rather than pretend
    // the save succeeded.
    await redis.set(bookingConfigKey(tenant), config);
    return;
  }
  const store = await readDevContent(tenant);
  store[`__bookingConfig_${tenant}`] = config;
  await writeDevContent(store, tenant);
}

export async function getDateOverrides(
  tenant: string = DEFAULT_TENANT
): Promise<DateOverride[]> {
  // Closed-dates / special-hours overrides persist as a Redis blob (mirrors
  // getBookingConfig), written by setDateOverrides from the owner's Schedule
  // availability editor. The dev-file store is the local fallback when Redis is
  // absent. (These were previously authored in Sanity Studio, now decommissioned.)
  const redis = getRedis();
  if (redis) {
    // Fail CLOSED like getBookingConfig: propagate a Redis error rather than
    // silently dropping a "closed" override and accepting a booking on a day the
    // owner blocked off.
    const raw = await redis.get<DateOverride[]>(dateOverridesKey(tenant));
    return Array.isArray(raw) ? raw : [];
  }
  const store = await readDevContent(tenant);
  return (store[`__dateOverrides_${tenant}`] as DateOverride[]) ?? [];
}

export async function setDateOverrides(
  overrides: DateOverride[],
  tenant: string = DEFAULT_TENANT
): Promise<void> {
  const redis = getRedis();
  if (redis) {
    // Let a real Redis write failure surface (route → 500) rather than pretend
    // the save succeeded — same contract as setBookingConfig.
    await redis.set(dateOverridesKey(tenant), overrides);
    return;
  }
  const store = await readDevContent(tenant);
  store[`__dateOverrides_${tenant}`] = overrides;
  await writeDevContent(store, tenant);
}

export async function getBookings(
  tenant: string = DEFAULT_TENANT,
  dateRange?: { from: string; to: string }
): Promise<Booking[]> {
  if (dataSourceIsPostgres()) {
    return pgListBookings(tenant, dateRange);
  }

  const store = await readDevContent(tenant);
  let bookings = (store[`__bookings_${tenant}`] as Booking[]) ?? [];
  if (dateRange) {
    bookings = bookings.filter(
      (b) => b.date >= dateRange.from && b.date <= dateRange.to
    );
  }
  return bookings;
}

/**
 * Granularity (minutes) of the Redis slot-lock grid.
 *
 * Bookings have variable durations, so locking only the exact start-time key
 * would let two overlapping bookings (e.g. a 90-min at 10:00 and a 60-min at
 * 10:30) both succeed because their start keys differ. Instead we lock every
 * grid cell the booking *spans*. 5 minutes is fine enough to catch any realistic
 * overlap while keeping the number of keys per booking small.
 */
const SLOT_GRID_MINUTES = 5;

function slotTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function slotMinutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Compute every grid key a booking occupies, from startTime (inclusive) through
 * endTime + bufferTime (exclusive) at SLOT_GRID_MINUTES granularity. This mirrors
 * generateSlots, which reserves endTime + bufferTime against future bookings.
 *
 * The grid cell for a span point is floor(minute / grid) * grid, so a span and
 * any other span that overlaps it (even at a different start time) share at least
 * one key and therefore collide on SET NX.
 *
 * Keys are intentionally NOT scoped by serviceId: getAvailableSlots treats the
 * calendar as a single shared resource (it blocks slots that overlap ANY existing
 * booking on the date, regardless of service), so the lock must do the same or two
 * different services could be double-booked into the same window.
 */
function spanSlotKeys(
  tenant: string,
  date: string,
  startTime: string,
  endTime: string,
  bufferTime: number
): string[] {
  const startMinutes = slotTimeToMinutes(startTime);
  const endMinutes = slotTimeToMinutes(endTime) + Math.max(0, bufferTime);

  const keys: string[] = [];
  const firstCell = Math.floor(startMinutes / SLOT_GRID_MINUTES) * SLOT_GRID_MINUTES;
  for (let cell = firstCell; cell < endMinutes; cell += SLOT_GRID_MINUTES) {
    keys.push(`reb:booking:slot:${tenant}:${date}:${slotMinutesToTime(cell)}`);
  }
  // Always lock at least the start cell (handles zero/invalid durations).
  if (keys.length === 0) {
    keys.push(`reb:booking:slot:${tenant}:${date}:${slotMinutesToTime(firstCell)}`);
  }
  return keys;
}

/**
 * Atomically claim every grid cell a booking spans using Redis SET NX.
 * Returns claimed=true only if ALL cells were free; if any cell is already
 * taken, the cells claimed so far are released and claimed=false is returned.
 * Locks expire after 10 minutes to prevent stuck slots.
 */
async function claimBookingSlot(
  tenant: string,
  date: string,
  startTime: string,
  endTime: string,
  bufferTime: number
): Promise<{ claimed: boolean; release: () => Promise<void> }> {
  const redis = getRedis();
  const lockTTL = 600; // 10 minutes

  if (redis) {
    const keys = spanSlotKeys(tenant, date, startTime, endTime, bufferTime);
    const claimedKeys: string[] = [];
    const release = async () => {
      await Promise.all(claimedKeys.map((key) => redis.del(key)));
    };

    for (const key of keys) {
      // SET NX with expiry - atomic per-cell claim
      const ok = await redis.set(key, "pending", { nx: true, ex: lockTTL });
      if (!ok) {
        // Another booking already holds an overlapping cell - back out.
        await release();
        return { claimed: false, release: async () => {} };
      }
      claimedKeys.push(key);
    }

    return { claimed: true, release };
  }

  // No Redis - fall back to non-atomic behavior (acceptable for dev)
  return { claimed: true, release: async () => {} };
}

/**
 * Mark every grid cell a booking spans as booked (after successful creation).
 * Keys remain with a longer TTL so future overlap claims collide on them.
 */
async function confirmBookingSlot(
  tenant: string,
  date: string,
  startTime: string,
  endTime: string,
  bufferTime: number
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const keys = spanSlotKeys(tenant, date, startTime, endTime, bufferTime);

  // TTL must cover the entire advance-booking window so a slot confirmed far in
  // the future doesn't have its lock expire before the appointment date. Compute
  // seconds from now until midnight of the booking date plus a 24h safety margin.
  const bookingDateMs = new Date(`${date}T00:00:00Z`).getTime() + 24 * 60 * 60 * 1000;
  const ttlSeconds = Math.max(
    Math.ceil((bookingDateMs - Date.now()) / 1000),
    172800 // minimum 48h for same-day or past-date edge cases
  );

  await Promise.all(
    keys.map((key) => redis.set(key, "confirmed", { ex: ttlSeconds }))
  );
}

/**
 * Check if any grid cell a booking would span is already claimed/booked in Redis.
 */
export async function isSlotClaimed(
  tenant: string,
  date: string,
  startTime: string,
  endTime: string,
  bufferTime: number
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;

  const keys = spanSlotKeys(tenant, date, startTime, endTime, bufferTime);
  const values = await Promise.all(keys.map((key) => redis.get(key)));
  return values.some((value) => !!value);
}

export async function createBooking(
  booking: Omit<Booking, "id" | "createdAt" | "status">,
  tenant: string = DEFAULT_TENANT
): Promise<Booking> {
  const bookingId = generateBookingId();
  const { bufferTime } = await getBookingConfig(tenant);

  const newBooking: Booking = {
    ...booking,
    id: bookingId,
    status: "confirmed",
    createdAt: new Date().toISOString(),
  };

  if (dataSourceIsPostgres()) {
    await pgInsertBooking(newBooking, tenant);
  } else {
    const store = await readDevContent(tenant);
    const bookings = (store[`__bookings_${tenant}`] as Booking[]) ?? [];
    bookings.push(newBooking);
    store[`__bookings_${tenant}`] = bookings;
    await writeDevContent(store, tenant);
  }

  // Mark the full booked span as confirmed in Redis after successful write
  await confirmBookingSlot(
    tenant,
    booking.date,
    booking.startTime,
    booking.endTime,
    bufferTime
  );

  return newBooking;
}

/**
 * Atomically claim a slot, verify availability, and create booking.
 * Prevents race conditions where two requests check availability simultaneously.
 */
export async function createBookingAtomic(
  booking: Omit<Booking, "id" | "createdAt" | "status">,
  tenant: string = DEFAULT_TENANT
): Promise<{ success: true; booking: Booking } | { success: false; error: string }> {
  // Step 1: Atomically claim every grid cell the booking spans. For
  // variable-duration services this prevents two overlapping bookings (whose
  // start times differ) from both succeeding.
  const { bufferTime } = await getBookingConfig(tenant);
  const { claimed, release } = await claimBookingSlot(
    tenant,
    booking.date,
    booking.startTime,
    booking.endTime,
    bufferTime
  );

  if (!claimed) {
    return { success: false, error: "This time slot is no longer available. Please choose another time." };
  }

  try {
    // Step 2: Double-check availability (handles case where slot was booked before Redis key expired)
    const available = await getAvailableSlots(booking.date, booking.serviceId, tenant);
    if (!available.includes(booking.startTime)) {
      await release();
      return { success: false, error: "This time slot is no longer available. Please choose another time." };
    }

    // Step 3: Create the booking (this also confirms the slot in Redis)
    const created = await createBooking(booking, tenant);
    return { success: true, booking: created };
  } catch (error) {
    // Release the slot claim on any error
    await release();
    throw error;
  }
}

export async function updateBooking(
  id: string,
  updates: Partial<Pick<Booking, "status" | "notes" | "cancelledAt">>,
  tenant: string = DEFAULT_TENANT
): Promise<Booking | null> {
  if (dataSourceIsPostgres()) {
    const existing = await pgGetBooking(id, tenant);
    if (existing) {
      await pgUpdateBooking(id, tenant, updates);
      return { ...existing, ...updates };
    }
    // Postgres miss: no Sanity fallback remains.
    return null;
  }

  const store = await readDevContent(tenant);
  const bookings = (store[`__bookings_${tenant}`] as Booking[]) ?? [];
  const idx = bookings.findIndex((b) => b.id === id);
  if (idx === -1) return null;
  bookings[idx] = { ...bookings[idx], ...updates };
  store[`__bookings_${tenant}`] = bookings;
  await writeDevContent(store, tenant);
  return bookings[idx];
}

export async function getAvailableSlots(
  date: string,
  serviceId: string,
  tenant: string = DEFAULT_TENANT
): Promise<string[]> {
  const [config, bookings, overrides, services] = await Promise.all([
    getBookingConfig(tenant),
    getBookings(tenant, { from: date, to: date }),
    getDateOverrides(tenant),
    getContent("services", tenant),
  ]);

  const serviceList = Array.isArray(services.services) ? services.services : [];
  const service = serviceList.find((s) => s.id === serviceId);
  const duration = service ? parseInt(service.duration) || config.slotDuration : config.slotDuration;

  return generateSlots(config, date, duration, bookings, overrides);
}
