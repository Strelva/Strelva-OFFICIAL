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

/** Opening hours from the fictional business record: Tuesday to Saturday. */
const OPENING = [2, 3, 4, 5].map((day) => ({ day, opens: "09:00", closes: "19:00" })).concat([{ day: 6, opens: "09:00", closes: "17:00" }]);

export default async function BookingsPreviewPage({ searchParams }: { searchParams: Promise<{ state?: string; view?: string; source?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state: name, view: viewParam, source } = await searchParams;
  const view = viewParam === "day" ? "day" : "week";
  const range = view === "day" ? { from: "2026-11-06", to: "2026-11-06" } : { from: "2026-11-02", to: "2026-11-08" };
  const site: SiteBookings = {
    tenantId: "twintrees-a", siteName: "Twin Trees Wellness", timezone: "America/New_York", today: "2026-11-06", unavailable: false,
    bookings: ROWS.filter((row) => row.date >= range.from && row.date <= range.to),
  };
  const ready = (sites: SiteBookings[], native = false): WorkspaceBookingsState => ({ kind: "ready", bookings: { view, ...range, sites, ...(native ? { native: true } : {}) } });
  if (name === "loading") return <WorkspaceBookingsLoading />;
  const state: WorkspaceBookingsState = name === "permission" ? { kind: "permission" }
    : name === "agent-owner" || name === "agent-provider" || name === "agent-off" ? { kind: "ready", bookings: { view, ...range,
      ...(name !== "agent-off" ? { agentVisibility: true, source: source === "agent" ? "agent" as const : "all" as const } : {}),
      ...(name === "agent-provider" ? { readOnly: true } : {}),
      sites: [{ ...site, bookings: site.bookings.map((booking, index) => ({ ...booking,
        ...(name !== "agent-off" && [1, 2].includes(index) ? { agentName: index === 1 ? "Claude" : "ChatGPT" } : {}),
        evidence: { history: [{ kind: "change" as const, actor: "visitor" as const, from: null, to: booking.status, reason: "Customer confirmed their choice", at: "2026-11-01T13:00:00Z" }], historyTruncated: false, calendar: null, outsideRecordHours: false, canMarkNoShow: false }
      })) }] } }
    : name === "native" ? ready([{ ...site, tenantId: `workspace:${WORKSPACE}`, siteName: "Bookings", manual: true, evidence: { calendarHealth: "not_connected", paused: false, truncated: false } }], true)
    : name === "native-empty" ? ready([], true)
    : name === "error" ? { kind: "error" }
    : name === "empty" ? ready([{ ...site, bookings: [] }])
    : name === "unlinked" ? ready([])
    : name === "unavailable" ? ready([{ ...site, bookings: [], unavailable: true }])
    : name === "two-sites" ? ready([site, { ...site, tenantId: "twintrees-b", siteName: "Twin Trees Spa", bookings: site.bookings.slice(0, 2) }])
    // Booking-only hours (owner or admin, one store in use): narrowed, following opening hours, or no record hours yet.
    : name === "owner-evidence" ? ready([{ ...site, evidence: { calendarHealth: "reconnect", paused: false, truncated: false }, bookings: site.bookings.map((booking, index) => ({ ...booking,
      ...(index === 0 ? { status: "no_show" as const } : {}),
      ...(index === 1 ? { intake: [{ label: "What would you like to discuss?", answer: "Lower back discomfort after long workdays.\nI would like practical stretches to use between appointments." }, { label: "Preferred appointment focus", answer: "Gentle movement and recovery." }] } : {}),
      evidence: { outsideRecordHours: index === 1, canMarkNoShow: index === 1, historyTruncated: false,
        calendar: index === 1 ? { status: "failed" as const, updatedAt: "2026-11-06T12:00:00Z" } : null,
        history: [{ kind: "change" as const, actor: "visitor" as const, from: null, to: "requested" as const, reason: null, at: "2026-11-01T13:00:00Z" },
          { kind: "change" as const, actor: "owner" as const, from: "requested" as const, to: "confirmed" as const, reason: "Owner approved", at: "2026-11-01T14:00:00Z" },
          { kind: "reminder" as const, reminder: "reminder_24h" as const, status: "suppressed" as const, at: "2026-11-05T14:00:00Z" }] }
    })) }])
    : name === "hours" ? ready([{ ...site, hours: { record: OPENING, bookable: [{ day: 2, opens: "10:00", closes: "14:00" }, { day: 3, opens: "10:00", closes: "18:00" }, { day: 4, opens: "10:00", closes: "18:00" }, { day: 5, opens: "10:00", closes: "18:00" }, { day: 6, opens: "10:00", closes: "16:00" }] } }])
    : name === "hours-open" ? ready([{ ...site, hours: { record: OPENING, bookable: null } }])
    : name === "hours-norecord" ? ready([{ ...site, hours: { record: null, bookable: null } }])
    : ready([site]);
  return <WorkspaceBookings workspaceId={WORKSPACE} state={state} view={view} />;
}
