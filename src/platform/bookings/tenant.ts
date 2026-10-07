/**
 * The tenant booking routes (`/api/booking/*`, the dashboard schedule and
 * roster) on the one store. src/lib/storage/booking-store.ts keeps every
 * signature and asks this module when a switch is on (flags.ts).
 *
 * Dual-write never fails a visitor: a store write that fails is queued in
 * `reb:booking-store:pending` and retried by the lead-mirror-reconcile cron
 * (move.ts repairPendingBookings), the same pattern as src/lib/lead-mirror.ts.
 * A store refusal for an overlapping slot is not retryable: it is a parity
 * difference, logged and paged, and the compare step must explain it.
 */
import { contextForService, servicePolicy, validateBookingIntake } from "./service-policy";
import { pausedBookingMessage } from "./errors";
import { getRedis } from "@/platform/infra/redis";
import { alertOnce } from "@/platform/infra/monitoring";
import type { Booking, BookingConfig, DateOverride } from "@/lib/types";
import {
  composeLegacyConfig,
  composeLegacyOverrides,
  legacyBookingDigest,
  legacyBookingToStoreInput,
  legacyConfigToSettings,
  resolveService,
  settingsOrDefault,
  storeBookingToLegacy,
  storeSlotsForDate,
  timeZoneOf,
} from "./availability";
import { readCalendarBusy, withoutBusy } from "./calendar-busy";
import {
  BookingStoreError,
  readBookingContext,
  readTenantBookings,
  recordBooking,
  setBookingStatus,
  upsertBookingSettings,
  type BookingContext,
  type StoreBooking,
  type StoreBookingActor,
  type StoreBookingStatus,
} from "./store";

export const BOOKING_STORE_PENDING_KEY = "reb:booking-store:pending";
const PENDING_KEEP = 5000;

export type PendingKind = "booking" | "settings" | "reservation";

export function bookingPendingMember(kind: PendingKind, tenant: string, ref: string): string {
  return `${kind}|${tenant}|${ref}`;
}

export function parseBookingPendingMember(member: string): { kind: PendingKind; tenant: string; ref: string } | null {
  const first = member.indexOf("|");
  const second = first < 0 ? -1 : member.indexOf("|", first + 1);
  if (first <= 0 || second <= first + 1 || second === member.length - 1) return null;
  const kind = member.slice(0, first);
  if (kind !== "booking" && kind !== "settings" && kind !== "reservation") return null;
  return { kind, tenant: member.slice(first + 1, second), ref: member.slice(second + 1) };
}

async function rememberPending(kind: PendingKind, tenant: string, ref: string, reason: string): Promise<void> {
  console.error("[booking-store] not copied to the one store", { kind, tenant, ref, reason });
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.zadd(BOOKING_STORE_PENDING_KEY, { score: Date.now(), member: bookingPendingMember(kind, tenant, ref) });
    await redis.zremrangebyrank(BOOKING_STORE_PENDING_KEY, 0, -(PENDING_KEEP + 1));
  } catch {
    // The legacy copy still exists; backfill and parity find it.
  }
  await alertOnce("booking_store_write_failed", "high", { kind, reason }, 3600).catch(() => undefined);
}

async function reportConflict(tenant: string, ref: string): Promise<void> {
  console.error("[booking-store] the one store refused an overlapping booking the legacy store kept", { tenant, ref });
  await alertOnce("booking_store_conflict", "high", { tenant }, 3600).catch(() => undefined);
}

export type MirrorOutcome = "recorded" | "updated" | "unchanged" | "conflict" | "queued" | "not_found";

/** Copy one legacy booking to the store after the legacy write succeeded. Never throws. */
export async function mirrorLegacyBooking(tenant: string, booking: Booking, config: BookingConfig): Promise<MirrorOutcome> {
  try {
    const result = await recordBooking(tenant, legacyBookingToStoreInput(booking, { timeZone: config.timezone, bufferMinutes: config.bufferTime }), "dual_write");
    if (result.status === "conflict") {
      await reportConflict(tenant, booking.id);
      return "conflict";
    }
    return result.status;
  } catch (error) {
    await rememberPending("booking", tenant, booking.id, error instanceof Error ? error.message : String(error));
    return "queued";
  }
}

const LEGACY_STATUS: Record<string, StoreBookingStatus> = { confirmed: "confirmed", cancelled: "cancelled", completed: "completed", requested: "requested" };

/** Mirror a legacy status change (owner cancel, roster check-in). Never throws. */
export async function mirrorLegacyStatus(tenant: string, id: string, status: string | undefined, actor: StoreBookingActor, reason?: string): Promise<MirrorOutcome> {
  const next = status ? LEGACY_STATUS[status] : undefined;
  if (!next) return "unchanged";
  try {
    const result = await setBookingStatus(tenant, id, next, actor, reason ?? null);
    if (result.status === "conflict") {
      await reportConflict(tenant, id);
      return "conflict";
    }
    if (result.status === "not_found") {
      // Not copied yet (before the backfill, or a queued write): queue it so the repair copies the current legacy row.
      await rememberPending("booking", tenant, id, "not_in_store");
      return "queued";
    }
    return result.status;
  } catch (error) {
    await rememberPending("booking", tenant, id, error instanceof Error ? error.message : String(error));
    return "queued";
  }
}

/** Mirror the legacy config and overrides as booking settings. Never throws. */
export async function mirrorLegacySettings(tenant: string, config: BookingConfig, overrides: DateOverride[]): Promise<MirrorOutcome> {
  try {
    const result = await upsertBookingSettings(tenant, legacyConfigToSettings(config, overrides), "dual_write");
    return result.status;
  } catch (error) {
    await rememberPending("settings", tenant, "settings", error instanceof Error ? error.message : String(error));
    return "queued";
  }
}

// --- Store-served reads ----------------------------------------------------------

async function context(tenant: string): Promise<BookingContext> {
  const ctx = await readBookingContext(tenant);
  if (!ctx) throw new BookingStoreError("unknown_tenant");
  return ctx;
}

/** getBookings, served by the store: the legacy shape, legacy ids where they exist. */
export async function storeGetBookings(tenant: string, dateRange?: { from: string; to: string }): Promise<Booking[]> {
  const rows = await readTenantBookings(tenant, dateRange);
  return rows.map(storeBookingToLegacy).filter((b): b is Booking => Boolean(b));
}

export async function storeGetBookingConfig(tenant: string): Promise<BookingConfig> {
  return composeLegacyConfig(await context(tenant));
}

export async function storeGetDateOverrides(tenant: string): Promise<DateOverride[]> {
  return composeLegacyOverrides(await context(tenant));
}

export type SiteService = { id: string; name: string; duration?: string | number | null; comingSoon?: boolean };

/**
 * getAvailableSlots, served by the store. Paused, removed or inactive service:
 * no slots. A connected calendar's busy times are subtracted; when it can't be
 * read the slots are offered anyway (claimStoreBooking then takes a request).
 */
export async function storeAvailableSlots(tenant: string, date: string, serviceId: string, siteServices: SiteService[]): Promise<string[]> {
  const [ctx, bookings] = await Promise.all([context(tenant), readTenantBookings(tenant, { from: date, to: date })]);
  const siteService = siteServices.find((s) => s.id === serviceId && !s.comingSoon) ?? null;
  const effective = contextForService(ctx,serviceId);
  const service = resolveService(effective, serviceId, siteService);
  if (!service.bookable || !servicePolicy(ctx,serviceId).bookable) return [];
  const slots = storeSlotsForDate(effective, date, service.durationMinutes, bookings);
  if (!slots.length) return slots;
  const calendar = await readCalendarBusy(ctx, date, timeZoneOf(ctx));
  return calendar.connected && calendar.checked ? withoutBusy(slots, date, service.durationMinutes + settingsOrDefault(ctx).bufferMinutes, timeZoneOf(ctx), calendar.busy) : slots;
}

// --- Store-first booking (reads flipped) -----------------------------------------

export type StoreFirstResult =
  | { success: true; booking: Booking; requested: boolean; context: BookingContext }
  | { success: false; code: "paused" | "taken" | "invalid_service" | "invalid_intake"; error: string };

export const pausedMessage = pausedBookingMessage;

const TAKEN = "This time slot is no longer available. Please choose another time.";

/**
 * Take a booking with the one store as the guard (reads flipped). The store's
 * exclusion constraint is the slot lock; Redis locks are not used. The caller
 * then writes the legacy table with the returned booking (rollback needs both
 * stores to hold every write) and, if that fails, calls releaseStoreBooking.
 */
export async function claimStoreBooking(
  tenant: string,
  draft: Omit<Booking, "id" | "createdAt" | "status">,
  legacyId: string,
  siteServices: SiteService[],
): Promise<StoreFirstResult> {
  const ctx = contextForService(await context(tenant),draft.serviceId);
  if (ctx.paused) return { success: false, code: "paused", error: pausedMessage(ctx.phone) };
  const siteService = siteServices.find((s) => s.id === draft.serviceId && !s.comingSoon) ?? null;
  const service = resolveService(ctx, draft.serviceId, siteService);
  if (!service.bookable || !servicePolicy(ctx,draft.serviceId).bookable) return { success: false, code: "invalid_service", error: "Invalid service" };
  let intakeAnswers: Record<string,string>;
  try { intakeAnswers=validateBookingIntake(servicePolicy(ctx,draft.serviceId),draft.intakeAnswers); } catch(error) { return {success:false,code:"invalid_intake",error:error instanceof Error ? error.message : "Check your intake answers."}; }
  const sameDay = await readTenantBookings(tenant, { from: draft.date, to: draft.date });
  if (!storeSlotsForDate(ctx, draft.date, service.durationMinutes, sameDay).includes(draft.startTime)) {
    return { success: false, code: "taken", error: TAKEN };
  }
  // A connected calendar: busy refuses the time; unreadable turns instant into a request.
  const calendar = await readCalendarBusy(ctx, draft.date, timeZoneOf(ctx));
  if (calendar.connected && calendar.checked
    && withoutBusy([draft.startTime], draft.date, service.durationMinutes + settingsOrDefault(ctx).bufferMinutes, timeZoneOf(ctx), calendar.busy).length === 0) {
    return { success: false, code: "taken", error: TAKEN };
  }
  const settings = settingsOrDefault(ctx);
  const requested = settings.mode === "request" || (calendar.connected && !calendar.checked);
  const createdAt = new Date().toISOString();
  // Length comes from the record's service, not the site copy.
  const [h, m] = draft.startTime.split(":").map(Number);
  const endMinutes = (h ?? 0) * 60 + (m ?? 0) + service.durationMinutes;
  const endTime = `${String(Math.floor(endMinutes / 60) % 24).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
  const legacy: Booking = { ...draft, endTime, id: legacyId, status: requested ? "requested" : "confirmed", createdAt };
  const unchecked = settings.mode !== "request" && requested;
  const input = legacyBookingToStoreInput(legacy, {
    timeZone: timeZoneOf(ctx),
    bufferMinutes: settings.bufferMinutes,
    ...(unchecked ? { reason: "The calendar couldn't be checked, so the owner confirms this one" } : {}),
  });
  const result = await recordBooking(tenant, { ...input, intakeAnswers:{ ...input.intakeAnswers, ...intakeAnswers }, origin: "site", serviceName: service.name }, "native");
  if (result.status === "conflict") return { success: false, code: "taken", error: TAKEN };
  return { success: true, booking: { ...legacy, serviceName: service.name }, requested, context: ctx };
}

/** Undo a store claim whose legacy write failed, so the slot isn't held by a booking nobody kept. Never throws. */
export async function releaseStoreBooking(tenant: string, legacyId: string): Promise<void> {
  try {
    await setBookingStatus(tenant, legacyId, "cancelled", "system", "legacy_write_failed");
  } catch (error) {
    console.error("[booking-store] could not release a store claim after a failed legacy write", { tenant, legacyId, error });
  }
}

// --- Compare (step 5) --------------------------------------------------------------

export interface BookingListDifference {
  missingFromStore: string[];
  mismatched: string[];
  storeOnly: string[];
}

/** Legacy bookings vs the store's legacy-id rows for the same range. */
export function compareBookingLists(legacy: readonly Booking[], store: readonly StoreBooking[]): BookingListDifference {
  const byLegacyId = new Map(store.filter((b) => b.legacyId).map((b) => [b.legacyId!, b]));
  const missingFromStore: string[] = [];
  const mismatched: string[] = [];
  for (const booking of legacy) {
    const stored = byLegacyId.get(booking.id);
    if (!stored) {
      missingFromStore.push(booking.id);
      continue;
    }
    const asLegacy = storeBookingToLegacy(stored);
    if (!asLegacy || legacyBookingDigest(asLegacy) !== legacyBookingDigest({ ...booking, serviceName: booking.serviceName || "Appointment" })) mismatched.push(booking.id);
  }
  const legacyIds = new Set(legacy.map((b) => b.id));
  const storeOnly = store.filter((b) => b.legacyId && b.origin !== "agent" && b.origin !== "inquiry" && b.origin !== "owner" && !legacyIds.has(b.legacyId)).map((b) => b.legacyId!);
  return { missingFromStore, mismatched, storeOnly };
}

/** Compare-mode read beside the legacy one. Never throws, never changes what is served. */
export async function compareBookingsBeside(tenant: string, legacy: readonly Booking[], dateRange?: { from: string; to: string }): Promise<void> {
  try {
    const diff = compareBookingLists(legacy, await readTenantBookings(tenant, dateRange));
    if (diff.missingFromStore.length || diff.mismatched.length) {
      console.warn("[booking-store] legacy and store bookings differ", { tenant, ...diff });
      await alertOnce("booking_store_parity_miss", "high", { tenant, missing: diff.missingFromStore.length, mismatched: diff.mismatched.length }, 3600).catch(() => undefined);
    }
  } catch (error) {
    console.warn("[booking-store] compare read failed", { tenant, error: error instanceof Error ? error.message : String(error) });
  }
}

/** Compare-mode slots beside the legacy ones. Never throws. */
export async function compareSlotsBeside(tenant: string, date: string, serviceId: string, legacySlots: readonly string[], siteServices: SiteService[]): Promise<void> {
  try {
    const store = await storeAvailableSlots(tenant, date, serviceId, siteServices);
    if (store.join(",") !== legacySlots.join(",")) {
      console.warn("[booking-store] legacy and store slots differ", { tenant, date, serviceId, legacy: legacySlots, store });
      await alertOnce("booking_store_slots_differ", "medium", { tenant }, 3600).catch(() => undefined);
    }
  } catch (error) {
    console.warn("[booking-store] compare slots failed", { tenant, error: error instanceof Error ? error.message : String(error) });
  }
}
