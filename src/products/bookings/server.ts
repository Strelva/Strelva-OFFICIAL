import { z } from "zod";
import { getBookingConfig, getBookings, updateBooking } from "@/lib/storage/booking-store";
import { zonedTodayIso } from "@/lib/booking";
import { getTenantConfig } from "@/lib/tenants";
import { getTenantSiteName } from "@/lib/tenant-display";
import type { Booking, BookingConfig } from "@/lib/types";
import { callReleaseFlagsRpc } from "@/platform/release-flags/store";
import type { WorkspaceActor } from "@/platform/workspaces/types";

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
}

const defaults: BookingDependencies = {
  bookings: (tenantId, range) => getBookings(tenantId, range),
  config: (tenantId) => getBookingConfig(tenantId),
  siteName: async (tenantId) => getTenantSiteName(tenantId, (await getTenantConfig(tenantId).catch(() => null)) ?? undefined),
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
  return { view: options.view, from: range.from, to: range.to, sites };
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
