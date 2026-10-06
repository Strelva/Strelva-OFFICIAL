import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { WorkspaceBookings, type WorkspaceBookingsState } from "@/experience/bookings/WorkspaceBookings";
import type { BookingRow, SiteBookings } from "@/products/bookings/server";
import { WorkspaceBookingsLoading } from "@/experience/bookings/WorkspaceBookingsLoading";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Strelva · Bookings preview", robots: { index: false, follow: false } };

const WORKSPACE = "5e000000-0000-4000-8000-000000000010";

/** Fictional bookings for a fictional wellness business. */
const ROWS: BookingRow[] = [
  { id: "bk_1", date: "2026-11-06", startTime: "09:00", endTime: "10:00", clientName: "Dana Reed", clientEmail: "dana@example.test", clientPhone: "716-555-0100", serviceName: "Massage, 60 min", status: "completed" },
  { id: "bk_2", date: "2026-11-06", startTime: "10:30", endTime: "11:30", clientName: "Sam Lee", clientEmail: "sam@example.test", clientPhone: "", serviceName: "Massage, 60 min", notes: "First visit. Lower back.", status: "confirmed" },
  { id: "bk_3", date: "2026-11-06", startTime: "13:00", endTime: "13:30", clientName: "Ana Ruiz", clientEmail: "ana@example.test", clientPhone: "716-555-0142", serviceName: "Consultation", status: "requested" },
  { id: "bk_4", date: "2026-11-06", startTime: "15:00", endTime: "16:00", clientName: "Lee Park", clientEmail: "", clientPhone: "716-555-0177", serviceName: "Massage, 60 min", status: "cancelled" },
  { id: "bk_5", date: "2026-11-03", startTime: "12:00", endTime: "13:00", clientName: "Jo Banks", clientEmail: "jo@example.test", clientPhone: "", serviceName: "Massage, 60 min", status: "completed" },
  { id: "bk_6", date: "2026-11-07", startTime: "11:00", endTime: "12:30", clientName: "Mia Chen", clientEmail: "mia@example.test", clientPhone: "", serviceName: "Massage, 90 min", status: "confirmed" },
];

export default async function BookingsPreviewPage({ searchParams }: { searchParams: Promise<{ state?: string; view?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state: name, view: viewParam } = await searchParams;
  const view = viewParam === "day" ? "day" : "week";
  const range = view === "day" ? { from: "2026-11-06", to: "2026-11-06" } : { from: "2026-11-02", to: "2026-11-08" };
  const site: SiteBookings = {
    tenantId: "twintrees-a", siteName: "Twin Trees Wellness", timezone: "America/New_York", today: "2026-11-06", unavailable: false,
    bookings: ROWS.filter((row) => row.date >= range.from && row.date <= range.to),
  };
  const ready = (sites: SiteBookings[]): WorkspaceBookingsState => ({ kind: "ready", bookings: { view, ...range, sites } });
  if (name === "loading") return <WorkspaceBookingsLoading />;
  const state: WorkspaceBookingsState = name === "permission" ? { kind: "permission" }
    : name === "error" ? { kind: "error" }
    : name === "empty" ? ready([{ ...site, bookings: [] }])
    : name === "unlinked" ? ready([])
    : name === "unavailable" ? ready([{ ...site, bookings: [], unavailable: true }])
    : name === "two-sites" ? ready([site, { ...site, tenantId: "twintrees-b", siteName: "Twin Trees Spa", bookings: site.bookings.slice(0, 2) }])
    : ready([site]);
  return <WorkspaceBookings workspaceId={WORKSPACE} state={state} view={view} />;
}
