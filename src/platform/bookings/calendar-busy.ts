/**
 * A connected Google or Outlook calendar's busy times on the tenant booking
 * routes (bookings spec, "Availability", "Calendars"). The calendar is a
 * Connection of the bookings System: Strelva's bookings stay the record, the
 * calendar only blocks times.
 *
 *  - Busy times come from the workspace's calendar connection
 *    (workspace_calendar_connections) through the existing provider adapters
 *    (Google /freeBusy, Outlook calendarView), cached 60 seconds in Redis
 *    (a cache only).
 *  - No connection: nothing changes. A connection that is revoked, errored or
 *    can't be read: slots are still offered (`calendarChecked: false`) and an
 *    instant booking becomes a request for that booking, so the owner
 *    confirms. A booking is never refused because a calendar is down.
 *
 * Off unless STRELVA_BOOKING_CALENDAR_BUSY=1, and only on store-served reads.
 */
import { getRedis } from "@/platform/infra/redis";
import { zonedLocalToUtc } from "./availability";
import { bookingCalendarBusyEnabled } from "./flags";
import type { BookingContext } from "./store";

export interface BusyInterval {
  start: string;
  end: string;
}

export type CalendarBusy =
  | { connected: false }
  | { connected: true; checked: true; busy: BusyInterval[] }
  | { connected: true; checked: false; reason: string };

export interface CalendarBusyPorts {
  /** The business's calendar connection for bookings, if any (first connected one). */
  connection(workspaceId: string): Promise<{ provider: "google" | "outlook"; status: string } | null>;
  /** Busy intervals between start and end (UTC ISO). Throws when the provider can't be read. */
  busy(workspaceId: string, provider: "google" | "outlook", query: { start: string; end: string; timeZone: string }): Promise<BusyInterval[]>;
  cache?: {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown, ttlSeconds: number): Promise<unknown>;
  } | null;
}

export const BUSY_CACHE_SECONDS = 60;

function nextDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function cacheKey(context: BookingContext, date: string): string {
  return `reb:booking:busy:${context.calendarKey ?? context.tenantStableId ?? context.workspaceId}:${date}`;
}

function isBusyList(value: unknown): value is BusyInterval[] {
  return Array.isArray(value) && value.every((v) => v && typeof v === "object" && typeof (v as BusyInterval).start === "string" && typeof (v as BusyInterval).end === "string");
}

let override: { ports: CalendarBusyPorts | null } | null = null;
/** Tests supply their own ports (undefined restores the real ones). */
export function setCalendarBusyPorts(ports: CalendarBusyPorts | null | undefined): void {
  override = ports === undefined ? null : { ports };
}

/** Busy times for one local date of this calendar. Never throws. */
export async function readCalendarBusy(context: BookingContext, date: string, timeZone: string, given?: CalendarBusyPorts | null): Promise<CalendarBusy> {
  if (!bookingCalendarBusyEnabled() || !context.workspaceId) return { connected: false };
  const ports = given !== undefined ? given : override ? override.ports : defaultBusyPorts();
  if (!ports) return { connected: false };
  let connection: Awaited<ReturnType<CalendarBusyPorts["connection"]>>;
  try {
    connection = await ports.connection(context.workspaceId);
  } catch {
    return { connected: true, checked: false, reason: "connection_unreadable" };
  }
  if (!connection) return { connected: false };
  if (connection.status !== "connected" && connection.status !== "authorized") {
    return { connected: true, checked: false, reason: `calendar_${connection.status}` };
  }
  const key = cacheKey(context, date);
  const cached = await ports.cache?.get(key).catch(() => null);
  if (isBusyList(cached)) return { connected: true, checked: true, busy: cached };
  try {
    const busy = await ports.busy(context.workspaceId, connection.provider, {
      start: zonedLocalToUtc(date, "00:00", timeZone),
      end: zonedLocalToUtc(nextDate(date), "00:00", timeZone),
      timeZone,
    });
    await ports.cache?.set(key, busy, BUSY_CACHE_SECONDS).catch(() => undefined);
    return { connected: true, checked: true, busy };
  } catch (error) {
    console.warn("[bookings] calendar busy read failed; slots offered unchecked", {
      tenantStableId: context.tenantStableId, error: error instanceof Error ? error.message : String(error),
    });
    return { connected: true, checked: false, reason: "busy_unreadable" };
  }
}

/** Start times (HH:MM local) whose [start, start + length) overlaps no busy interval. */
export function withoutBusy(slots: readonly string[], date: string, durationMinutes: number, timeZone: string, busy: readonly BusyInterval[]): string[] {
  if (!busy.length) return [...slots];
  const ranges = busy.map((b) => [Date.parse(b.start), Date.parse(b.end)] as const).filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e) && e > s);
  return slots.filter((slot) => {
    const start = Date.parse(zonedLocalToUtc(date, slot, timeZone));
    const end = start + durationMinutes * 60_000;
    return !ranges.some(([s, e]) => start < e && end > s);
  });
}

type ConnectionRow = { provider?: unknown; status?: unknown };
type Query = PromiseLike<{ data: unknown; error: unknown }> & {
  select(columns: string): Query;
  eq(column: string, value: unknown): Query;
  in(column: string, values: unknown[]): Query;
  order(column: string): Query;
  limit(count: number): Query;
  maybeSingle(): PromiseLike<{ data: unknown; error: unknown }>;
};

/** The real ports: the connection row, the business owner as the reading actor, and the provider adapters. */
export function defaultBusyPorts(): CalendarBusyPorts | null {
  if (!bookingCalendarBusyEnabled()) return null;
  return {
    async connection(workspaceId) {
      const { getSupabase } = await import("@/platform/infra/db/client");
      const db = getSupabase() as unknown as { from(table: string): Query } | null;
      if (!db) return null;
      const { data, error } = await db.from("workspace_calendar_connections").select("provider,status").eq("workspace_id", workspaceId)
        .in("status", ["connected", "authorized", "error", "revoked"]).order("provider").limit(1);
      if (error) throw new Error("calendar_connection_unreadable");
      const row = (Array.isArray(data) ? data[0] : null) as ConnectionRow | null;
      if (!row || (row.provider !== "google" && row.provider !== "outlook")) return null;
      return { provider: row.provider, status: String(row.status ?? "") };
    },
    async busy(workspaceId, provider, query) {
      const { getSupabase } = await import("@/platform/infra/db/client");
      const db = getSupabase() as unknown as { from(table: string): Query } | null;
      if (!db) throw new Error("calendar_unconfigured");
      // The owner reads their own calendar: the connection is theirs to grant.
      const owner = await db.from("workspace_memberships").select("user_id").eq("workspace_id", workspaceId).eq("role", "owner").limit(1);
      const userId = Array.isArray(owner.data) ? String((owner.data[0] as { user_id?: unknown } | undefined)?.user_id ?? "") : "";
      if (!userId) throw new Error("calendar_owner_unknown");
      const user = await db.from("users").select("email,verified_at").eq("id", userId).maybeSingle();
      const email = String((user.data as { email?: unknown } | null)?.email ?? "").trim().toLowerCase();
      if (!email || !(user.data as { verified_at?: unknown } | null)?.verified_at) throw new Error("calendar_owner_unverified");
      const { readWorkspaceProviderAvailability } = await import("@/products/scheduling/server");
      const result = await readWorkspaceProviderAvailability({ userId, verifiedEmail: email }, workspaceId, provider, query);
      return result.busy.map((b) => ({ start: b.start, end: b.end }));
    },
    cache: (() => {
      const redis = getRedis();
      if (!redis) return null;
      return {
        get: (key: string) => redis.get(key),
        set: (key: string, value: unknown, ttlSeconds: number) => redis.set(key, value, { ex: ttlSeconds }),
      };
    })(),
  };
}
