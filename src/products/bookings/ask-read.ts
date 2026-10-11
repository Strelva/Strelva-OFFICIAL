import { assertWorkspaceMember, listWork } from "@/platform/workspaces/repository";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
import { readBusinessRecord } from "@/platform/business-record/service";
import { scheduleSchema } from "@/products/scheduling/contracts";
import { readWorkspacePublicBookingReceipts } from "@/products/scheduling/server";
import { bookingLocalDate, type WorkspaceBookings } from "./server";

export interface AskBookingReadDependencies {
  member: typeof assertWorkspaceMember;
  legacy(actor: WorkspaceActor, workspaceId: string, now: Date): Promise<WorkspaceBookings>;
  work: typeof listWork;
  publicReceipts: typeof readWorkspacePublicBookingReceipts;
  business: typeof readBusinessRecord;
}
const defaults: AskBookingReadDependencies = {
  member: assertWorkspaceMember, work: listWork, publicReceipts: readWorkspacePublicBookingReceipts, business: readBusinessRecord,
  legacy: async (actor, workspaceId, now) => {
    const { readWorkspaceBookings } = await import("./server");
    return readWorkspaceBookings(actor, workspaceId, { view: "week", upcomingDays: 30, now });
  },
};
type Row = { id: string; source: "legacy" | "schedule" | "public_booking"; title: string; start: string; status: "confirmed" | "pending" | "unknown" | "cancelled"; tenantId?: string; workId?: string; evidence: string };

/** Read stored evidence only. No provider availability reads or writes. */
export async function readAskBookingSummary(actor: WorkspaceActor, workspaceId: string, now = new Date(), deps: AskBookingReadDependencies = defaults) {
  await deps.member(actor, workspaceId);
  const to = new Date(now.getTime() + 30 * 86400000);
  const sources: Array<{ source: string; available: boolean; detail: string }> = [];
  async function read<T>(source: string, call: () => Promise<T>): Promise<T | null> {
    try { const result = await call(); sources.push({ source, available: true, detail: "Stored records read now; no provider read-back." }); return result; }
    catch (error) { if (error instanceof WorkspaceAccessError) throw error; sources.push({ source, available: false, detail: "Could not read this source; its count is unknown." }); return null; }
  }
  const [legacy, work, receipts, record] = await Promise.all([
    read("linked-site booking store", () => deps.legacy(actor, workspaceId, now)),
    read("native scheduling work", () => deps.work(actor, workspaceId)),
    read("public website booking receipts", () => deps.publicReceipts(actor, workspaceId, { from: now.toISOString(), to: to.toISOString() })),
    read("business record", () => deps.business(actor, workspaceId)),
  ]);
  const rows = new Map<string, Row>();
  let malformed = false;
  for (const site of legacy?.sites ?? []) {
    if (site.unavailable) { sources.push({ source: `linked site ${site.tenantId}`, available: false, detail: "Booking records unavailable." }); continue; }
    // Compare local wall times in each site's real timezone; UTC dates would
    // misclassify evening bookings and DST transitions.
    const clock = (date: Date) => `${bookingLocalDate(site.timezone, date)}T${new Intl.DateTimeFormat("en-GB", { timeZone: site.timezone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(date)}`;
    const fromLocal = clock(now), toLocal = clock(to);
    for (const booking of site.bookings) {
      const start = `${booking.date}T${booking.startTime}:00`;
      if (start < fromLocal || start >= toLocal || booking.status === "cancelled" || booking.status === "completed") continue;
      const id = `legacy:${site.tenantId}:${booking.id}`;
      rows.set(id, { id, source: "legacy", title: booking.serviceName, start: `${start} (${site.timezone})`, status: booking.status === "confirmed" ? "confirmed" : "pending", tenantId: site.tenantId, evidence: `Linked-site booking store: ${booking.status}` });
    }
  }
  for (const saved of work ?? []) {
    if (saved.productId !== "scheduling" || saved.resourceKind !== "schedule") continue;
    if (saved.workspaceId !== workspaceId) throw new WorkspaceAccessError();
    const parsed = scheduleSchema.safeParse(saved.payload);
    if (!parsed.success) { malformed = true; continue; }
    for (const reservation of parsed.data.reservations) {
      const start = Date.parse(reservation.start);
      if (start < now.getTime() || start >= to.getTime()) continue;
      const id = `schedule:${saved.id}:${reservation.requestId}`;
      rows.set(id, { id, source: "schedule", title: reservation.title, start: reservation.start, workId: saved.id,
        status: reservation.status === "accepted" ? "confirmed" : reservation.status === "cancelled" ? "cancelled" : reservation.status === "unknown" || reservation.status === "writing" ? "unknown" : "pending",
        evidence: `Scheduling revision ${parsed.data.revision}: ${reservation.status}${reservation.verification ? `; read-back ${reservation.verification}` : ""}` });
    }
  }
  // Public receipts and their schedule reservations are the same operation.
  // The receipt overrides it, including cancellation; never count both.
  for (const receipt of receipts?.rows ?? []) {
    const id = `schedule:${receipt.workId}:${receipt.requestId}`;
    rows.set(id, { id, source: "public_booking", title: receipt.title, start: receipt.start, workId: receipt.workId, tenantId: receipt.tenantId,
      status: receipt.status === "confirmed" ? "confirmed" : receipt.status === "cancelled" ? "cancelled" : "pending", evidence: `Public booking receipt ${receipt.id}: ${receipt.status}; provider availability was not queried.` });
  }
  if (malformed || receipts?.truncated || work?.length === 500) sources.push({ source: "coverage", available: false, detail: "Malformed or capped source; full count is unknown." });
  const upcoming = [...rows.values()].filter(row => row.status !== "cancelled").sort((a, b) => a.start.localeCompare(b.start));
  const complete = sources.every(source => source.available) && !upcoming.some(row => row.status === "unknown");
  return {
    sourceProof: "From linked-site booking records, native schedules, public booking receipts and the business record; read now, no live calendar check.",
    readAt: now.toISOString(), range: { from: now.toISOString(), to: to.toISOString(), definition: "Starts in the next 30 days; confirmed only in the upcoming count. Pending and uncertain records are separate." },
    complete, upcomingCount: complete ? upcoming.filter(row => row.status === "confirmed").length : null,
    observedConfirmed: upcoming.filter(row => row.status === "confirmed").length, pendingCount: upcoming.filter(row => row.status === "pending").length, unknownCount: upcoming.filter(row => row.status === "unknown").length,
    bookings: upcoming, sources,
    businessRecord: record ? { revision: record.revision, updatedAt: record.updatedAt, hours: record.facts.hours ?? null, services: record.services } : null,
  };
}
