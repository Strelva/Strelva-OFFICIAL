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
 *
 * One booking store (Reborn §2, src/platform/bookings). Every function here
 * keeps its signature; switches decide where it reads and writes:
 *   STRELVA_BOOKING_STORE_WRITE=1        every write is also copied to the one
 *                                        store (never failing the visitor).
 *   STRELVA_BOOKING_STORE_READ=compare   legacy serves; the store is read beside
 *                                        it and differences are logged.
 *   STRELVA_BOOKING_STORE_READ=postgres  the store serves and guards the slot
 *                                        (after 7 days of parity). Hours and
 *                                        services come from the business record;
 *                                        a paused bookings System offers no
 *                                        times. The legacy stores still receive
 *                                        every write, so switching back is the
 *                                        rollback.
 */

import type { BookingConfig, DateOverride, Booking } from "@/lib/types";
import { DEFAULT_BOOKING_CONFIG, generateBookingId, generateSlots } from "@/lib/booking";
import { getRedis } from "@/platform/infra/redis";
import { mirrorClientRecord } from "@/platform/client-records/mirror";
import { readThroughFlag } from "@/platform/client-records/move";
import { DEFAULT_TENANT, readDevContent, writeDevContent } from "@/lib/storage/core";
import { getContent } from "@/lib/storage/content-store";
import { dataSourceIsPostgres } from "@/platform/infra/db/source-flags";
import { getSupabase, type Row, type Insert, type Update } from "@/platform/infra/db/client";
import { bookingReadSource, bookingStoreWriteEnabled } from "@/platform/bookings/flags";
import {
  claimStoreBooking,
  compareBookingsBeside,
  compareSlotsBeside,
  mirrorLegacyBooking,
  mirrorLegacySettings,
  mirrorLegacyStatus,
  releaseStoreBooking,
  storeAvailableSlots,
  storeGetBookingConfig,
  storeGetBookings,
  storeGetDateOverrides,
  type SiteService,
} from "@/platform/bookings/tenant";
import { setBookingStatus, type BookingContext } from "@/platform/bookings/store";
import { storeBookingToLegacy } from "@/platform/bookings/availability";

/** Serve from the store; on any store failure serve the legacy answer (it still receives every write). */
async function storeOrLegacy<T>(label: string, tenant: string, fromStore: () => Promise<T>, fromLegacy: () => Promise<T>): Promise<T> {
  try {
    return await fromStore();
  } catch (error) {
    console.error(`[bookings] store ${label} failed for ${tenant}; serving legacy:`, error instanceof Error ? error.message : error);
    return fromLegacy();
  }
}

// --- Authoritative Postgres `bookings` helpers -----------------------------

function bookingDb(operation: string): NonNullable<ReturnType<typeof getSupabase>> {
  const db = getSupabase();
  if (!db) throw new Error(`[bookings] ${operation} failed: Supabase is not configured`);
  return db;
}

/** Map a Postgres bookings row to the store's camelCase Booking shape. */
export function mapPgBookingRow(row: Row<"bookings">): Booking {
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
  if ((await bookingReadSource()) === "postgres") {
    return storeOrLegacy("config read", tenant, () => storeGetBookingConfig(tenant), () => legacyGetBookingConfig(tenant));
  }
  return legacyGetBookingConfig(tenant);
}

async function legacyGetBookingConfig(tenant: string): Promise<BookingConfig> {
  const redis = getRedis();
  if (redis) {
    // Fail CLOSED: let a Redis error propagate (the caller fails the request)
    // rather than swallow it and serve DEFAULT_BOOKING_CONFIG — default hours
    // could offer slots on a day the tenant is actually closed, or hide a day
    // it's open, on a live booking surface. A genuine miss (null) means "no
    // custom config yet" → DEFAULT is the correct answer.
    return readThroughFlag("booking_config", tenant,
      async () => (await redis.get<BookingConfig>(bookingConfigKey(tenant))) ?? DEFAULT_BOOKING_CONFIG,
      (records) => (records.find((r) => r.recordId === "config")?.payload.value as BookingConfig | undefined) ?? DEFAULT_BOOKING_CONFIG);
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
    await mirrorClientRecord("booking_config", tenant, { recordId: "config", payload: { value: JSON.parse(JSON.stringify(config)) }, capturedAt: new Date().toISOString() });
  } else {
    const store = await readDevContent(tenant);
    store[`__bookingConfig_${tenant}`] = config;
    await writeDevContent(store, tenant);
  }
  if (bookingStoreWriteEnabled()) {
    await mirrorLegacySettings(tenant, config, await legacyGetDateOverrides(tenant).catch(() => []));
  }
}

export async function getDateOverrides(
  tenant: string = DEFAULT_TENANT
): Promise<DateOverride[]> {
  if ((await bookingReadSource()) === "postgres") {
    return storeOrLegacy("overrides read", tenant, () => storeGetDateOverrides(tenant), () => legacyGetDateOverrides(tenant));
  }
  return legacyGetDateOverrides(tenant);
}

async function legacyGetDateOverrides(tenant: string): Promise<DateOverride[]> {
  // Closed-dates / special-hours overrides persist as a Redis blob (mirrors
  // getBookingConfig), written by setDateOverrides from the owner's Schedule
  // availability editor. The dev-file store is the local fallback when Redis is
  // absent. (These were previously authored in Sanity Studio, now decommissioned.)
  const redis = getRedis();
  if (redis) {
    // Fail CLOSED like getBookingConfig: propagate a Redis error rather than
    // silently dropping a "closed" override and accepting a booking on a day the
    // owner blocked off.
    return readThroughFlag("booking_config", tenant,
      async () => {
        const raw = await redis.get<DateOverride[]>(dateOverridesKey(tenant));
        return Array.isArray(raw) ? raw : [];
      },
      (records) => {
        const value = records.find((r) => r.recordId === "overrides")?.payload.value;
        return Array.isArray(value) ? (value as DateOverride[]) : [];
      });
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
    await mirrorClientRecord("booking_config", tenant, { recordId: "overrides", payload: { value: JSON.parse(JSON.stringify(overrides)) }, capturedAt: new Date().toISOString() });
  } else {
    const store = await readDevContent(tenant);
    store[`__dateOverrides_${tenant}`] = overrides;
    await writeDevContent(store, tenant);
  }
  if (bookingStoreWriteEnabled()) {
    await mirrorLegacySettings(tenant, await legacyGetBookingConfig(tenant).catch(() => DEFAULT_BOOKING_CONFIG), overrides);
  }
}

export async function getBookings(
  tenant: string = DEFAULT_TENANT,
  dateRange?: { from: string; to: string }
): Promise<Booking[]> {
  const source = await bookingReadSource();
  if (source === "postgres") {
    return storeOrLegacy("bookings read", tenant, () => storeGetBookings(tenant, dateRange), () => legacyGetBookings(tenant, dateRange));
  }
  const legacy = await legacyGetBookings(tenant, dateRange);
  if (source === "compare") await compareBookingsBeside(tenant, legacy, dateRange);
  return legacy;
}

/** One booking from the legacy stores only (the repair and backfill read it). */
export async function getLegacyBookingById(tenant: string, id: string): Promise<Booking | null> {
  if (dataSourceIsPostgres()) return pgGetBooking(id, tenant);
  const store = await readDevContent(tenant);
  return ((store[`__bookings_${tenant}`] as Booking[]) ?? []).find((b) => b.id === id) ?? null;
}

/** Legacy config and overrides only (the backfill reads them). */
export async function getLegacyBookingSettings(tenant: string): Promise<{ config: BookingConfig; overrides: DateOverride[] }> {
  const [config, overrides] = await Promise.all([legacyGetBookingConfig(tenant), legacyGetDateOverrides(tenant)]);
  return { config, overrides };
}

/** Every legacy booking of a tenant, from the legacy stores only. */
export async function legacyGetBookings(
  tenant: string,
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
  const parts = time.split(":").map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
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

async function legacyInsertBooking(
  newBooking: Booking,
  tenant: string,
  bufferTime: number,
  options: { slotCache?: "required" | "best_effort" } = {}
): Promise<void> {
  if (dataSourceIsPostgres()) {
    await pgInsertBooking(newBooking, tenant);
  } else {
    const store = await readDevContent(tenant);
    const bookings = (store[`__bookings_${tenant}`] as Booking[]) ?? [];
    bookings.push(newBooking);
    store[`__bookings_${tenant}`] = bookings;
    await writeDevContent(store, tenant);
  }

  // Mark the full booked span as confirmed in Redis after successful write.
  // With the one store serving, its exclusion constraint guards the slot and
  // the Redis cells are only the legacy path's lock: a Redis outage must not
  // undo a booking the store already holds.
  try {
    await confirmBookingSlot(
      tenant,
      newBooking.date,
      newBooking.startTime,
      newBooking.endTime,
      bufferTime
    );
  } catch (error) {
    if (options.slotCache !== "best_effort") throw error;
    console.warn(`[bookings] Redis slot lock not written for ${tenant} (the one store holds the booking):`, error instanceof Error ? error.message : error);
  }
}

/** Nothing was stored, and the visitor is told so (never a 500, never a false success). */
const BOOKING_UNAVAILABLE = "We couldn't save your booking just now, so nothing was booked. Please try again in a minute.";

export async function createBooking(
  booking: Omit<Booking, "id" | "createdAt" | "status">,
  tenant: string = DEFAULT_TENANT
): Promise<Booking> {
  const bookingId = generateBookingId();
  const config = await legacyGetBookingConfig(tenant);

  const newBooking: Booking = {
    ...booking,
    id: bookingId,
    status: "confirmed",
    createdAt: new Date().toISOString(),
  };

  await legacyInsertBooking(newBooking, tenant, config.bufferTime);
  // Dual-write: copy to the one store. Never fails the visitor.
  if (bookingStoreWriteEnabled()) await mirrorLegacyBooking(tenant, newBooking, config);

  return newBooking;
}

async function siteServices(tenant: string): Promise<SiteService[]> {
  const services = await getContent("services", tenant);
  const list = Array.isArray(services.services) ? services.services : [];
  return list.map((s) => ({ id: s.id, name: s.name, duration: s.duration, comingSoon: s.comingSoon }));
}

export type CreateBookingResult =
  | { success: true; booking: Booking; /** Request mode: held until the owner approves through Needs you. */ requested?: boolean; context?: BookingContext }
  | { success: false; error: string; code?: "paused" | "taken" | "invalid_service" | "unavailable" };

/**
 * Atomically claim a slot, verify availability, and create booking.
 * Prevents race conditions where two requests check availability simultaneously.
 *
 * With reads flipped to the one store, the store's exclusion constraint is the
 * slot guard: the booking is recorded there first (refused when taken or the
 * bookings System is paused), then written to the legacy table so a rollback
 * loses nothing. If the store can't be reached, the legacy path below runs and
 * the copy is queued.
 */
export async function createBookingAtomic(
  booking: Omit<Booking, "id" | "createdAt" | "status">,
  tenant: string = DEFAULT_TENANT
): Promise<CreateBookingResult> {
  if ((await bookingReadSource()) === "postgres") {
    const legacyId = generateBookingId();
    let claim: Awaited<ReturnType<typeof claimStoreBooking>> | null = null;
    try {
      claim = await claimStoreBooking(tenant, booking, legacyId, await siteServices(tenant));
    } catch (error) {
      console.error(`[bookings] store claim failed for ${tenant}; taking the booking on the legacy path:`, error instanceof Error ? error.message : error);
    }
    if (claim && !claim.success) return { success: false, error: claim.error, code: claim.code };
    if (claim?.success) {
      try {
        await legacyInsertBooking(claim.booking, tenant, claim.context.settings?.bufferMinutes ?? 0, { slotCache: "best_effort" });
      } catch (error) {
        await releaseStoreBooking(tenant, legacyId);
        throw error;
      }
      return { success: true, booking: claim.booking, requested: claim.requested, context: claim.context };
    }
    // The store couldn't be reached. The legacy path below guards the slot
    // only with Redis; without Redis nothing would guard it, so refuse rather
    // than take an unguarded booking (or confirm a business's request).
    if (!getRedis()) {
      console.error(`[bookings] store unreachable and no Redis lock for ${tenant}; refusing rather than booking unguarded.`);
      return { success: false, error: BOOKING_UNAVAILABLE, code: "unavailable" };
    }
  }

  // Step 1: Atomically claim every grid cell the booking spans. For
  // variable-duration services this prevents two overlapping bookings (whose
  // start times differ) from both succeeding.
  let bufferTime: number;
  let slot: Awaited<ReturnType<typeof claimBookingSlot>>;
  try {
    ({ bufferTime } = await legacyGetBookingConfig(tenant));
    slot = await claimBookingSlot(tenant, booking.date, booking.startTime, booking.endTime, bufferTime);
  } catch (error) {
    // Redis is configured but down: the hours can't be read (they fail
    // closed) or the slot can't be locked, so nothing is booked.
    console.error(`[bookings] Redis slot lock failed for ${tenant}:`, error instanceof Error ? error.message : error);
    return { success: false, error: BOOKING_UNAVAILABLE, code: "unavailable" };
  }
  const { claimed, release } = slot;

  if (!claimed) {
    return { success: false, error: "This time slot is no longer available. Please choose another time." };
  }

  try {
    // Step 2: Double-check availability (handles case where slot was booked before Redis key expired)
    const available = await legacyAvailableSlots(booking.date, booking.serviceId, tenant);
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

async function legacyUpdateBooking(
  id: string,
  updates: Partial<Pick<Booking, "status" | "notes" | "cancelledAt">>,
  tenant: string
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
  const existing = bookings[idx]!;
  const updated: Booking = { ...existing, ...updates };
  bookings[idx] = updated;
  store[`__bookings_${tenant}`] = bookings;
  await writeDevContent(store, tenant);
  return updated;
}

export async function updateBooking(
  id: string,
  updates: Partial<Pick<Booking, "status" | "notes" | "cancelledAt">>,
  tenant: string = DEFAULT_TENANT
): Promise<Booking | null> {
  const updated = await legacyUpdateBooking(id, updates, tenant);
  if (!bookingStoreWriteEnabled()) return updated;
  if (updated) {
    await mirrorLegacyStatus(tenant, id, updates.status, "owner");
    return updated;
  }
  // A booking only the store has (an API reservation or a Calendly import,
  // shown by its store id once reads flip) is changed in the store alone.
  if ((await bookingReadSource()) === "postgres" && updates.status) {
    const changed = await storeOrLegacy("status change", tenant,
      async () => {
        const result = await setBookingStatus(tenant, id, updates.status!, "owner", null);
        return result.status === "updated" || result.status === "unchanged" ? storeBookingToLegacy(result.booking) : null;
      },
      async () => null);
    return changed;
  }
  return null;
}

async function legacyAvailableSlots(date: string, serviceId: string, tenant: string): Promise<string[]> {
  const [config, bookings, overrides, services] = await Promise.all([
    legacyGetBookingConfig(tenant),
    legacyGetBookings(tenant, { from: date, to: date }),
    legacyGetDateOverrides(tenant),
    getContent("services", tenant),
  ]);

  const serviceList = Array.isArray(services.services) ? services.services : [];
  const service = serviceList.find((s) => s.id === serviceId);
  const duration = service ? parseInt(service.duration) || config.slotDuration : config.slotDuration;

  return generateSlots(config, date, duration, bookings, overrides);
}

export async function getAvailableSlots(
  date: string,
  serviceId: string,
  tenant: string = DEFAULT_TENANT
): Promise<string[]> {
  const source = await bookingReadSource();
  if (source === "postgres") {
    return storeOrLegacy("slots read", tenant,
      async () => storeAvailableSlots(tenant, date, serviceId, await siteServices(tenant)),
      () => legacyAvailableSlots(date, serviceId, tenant));
  }
  const slots = await legacyAvailableSlots(date, serviceId, tenant);
  if (source === "compare") await compareSlotsBeside(tenant, date, serviceId, slots, await siteServices(tenant).catch(() => []));
  return slots;
}
