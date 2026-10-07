/**
 * Moving today's bookings into the one store (bookings spec, "Moving today's
 * bookings"): backfill (step 4, dry run by default), the 7-day compare
 * (step 5), the repair of queued dual-writes (step 3), and the copy of
 * schedule reservations that have no public receipt.
 *
 * Reads go through injected ports so the move is tested without a database;
 * scripts/booking-store-move.ts supplies the real ones and refuses a
 * production write without Jacob's yes.
 */
import { generateSlots, DEFAULT_BOOKING_CONFIG } from "@/lib/booking";
import { getRedis } from "@/platform/infra/redis";
import type { Booking, BookingConfig, DateOverride } from "@/lib/types";
import {
  hoursOutsideRecord,
  legacyBookingToStoreInput,
  legacyConfigToSettings,
  resolveService,
  storeSlotsForDate,
  timeZoneOf,
} from "./availability";
import { BOOKING_PARITY_STORE } from "./flags";
import {
  bookingStoreDb,
  readBookingContext,
  readTenantBookings,
  recordBooking,
  recordWorkspaceBooking,
  upsertBookingSettings,
  type BookingStoreDb,
  type StoreBooking,
  type StoreBookingInput,
} from "./store";
import { BOOKING_STORE_PENDING_KEY, compareBookingLists, parseBookingPendingMember, type SiteService } from "./tenant";

export interface LegacyBookingPorts {
  bookings(tenant: string): Promise<Booking[]>;
  booking(tenant: string, id: string): Promise<Booking | null>;
  settings(tenant: string): Promise<{ config: BookingConfig; overrides: DateOverride[] }>;
  services(tenant: string): Promise<SiteService[]>;
  /** Public API receipts of this tenant, as store input (customer from the captured inquiry). */
  reservations(tenant: string): Promise<StoreBookingInput[]>;
  reservation(tenant: string, reservationId: string): Promise<StoreBookingInput | null>;
}

export interface BookingBackfillReport {
  tenant: string;
  apply: boolean;
  legacyBookings: number;
  reservations: number;
  written: number;
  unchanged: number;
  /** The store refused these (an overlap the legacy store let through). Each needs an explanation. */
  conflicts: string[];
  failed: Array<{ ref: string; reason: string }>;
  settings: "none" | "would_write" | "written" | "failed";
  /** For the migration report: what is not carried, and hours outside the record. */
  notes: string[];
}

function configIsDefault(config: BookingConfig): boolean {
  return JSON.stringify(config) === JSON.stringify(DEFAULT_BOOKING_CONFIG);
}

/**
 * Copy one tenant's legacy bookings, settings and API receipts into the store.
 * A dry run reads and writes nothing. Idempotent: reruns are `unchanged`.
 */
export async function backfillTenantBookings(
  tenant: string,
  options: { apply: boolean; ports: LegacyBookingPorts; db?: BookingStoreDb | null },
): Promise<BookingBackfillReport> {
  const db = options.db === undefined ? bookingStoreDb() : options.db;
  const [bookings, legacy, reservations] = await Promise.all([
    options.ports.bookings(tenant),
    options.ports.settings(tenant),
    options.ports.reservations(tenant),
  ]);
  const report: BookingBackfillReport = {
    tenant, apply: options.apply, legacyBookings: bookings.length, reservations: reservations.length,
    written: 0, unchanged: 0, conflicts: [], failed: [], settings: "none", notes: [],
  };
  const hasSettings = !configIsDefault(legacy.config) || legacy.overrides.length > 0;
  const settings = legacyConfigToSettings(legacy.config, legacy.overrides);
  if (legacy.config.requirePayment) report.notes.push("requirePayment was on: payments are not carried into the one store.");
  const context = db ? await readBookingContext(tenant, db).catch(() => null) : null;
  if (context) {
    const outside = hoursOutsideRecord({ ...context, settings });
    for (const slot of outside) report.notes.push(`Legacy hours ${slot.opens}-${slot.closes} on day ${slot.day} are outside the business record's hours; they stay closed (narrowing only).`);
    if (context.hours && context.hours.timezone !== legacy.config.timezone) {
      report.notes.push(`Legacy time zone ${legacy.config.timezone} differs from the record's ${context.hours.timezone}; existing bookings keep their original local times.`);
    }
  }
  if (!options.apply) {
    if (hasSettings) report.settings = "would_write";
    return report;
  }
  if (!db) throw new Error("booking_store_db_unconfigured");
  if (hasSettings) {
    try {
      await upsertBookingSettings(tenant, settings, "backfill", db);
      report.settings = "written";
    } catch (error) {
      report.settings = "failed";
      report.failed.push({ ref: "settings", reason: error instanceof Error ? error.message : String(error) });
    }
  }
  const inputs: StoreBookingInput[] = [
    ...bookings.map((b) => legacyBookingToStoreInput(b, { timeZone: legacy.config.timezone, bufferMinutes: legacy.config.bufferTime, reason: "Copied from the legacy booking store" })),
    ...reservations,
  ];
  for (const input of inputs) {
    const ref = input.legacyId ?? input.publicReservationId ?? "unknown";
    try {
      const result = await recordBooking(tenant, input, "backfill", db);
      if (result.status === "conflict") report.conflicts.push(ref);
      else if (result.status === "unchanged") report.unchanged++;
      else report.written++;
    } catch (error) {
      report.failed.push({ ref, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return report;
}

export interface BookingParityReport {
  tenant: string;
  ok: boolean;
  legacyCount: number;
  storeCount: number;
  missing: string[];
  mismatched: string[];
  /** Days × services whose offered slots differ. */
  slotDifferences: Array<{ date: string; serviceId: string; legacy: string[]; store: string[] }>;
  /** Slot differences that come only from record hours narrowing legacy hours (explained). */
  slotDifferencesExplained: boolean;
  recorded: boolean;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The legacy slot answer for one date and service, computed from already-read inputs (src/lib/storage/booking-store.ts legacyAvailableSlots). */
export function legacySlots(config: BookingConfig, overrides: DateOverride[], bookings: Booking[], services: SiteService[], date: string, serviceId: string): string[] {
  const service = services.find((s) => s.id === serviceId);
  const duration = service ? parseInt(String(service.duration ?? ""), 10) || config.slotDuration : config.slotDuration;
  return generateSlots(config, date, duration, bookings.filter((b) => b.date === date), overrides);
}

/**
 * Step 5: legacy vs store for one tenant. Bookings by legacy id and content,
 * and the slots each path offers for the next `days` days for every bookable
 * site service. Records the day's result unless `record: false`.
 */
export async function checkTenantBookingParity(
  tenant: string,
  options: { ports: LegacyBookingPorts; db?: BookingStoreDb | null; record?: boolean; days?: number; today?: string },
): Promise<BookingParityReport> {
  const db = options.db === undefined ? bookingStoreDb() : options.db;
  if (!db) throw new Error("booking_parity_unconfigured");
  const [bookings, legacy, services, context, store, receipts] = await Promise.all([
    options.ports.bookings(tenant),
    options.ports.settings(tenant),
    options.ports.services(tenant),
    readBookingContext(tenant, db),
    readTenantBookings(tenant, undefined, db),
    options.ports.reservations(tenant),
  ]);
  if (!context) throw new Error("booking_parity_unknown_tenant");
  const diff = compareBookingLists(bookings, store);
  // A green day covers both route families, not just legacy-id rows.
  for (const receipt of receipts) {
    const stored = store.find((b) => b.publicReservationId === receipt.publicReservationId);
    const ref = `receipt:${receipt.publicReservationId}`;
    if (!stored) diff.missingFromStore.push(ref);
    else if (stored.status !== receipt.status || Date.parse(stored.start) !== Date.parse(receipt.start)
      || Date.parse(stored.end) !== Date.parse(receipt.end)) diff.mismatched.push(ref);
  }
  diff.mismatched.push(...diff.storeOnly.map((id) => `store_only:${id}`));
  const today = options.today ?? new Intl.DateTimeFormat("en-CA", { timeZone: legacy.config.timezone }).format(new Date());
  const slotDifferences: BookingParityReport["slotDifferences"] = [];
  const bookable = services.filter((s) => !s.comingSoon);
  for (let i = 0; i < (options.days ?? 60); i++) {
    const date = addDays(today, i);
    for (const service of bookable) {
      const fromLegacy = legacySlots(legacy.config, legacy.overrides, bookings, services, date, service.id);
      const resolved = resolveService(context, service.id, service);
      const fromStore = resolved.bookable ? storeSlotsForDate(context, date, resolved.durationMinutes, storeBookingsOn(store, date)) : [];
      if (fromLegacy.join(",") !== fromStore.join(",")) slotDifferences.push({ date, serviceId: service.id, legacy: fromLegacy, store: fromStore });
    }
  }
  // Differences are explained only when the record's hours (not the store's
  // copy of the legacy data) are what narrowed them: every store slot is also
  // a legacy slot, and the record has hours the legacy schedule exceeds.
  const narrowed = Boolean(context.hours) && (hoursOutsideRecord(context).length > 0 || timeZoneOf(context) !== legacy.config.timezone);
  const slotDifferencesExplained = slotDifferences.length > 0 && narrowed
    && slotDifferences.every((d) => d.store.every((slot) => d.legacy.includes(slot)));
  const unexplainedSlots = slotDifferencesExplained ? 0 : slotDifferences.length;
  const report: BookingParityReport = {
    tenant,
    ok: diff.missingFromStore.length === 0 && diff.mismatched.length === 0 && unexplainedSlots === 0,
    legacyCount: bookings.length + receipts.length,
    storeCount: store.filter((b) => b.legacyId || b.publicReservationId).length,
    missing: diff.missingFromStore,
    mismatched: diff.mismatched,
    slotDifferences,
    slotDifferencesExplained,
    recorded: false,
  };
  if (options.record !== false) {
    const { error } = await db.rpc("record_client_record_parity", {
      p_store: BOOKING_PARITY_STORE,
      p_tenant_id: tenant,
      p_redis_count: report.legacyCount,
      p_postgres_count: report.storeCount,
      p_missing: report.missing.length,
      p_mismatched: report.mismatched.length + unexplainedSlots,
    });
    report.recorded = !error;
  }
  return report;
}

function storeBookingsOn(store: StoreBooking[], date: string): StoreBooking[] {
  return store.filter((b) => b.localDate === date);
}

export interface BookingRepairReport {
  checked: number;
  repaired: number;
  failed: number;
  dropped: number;
  remaining: number;
}

type PendingRedis = {
  zrange<T = unknown[]>(key: string, start: number, stop: number): Promise<T>;
  zrem(key: string, ...members: string[]): Promise<unknown>;
  zcard(key: string): Promise<number>;
};

/** Step 3's retry: replay queued dual-writes from the legacy copy. */
export async function repairPendingBookings(options: { ports: LegacyBookingPorts; limit?: number; redis?: PendingRedis | null; db?: BookingStoreDb | null }): Promise<BookingRepairReport> {
  const redis = (options.redis === undefined ? getRedis() : options.redis) as PendingRedis | null;
  const db = options.db === undefined ? bookingStoreDb() : options.db;
  const report: BookingRepairReport = { checked: 0, repaired: 0, failed: 0, dropped: 0, remaining: 0 };
  if (!redis || !db) return report;
  const members = ((await redis.zrange<unknown[]>(BOOKING_STORE_PENDING_KEY, 0, Math.max(0, (options.limit ?? 200) - 1))) ?? []).map(String);
  for (const member of members) {
    report.checked++;
    const parsed = parseBookingPendingMember(member);
    if (!parsed) {
      await redis.zrem(BOOKING_STORE_PENDING_KEY, member);
      report.dropped++;
      continue;
    }
    try {
      if (parsed.kind === "settings") {
        const legacy = await options.ports.settings(parsed.tenant);
        await upsertBookingSettings(parsed.tenant, legacyConfigToSettings(legacy.config, legacy.overrides), "repair", db);
      } else {
        const input = parsed.kind === "booking"
          ? await legacyInput(options.ports, parsed.tenant, parsed.ref)
          : await options.ports.reservation(parsed.tenant, parsed.ref);
        if (!input) {
          // The source row is gone (deleted tenant or a cancelled race): nothing to copy.
          await redis.zrem(BOOKING_STORE_PENDING_KEY, member);
          report.dropped++;
          continue;
        }
        const result = await recordBooking(parsed.tenant, input, "repair", db);
        if (result.status === "conflict") {
          // Not retryable: the compare step reports it.
          await redis.zrem(BOOKING_STORE_PENDING_KEY, member);
          report.dropped++;
          continue;
        }
      }
      await redis.zrem(BOOKING_STORE_PENDING_KEY, member);
      report.repaired++;
    } catch {
      report.failed++;
    }
  }
  report.remaining = Number(await redis.zcard(BOOKING_STORE_PENDING_KEY));
  return report;
}

// --- Schedule reservations made in the workspace (no public receipt) ---------------

export interface ScheduleReservation {
  requestId: string;
  title: string;
  start: string;
  end: string;
  status: "reserved" | "cancelled" | "writing" | "unknown" | "accepted";
}

export interface WorkspaceSchedule {
  workspaceId: string;
  workId: string;
  /** The time zone to show local dates in: the schedule's booking grant, else the record's hours, else UTC. */
  timeZone: string;
  reservations: ScheduleReservation[];
  /** calendar_request_id of every public receipt on this schedule: those are copied with the tenant's receipts. */
  receiptRequestIds: ReadonlySet<string>;
}

export interface ScheduleReservationPorts {
  schedules(): Promise<WorkspaceSchedule[]>;
}

export interface ScheduleBackfillReport {
  apply: boolean;
  schedules: number;
  reservations: number;
  /** Already copied with a tenant's public receipts. */
  withReceipt: number;
  written: number;
  unchanged: number;
  conflicts: string[];
  failed: Array<{ ref: string; reason: string }>;
}

/**
 * Copy every schedule reservation that has no public receipt (made in the
 * workspace by the owner) into the one store, on the calendar of the tenant
 * the schedule is published to, else the workspace's own. A dry run writes
 * nothing. Idempotent: reruns are `unchanged`. Any status other than
 * cancelled holds the time (a provider write in flight still holds it).
 */
export async function backfillScheduleReservations(options: { apply: boolean; ports: ScheduleReservationPorts; db?: BookingStoreDb | null }): Promise<ScheduleBackfillReport> {
  const db = options.db === undefined ? bookingStoreDb() : options.db;
  const schedules = await options.ports.schedules();
  const report: ScheduleBackfillReport = {
    apply: options.apply, schedules: schedules.length, reservations: 0, withReceipt: 0, written: 0, unchanged: 0, conflicts: [], failed: [],
  };
  if (options.apply && !db) throw new Error("booking_store_db_unconfigured");
  for (const schedule of schedules) {
    for (const reservation of schedule.reservations) {
      if (schedule.receiptRequestIds.has(reservation.requestId)) {
        report.withReceipt++;
        continue;
      }
      report.reservations++;
      if (!options.apply) continue;
      const ref = `${schedule.workId}:${reservation.requestId}`;
      try {
        const result = await recordWorkspaceBooking(schedule.workspaceId, {
          workId: schedule.workId,
          requestId: reservation.requestId,
          status: reservation.status === "cancelled" ? "cancelled" : "confirmed",
          title: reservation.title.slice(0, 160),
          start: new Date(reservation.start).toISOString(),
          end: new Date(reservation.end).toISOString(),
          timeZone: schedule.timeZone,
        }, "backfill", db);
        if (result.status === "conflict") report.conflicts.push(ref);
        else if (result.status === "unchanged") report.unchanged++;
        else report.written++;
      } catch (error) {
        report.failed.push({ ref, reason: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  return report;
}

async function legacyInput(ports: LegacyBookingPorts, tenant: string, id: string): Promise<StoreBookingInput | null> {
  const [booking, legacy] = await Promise.all([ports.booking(tenant, id), ports.settings(tenant)]);
  return booking ? legacyBookingToStoreInput(booking, { timeZone: legacy.config.timezone, bufferMinutes: legacy.config.bufferTime }) : null;
}
