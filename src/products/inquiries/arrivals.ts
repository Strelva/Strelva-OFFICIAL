import { assertWorkspaceMember } from "@/platform/workspaces/repository";
import { WorkspaceAccessError, type WorkspaceActor } from "@/platform/workspaces/types";
import { readAskBookingSummary } from "@/products/bookings/server";
import { readWorkspaceInquiryInbox } from "./workspace-inbox";
import { systemArrivalsSchema, type SystemArrivals } from "./arrivals-contract";

interface ArrivalDependencies {
  member: typeof assertWorkspaceMember;
  inquiries: typeof readWorkspaceInquiryInbox;
  bookings: typeof readAskBookingSummary;
}
const defaults: ArrivalDependencies = { member: assertWorkspaceMember, inquiries: readWorkspaceInquiryInbox, bookings: readAskBookingSummary };

function readableBookingStart(start: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2})? \(([^)]+)\)$/.exec(start);
  if (match) {
    const [, date, hour, minute, zone] = match;
    const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
    return `${day}, ${Number(hour) % 12 || 12}:${minute} ${Number(hour) < 12 ? "AM" : "PM"} · ${zone}`;
  }
  const instant = new Date(start);
  return Number.isFinite(instant.getTime()) ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" }).format(instant) : "Time could not be checked";
}

/** Email-independent, current-authority reads. Never include held/spam records,
 * visitor bearer links, or provider credentials. No notification writes. */
export async function readSystemArrivals(actor: WorkspaceActor, workspaceId: string, now = new Date(), deps = defaults, inquiryEnabled = true): Promise<SystemArrivals> {
  await deps.member(actor, workspaceId);
  const results = await Promise.allSettled([inquiryEnabled ? deps.inquiries(actor, workspaceId) : Promise.resolve(null), deps.bookings(actor, workspaceId, now)]);
  // Revoked membership must not leave the other source's records visible.
  for (const result of results) if (result.status === "rejected" && result.reason instanceof WorkspaceAccessError) throw result.reason;
  const [inquiries, bookings] = results;
  const unavailable: SystemArrivals["unavailable"] = [];
  const items: SystemArrivals["items"] = [];
  const query = new URLSearchParams({ workspaceId });
  if (inquiries.status === "rejected") unavailable.push("inquiries");
  else if (inquiries.value) {
    const data = inquiries.value;
    if (data.denied.length || data.sites.some(site => site.unavailable)) unavailable.push("inquiries");
    const recent = data.sites.flatMap(site => site.unavailable ? [] : site.leads.map(lead => ({ site, lead })))
      .filter(({ lead }) => Number.isFinite(Date.parse(lead.createdAt)) && Date.parse(lead.createdAt) >= now.getTime() - 30 * 86400000 && Date.parse(lead.createdAt) <= now.getTime())
      .sort((a, b) => Date.parse(b.lead.createdAt) - Date.parse(a.lead.createdAt));
    for (const { site, lead } of recent.slice(0, 6)) items.push({ id: `inquiry:${site.key}:${lead.id}`, kind: "inquiry",
      title: `${lead.name || "Someone"} reached out`, detail: `${site.siteName} · ${lead.createdAt.slice(0, 10)}`,
      href: `/workspace/inquiries?${query}` });
  }
  if (bookings.status === "rejected") unavailable.push("bookings");
  else {
    if (!bookings.value.complete) unavailable.push("bookings");
    for (const booking of bookings.value.bookings.filter(row => row.status !== "cancelled").slice(0, 6)) items.push({
      id: `booking:${booking.id}`, kind: "booking", title: booking.title,
      detail: `${booking.status === "confirmed" ? "Confirmed" : booking.status === "pending" ? "Waiting for confirmation" : "Status unconfirmed"} · ${readableBookingStart(booking.start)}`,
      href: booking.workId ? `/workspace?${query}&${new URLSearchParams({ work: booking.workId })}` : `/workspace/bookings?${query}&${new URLSearchParams({ view: "day", date: booking.start.slice(0, 10) })}`,
    });
  }
  return systemArrivalsSchema.parse({ workspaceId, readAt: now.toISOString(), sources: inquiryEnabled ? ["inquiries", "bookings"] : ["bookings"], items, unavailable });
}
