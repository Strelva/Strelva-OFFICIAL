import { z } from "zod";
import { getBookingConfig, getBookings, updateBooking } from "@/lib/storage/booking-store";
import { zonedTodayIso } from "@/lib/booking";
import { getTenantConfig } from "@/lib/tenants";
import { getTenantSiteName } from "@/lib/tenant-display";
import type { Booking, BookingConfig } from "@/lib/types";
import { callReleaseFlagsRpc } from "@/platform/release-flags/store";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { bookingStoreWriteEnabled } from "@/platform/bookings/flags";
import { BookingStoreError, readBookingContext, setTenantBookingHours } from "@/platform/bookings/store";
import { assertWorkspaceCalendarManager } from "@/products/scheduling/server";

/**
 * The bookings System's day and week views in the workspace (Reborn §6,
 * systems catalog §3.3): the wellness roster (`/dashboard/roster`) is the day
 * view and the schedule (`/dashboard/schedule`) is the week view. Both read
 * the business's linked sites through the same `getBookings` /
 * `getBookingConfig` the dashboard pages use, so they follow the one booking
 * store when its reads flip and show the same bookings before and after.
 * The person needs a direct membership in the business.
 */

export type BookingView = "day" | "week";

export interface BookingRow {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  serviceName: string;
  notes?: string;
  status: Booking["status"];
}

export interface SiteBookings {
  tenantId: string;
  siteName: string;
  timezone: string;
  /** The site's local today. */
  today: string;
  bookings: BookingRow[];
  /** The booking store couldn't be read for this site. Never shown as "no bookings". */
  unavailable: boolean;
  /**
   * Booking-only hours, when the one booking store holds this site's settings
   * and the person may manage bookings. `record` is the business record's
   * weekly hours (null when it has none: nothing to narrow); `bookable` is the
   * narrowing (null means bookable whenever the business is open).
   */
  hours?: BookingHoursView;
}

export interface BookingHoursView {
  record: Array<{ day: number; opens: string; closes: string }> | null;
  bookable: Array<{ day: number; opens: string; closes: string }> | null;
}

export interface WorkspaceBookings {
  view: BookingView;
  /** First day shown (the day, or the Monday of the week). */
  from: string;
  to: string;
  sites: SiteBookings[];
}

const links = z.array(z.object({ tenantId: z.string().min(1), tenantStableId: z.string().uuid(), linkedAt: z.string() }));
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export interface BookingDependencies {
  bookings: (tenantId: string, range: { from: string; to: string }) => Promise<Booking[]>;
  config: (tenantId: string) => Promise<BookingConfig>;
  siteName: (tenantId: string) => Promise<string>;
  /** Booking-only hours for one site, or null when the one store isn't in use. */
  hours?: (tenantId: string) => Promise<BookingHoursView | null>;
  /** Whether this person may change what the business accepts (owner or admin). */
  canManage?: (actor: WorkspaceActor, workspaceId: string) => Promise<boolean>;
}

async function storeHours(tenantId: string): Promise<BookingHoursView | null> {
  if (!bookingStoreWriteEnabled()) return null;
  const context = await readBookingContext(tenantId);
  if (!context) return null;
  return { record: context.hours?.weekly ?? null, bookable: context.settings?.bookableHours ?? null };
}

async function canManageBookings(actor: WorkspaceActor, workspaceId: string): Promise<boolean> {
  try {
    await assertWorkspaceCalendarManager(actor, workspaceId);
    return true;
  } catch {
    return false;
  }
}

const defaults: BookingDependencies = {
  bookings: (tenantId, range) => getBookings(tenantId, range),
  config: (tenantId) => getBookingConfig(tenantId),
  siteName: async (tenantId) => getTenantSiteName(tenantId, (await getTenantConfig(tenantId).catch(() => null)) ?? undefined),
  hours: storeHours,
  canManage: canManageBookings,
};

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week holding `date`. */
export function weekStart(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

export function bookingRange(view: BookingView, date: string): { from: string; to: string } {
  if (view === "day") return { from: date, to: date };
  const from = weekStart(date);
  return { from, to: addDays(from, 6) };
}

function row(b: Booking): BookingRow {
  return {
    id: b.id, date: b.date, startTime: b.startTime, endTime: b.endTime, clientName: b.clientName, clientEmail: b.clientEmail,
    clientPhone: b.clientPhone, serviceName: b.serviceName, ...(b.notes ? { notes: b.notes } : {}), status: b.status,
  };
}

async function linkedTenants(actor: WorkspaceActor, workspaceId: string): Promise<string[]> {
  const rows = await callReleaseFlagsRpc("read_workspace_tenant_links", {
    p_workspace_id: z.string().uuid().parse(workspaceId),
    p_user_id: z.string().uuid().parse(actor.userId),
    p_verified_email: z.string().email().parse(actor.verifiedEmail.trim().toLowerCase()),
  }, links, "The business's sites could not be read.");
  return rows.map((r) => r.tenantId);
}

/** Throws WorkspaceAccessError for anyone who isn't a direct member of this business. */
export async function readWorkspaceBookings(
  actor: WorkspaceActor,
  workspaceId: string,
  options: { view: BookingView; date?: string | null; now?: Date },
  dependencies: BookingDependencies = defaults,
): Promise<WorkspaceBookings> {
  const tenants = await linkedTenants(actor, workspaceId);
  const sites = await Promise.all(tenants.map(async (tenantId): Promise<SiteBookings> => {
    const siteName = await dependencies.siteName(tenantId).catch(() => tenantId);
    const config = await dependencies.config(tenantId).catch(() => null);
    const timezone = config?.timezone ?? "America/New_York";
    const today = zonedTodayIso(timezone, options.now);
    return { tenantId, siteName, timezone, today, bookings: [], unavailable: !config };
  }));
  // One date for the page: the asked-for date, else the first site's local today.
  const anchor = options.date && isoDate.test(options.date) ? options.date : (sites[0]?.today ?? zonedTodayIso("America/New_York", options.now));
  const range = bookingRange(options.view, anchor);
  await Promise.all(sites.map(async (site) => {
    if (site.unavailable) return;
    try {
      const bookings = await dependencies.bookings(site.tenantId, range);
      site.bookings = bookings
        .filter((b) => b.date >= range.from && b.date <= range.to)
        .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
        .map(row);
    } catch (error) {
      console.error("[bookings] workspace read failed", { tenantId: site.tenantId, error: error instanceof Error ? error.message : String(error) });
      site.unavailable = true;
    }
  }));
  // Booking-only hours, for people who may change them. A read failure only hides the editor.
  if (dependencies.hours && sites.length && (await dependencies.canManage?.(actor, workspaceId).catch(() => false))) {
    await Promise.all(sites.map(async (site) => {
      const hours = await dependencies.hours!(site.tenantId).catch(() => null);
      if (hours) site.hours = hours;
    }));
  }
  return { view: options.view, from: range.from, to: range.to, sites };
}

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const bookingHoursChange = z.object({
  workspaceId: z.string().uuid(),
  tenantId: z.string().min(1).max(80),
  /** Null goes back to the business's open hours. */
  hours: z.array(z.object({ day: z.number().int().min(0).max(6), opens: time, closes: time }).strict()
    .refine((r) => r.opens < r.closes, "Each range must end after it starts.")).max(70).nullable(),
}).strict();
export type BookingHoursChange = z.infer<typeof bookingHoursChange>;

export class BookingHoursError extends Error {
  constructor(readonly code: "need_record" | "outside_record" | "forbidden" | "unavailable", message: string) {
    super(message);
    this.name = "BookingHoursError";
  }
}

/**
 * Booking-only hours edited from the bookings screen (bookings spec rule 4:
 * there is one place). They can only narrow the business record's hours, never
 * open a time the business is closed; the store refuses otherwise. Owner or
 * admin of the business only, and the site must be linked to it.
 */
export async function setWorkspaceBookingHours(
  actor: WorkspaceActor,
  input: BookingHoursChange,
  dependencies: {
    linked?: (actor: WorkspaceActor, workspaceId: string) => Promise<string[]>;
    canManage?: (actor: WorkspaceActor, workspaceId: string) => Promise<boolean>;
    save?: typeof setTenantBookingHours;
  } = {},
): Promise<BookingHoursView["bookable"]> {
  if (!bookingStoreWriteEnabled() && !dependencies.save) throw new BookingHoursError("unavailable", "Booking hours can't be changed here yet. Nothing changed.");
  const tenants = await (dependencies.linked ?? linkedTenants)(actor, input.workspaceId);
  if (!tenants.includes(input.tenantId)) throw new BookingNotFoundError();
  if (!(await (dependencies.canManage ?? canManageBookings)(actor, input.workspaceId))) {
    throw new BookingHoursError("forbidden", "Only the owner or an admin of this business can change when it takes bookings.");
  }
  try {
    await (dependencies.save ?? setTenantBookingHours)(input.workspaceId, input.tenantId, input.hours);
  } catch (error) {
    if (error instanceof BookingStoreError && error.code === "hours_need_record") {
      throw new BookingHoursError("need_record", "Add the business's opening hours first. Booking hours can only be narrower than them.");
    }
    if (error instanceof BookingStoreError && error.code === "hours_outside_record") {
      throw new BookingHoursError("outside_record", "Booking hours have to fit inside the business's opening hours. Nothing changed.");
    }
    if (error instanceof BookingStoreError && error.code === "not_found") throw new BookingNotFoundError();
    throw error;
  }
  return input.hours;
}

export const bookingStatusChange = z.object({
  workspaceId: z.string().uuid(),
  tenantId: z.string().min(1).max(80),
  bookingId: z.string().min(1).max(120),
  status: z.enum(["completed", "confirmed", "cancelled"]),
}).strict();
export type BookingStatusChange = z.infer<typeof bookingStatusChange>;

export class BookingNotFoundError extends Error {
  constructor() {
    super("This booking is unavailable.");
    this.name = "BookingNotFoundError";
  }
}

/**
 * Check in (completed), undo a check-in (confirmed) or cancel, from the day or
 * week view. Members take bookings by hand; this decides nothing for the
 * owner. The site must be linked to this business and the person a direct
 * member, or nothing changes.
 */
export class BookingRequestDecisionError extends Error {
  constructor() {
    super("The owner decides booking requests in Needs you.");
    this.name = "BookingRequestDecisionError";
  }
}

export async function changeWorkspaceBooking(
  actor: WorkspaceActor,
  input: BookingStatusChange,
  dependencies: {
    linked?: (actor: WorkspaceActor, workspaceId: string) => Promise<string[]>;
    read?: (tenantId: string) => Promise<Booking[]>;
    update?: typeof updateBooking;
  } = {},
): Promise<BookingRow> {
  const tenants = await (dependencies.linked ?? linkedTenants)(actor, input.workspaceId);
  if (!tenants.includes(input.tenantId)) throw new BookingNotFoundError();
  const current = (await (dependencies.read ?? ((tenantId: string) => getBookings(tenantId)))(input.tenantId)).find((b) => b.id === input.bookingId);
  if (!current) throw new BookingNotFoundError();
  // Approving or declining a request is a Needs you decision, never a list action.
  if (current.status === "requested") throw new BookingRequestDecisionError();
  const updated = await (dependencies.update ?? updateBooking)(input.bookingId, {
    status: input.status,
    ...(input.status === "cancelled" ? { cancelledAt: new Date().toISOString() } : {}),
  }, input.tenantId);
  if (!updated) throw new BookingNotFoundError();
  return row(updated);
}
