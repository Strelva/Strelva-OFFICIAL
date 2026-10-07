import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { addDays, type BookingRow, type BookingView, type SiteBookings, type WorkspaceBookings as Bookings } from "@/products/bookings/server";
import { BookingActions } from "./BookingActions";
import { CalendarConnectionPanel } from "@/experience/scheduling/CalendarConnectionPanel";
import { BookingHoursEditor } from "./BookingHoursEditor";
import { ManualBookingForm } from "./ManualBookingForm";

/**
 * The bookings System's day and week views (systems catalog §3.3). The day
 * view is the wellness roster (/dashboard/roster): today's appointments with
 * check-in. The week view is the schedule (/dashboard/schedule): seven days
 * of bookings. Opening hours and services are set on the business record and
 * by Strelva; an owner or admin can only narrow when each site takes bookings
 * (BookingHoursEditor). Server-rendered; the view, the date and the week are
 * plain links.
 */

export type WorkspaceBookingsState =
  | { kind: "ready"; bookings: Bookings }
  | { kind: "permission" }
  | { kind: "error" };

const STATUS: Record<BookingRow["status"], string> = {
  confirmed: "Booked",
  completed: "Checked in",
  cancelled: "Cancelled",
  requested: "Waiting for the owner",
  held: "Waiting for customer confirmation",
  declined: "Declined",
  no_show: "No-show",
};

function dayLabel(date: string, style: "long" | "short" = "long"): string {
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-US", style === "long"
    ? { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }
    : { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function timeLabel(time: string): string {
  const [h, m] = time.split(":").map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return time;
  return `${(h % 12) || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

function href(workspaceId: string, view: BookingView, date?: string, source?: "all" | "agent"): string {
  const params = new URLSearchParams({ workspaceId, view });
  if (date) params.set("date", date);
  if (source === "agent") params.set("source", source);
  return `/workspace/bookings?${params}`;
}

function BookingItem({ booking, site, workspaceId, view, readOnly }: { booking: BookingRow; site: SiteBookings; workspaceId: string; view: BookingView; readOnly?: boolean }) {
  const muted = booking.status === "cancelled" || booking.status === "declined";
  return (
    <li className="flex flex-col gap-3 border-t border-gray-border py-4 first:border-t-0 sm:flex-row sm:items-start sm:justify-between">
      <div className={muted ? "text-gray-muted" : undefined}>
        <p className="text-sm font-medium tabular-nums">{timeLabel(booking.startTime)} – {timeLabel(booking.endTime)}</p>
        <p className={`mt-1 text-base font-medium ${muted ? "line-through" : ""}`}>{booking.clientName}</p>
        <p className="mt-0.5 text-sm text-gray-muted">
          {booking.serviceName}
          <span aria-hidden="true"> · </span>
          <span>{STATUS[booking.status]}</span>
        </p>
        {booking.agentName ? <div className="mt-2 max-w-prose break-words"><span className="inline-block max-w-full rounded-full bg-gray-bg px-3 py-1 text-sm text-warm-black">Booked through {booking.agentName}</span></div> : null}
        {booking.notes ? <p className="mt-2 max-w-prose text-sm leading-6 text-gray-muted">{booking.notes}</p> : null}
        {booking.intake?.length ? <dl className="mt-2 max-w-prose space-y-2 text-sm leading-6 text-gray-muted">{booking.intake.map((entry, index) => <div key={index}><dt className="font-medium">{entry.label}</dt><dd className="whitespace-pre-wrap">{entry.answer}</dd></div>)}</dl> : null}
        {booking.clientPhone || booking.clientEmail ? (
          <p className="mt-1 text-sm text-gray-muted">
            {booking.clientPhone ? <a className="underline-offset-4 hover:underline" href={`tel:${booking.clientPhone}`}>{booking.clientPhone}</a> : null}
            {booking.clientPhone && booking.clientEmail ? <span aria-hidden="true"> · </span> : null}
            {booking.clientEmail ? <a className="underline-offset-4 hover:underline" href={`mailto:${booking.clientEmail}`}>{booking.clientEmail}</a> : null}
          </p>
        ) : null}
      </div>
      {readOnly && !booking.evidence ? <details className="text-sm"><summary className="inline-flex min-h-11 cursor-pointer items-center font-medium focus-visible:outline-2 focus-visible:outline-offset-2">Booking details</summary><p className="mt-2 text-gray-muted">{booking.agentName ? `Booked through ${booking.agentName}. Agent names are supplied at booking.` : "No agent source recorded."}</p></details> : null}
      {booking.evidence ? (
        <div className="min-w-0 sm:max-w-[260px]">
          {booking.evidence.outsideRecordHours && (booking.status === "confirmed" || booking.status === "requested") ? <p className="text-sm leading-6 text-critical">Outside the business&apos;s current opening hours. This booking is kept; review it with the customer.</p> : null}
          {booking.evidence.calendar && booking.evidence.calendar.status !== "skipped" ? <p className="text-sm leading-6 text-gray-muted">{booking.evidence.calendar.status === "verified" ? "Calendar copy was verified." : "Not verified on your calendar yet. The booking is kept; the calendar copy needs review."} <time dateTime={booking.evidence.calendar.updatedAt}>{new Date(booking.evidence.calendar.updatedAt).toLocaleString("en-US", { timeZone: site.timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}</time></p> : null}
          {!booking.evidence.calendar && booking.status === "confirmed" && site.evidence?.calendarHealth === "connected" ? <p className="text-sm leading-6 text-gray-muted">No calendar copy has been verified yet. The booking is kept.</p> : null}
          <details className="mt-2 text-sm">
            <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-md font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2">Booking history</summary>
            {booking.agentName ? <p className="mt-2 text-gray-muted">Booked through {booking.agentName}. Agent names are supplied at booking.</p> : null}
            {booking.evidence.history.length === 0 ? <p className="mt-2 text-gray-muted">No history is recorded yet.</p> : <ol className="mt-2 space-y-2">{booking.evidence.history.map((entry, index) => (
              <li key={index} className="text-gray-muted">
                <p>{entry.kind === "change" ? `${entry.reason ?? STATUS[entry.to]} · ${entry.actor === "visitor" ? "Customer" : entry.actor === "strelva" ? "Strelva" : entry.actor.charAt(0).toUpperCase() + entry.actor.slice(1)}` : `${entry.reminder === "reminder_24h" ? "24-hour reminder" : entry.reminder === "reminder_2h" ? "2-hour reminder" : entry.reminder === "request_owner_reminder" ? "Owner reminder" : "Request expiry notice"} · ${entry.status === "sent" ? "Accepted by email provider" : entry.status === "claimed" ? "Delivery not confirmed" : entry.status === "suppressed" ? "Not sent: email is disabled" : entry.status === "skipped" ? "Not sent" : "Delivery failed"}`}</p>
                <time dateTime={entry.at}>{new Date(entry.at).toLocaleString("en-US", { timeZone: site.timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}</time>
              </li>
            ))}</ol>}
            {booking.evidence.historyTruncated ? <p className="mt-2 text-gray-muted">Showing the latest 50 history entries.</p> : null}
          </details>
        </div>
      ) : null}
      {!readOnly ? <BookingActions canMarkNoShow={booking.evidence?.canMarkNoShow} workspaceId={workspaceId} tenantId={site.tenantId} bookingId={booking.id} status={booking.status} clientName={booking.clientName} view={view} /> : null}
    </li>
  );
}

function DayList({ site, date, workspaceId, view, readOnly }: { site: SiteBookings; date: string; workspaceId: string; view: BookingView; readOnly?: boolean }) {
  const rows = site.bookings.filter((b) => b.date === date);
  if (rows.length === 0) return <p className="py-3 text-sm text-gray-muted">{view === "day" ? "No appointments this day." : "No bookings."}</p>;
  return <ul>{rows.map((booking) => <BookingItem key={booking.id} booking={booking} site={site} workspaceId={workspaceId} view={view} readOnly={readOnly} />)}</ul>;
}

function SiteSection({ site, bookings, workspaceId, many }: { site: SiteBookings; bookings: Bookings; workspaceId: string; many: boolean }) {
  const days = bookings.view === "day" ? [bookings.from] : Array.from({ length: 7 }, (_, i) => addDays(bookings.from, i));
  const shown = bookings.source === "agent" ? { ...site, bookings: site.bookings.filter(b => b.agentName) } : site;
  const active = shown.bookings.filter((b) => !["cancelled", "declined", "no_show", "held"].includes(b.status));
  const checkedIn = active.filter((b) => b.status === "completed").length;
  return (
    <section className="mt-8" aria-labelledby={`site-${site.tenantId}`}>
      <h2 id={`site-${site.tenantId}`} className={many ? "mb-3 text-lg font-medium" : "sr-only"}>{site.siteName}</h2>
      {site.unavailable ? (
        <Card padding="lg" role="status">
          <p className="text-sm leading-6 text-gray-muted">Bookings for {site.siteName} couldn&apos;t be read right now. {site.tenantId.startsWith("workspace:") ? "Existing booking records are kept. Reload to try again." : "Nothing is lost, and visitors can still book. Reload to try again."}</p>
        </Card>
      ) : (
        <Card padding="lg">
          {site.evidence ? <div className="mb-4 space-y-2 text-sm leading-6 text-gray-muted">
            {site.evidence.paused ? <p>Bookings are paused. Existing bookings and customer manage links stay available.</p> : null}
            {site.evidence.calendarHealth === "reconnect" ? <p>Reconnect your calendar. Bookings are kept, and new bookings can still be requested.</p> : site.evidence.calendarHealth === "setup" ? <p>Your calendar needs setup. Bookings work while it is disconnected.</p> : site.evidence.calendarHealth === "not_connected" ? <p>No calendar is connected. Your booking records are kept here.</p> : null}
            {site.hours && site.evidence.calendarHealth !== "connected" ? <details>
              <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2">Reconnect or choose a calendar</summary>
              <CalendarConnectionPanel workspaceId={workspaceId} />
            </details> : null}
            {site.evidence.truncated ? <p role="status">Showing the first 500 bookings in this date range. Open the day view to narrow the list.</p> : null}
          </div> : null}
          {site.manual && !bookings.readOnly ? <ManualBookingForm workspaceId={workspaceId} tenantId={site.tenantId} /> : null}
          {bookings.view === "day" ? (
            <p className="text-sm text-gray-muted">
              {active.length === 0 ? "Nothing booked." : `${active.length} ${active.length === 1 ? "appointment" : "appointments"} · ${checkedIn} checked in`}
            </p>
          ) : null}
          {days.map((date) => (
            <div key={date} className={bookings.view === "week" ? "border-t border-gray-border pt-4 first:border-t-0 first:pt-0 [&+&]:mt-4" : "mt-2"}>
              {bookings.view === "week" ? (
                <h3 className="text-sm font-medium">
                  {dayLabel(date, "short")}
                  {date === site.today ? <span className="ml-2 text-xs font-normal text-gray-muted">Today</span> : null}
                </h3>
              ) : null}
              <DayList readOnly={bookings.readOnly} site={shown} date={date} workspaceId={workspaceId} view={bookings.view} />
            </div>
          ))}
          {site.hours && !bookings.readOnly ? (
            <div className="mt-6">
              <BookingHoursEditor workspaceId={workspaceId} tenantId={site.tenantId} siteName={site.siteName} hours={site.hours} />
            </div>
          ) : null}
        </Card>
      )}
    </section>
  );
}

export function WorkspaceBookings({ workspaceId, state, view }: { workspaceId: string; state: WorkspaceBookingsState; view: BookingView }) {
  const homeHref = `/workspace?workspaceId=${encodeURIComponent(workspaceId)}`;
  const ready = state.kind === "ready" ? state.bookings : null;
  const step = view === "day" ? 1 : 7;
  const heading = ready
    ? view === "day" ? dayLabel(ready.from) : `Week of ${dayLabel(ready.from, "short")}`
    : view === "day" ? "Today" : "This week";
  return (
    <main className="min-h-dvh bg-canvas px-4 py-10 text-warm-black sm:px-6 md:px-8 md:py-12 lg:px-12">
      <div className="mx-auto max-w-[760px]">
        <a className="text-sm text-gray-muted underline-offset-4 hover:underline focus-visible:underline" href={homeHref}>Back to Home</a>
        <p className="mt-10 text-xs font-medium uppercase tracking-[0.14em] text-gray-muted">Bookings</p>
        <h1 className="mt-3 font-display text-[34px] font-medium leading-tight sm:text-[40px]">{heading}</h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-gray-muted">
          {view === "day" ? "Who's coming in, in order. Check people in as they arrive." : ready?.native ? "Every booking this week, kept in this business’s Bookings System." : "Every booking this week, from your website and the tools it connects to."}
        </p>

        {state.kind === "permission" ? (
          <Card padding="lg" className="mt-8" role="alert">
            <h2 className="text-lg font-medium">These bookings belong to another business</h2>
            <p className="mt-2 text-sm leading-6 text-gray-muted">Your account isn&apos;t a member of this business. Ask its owner to invite you, or open your own workspace.</p>
            <Link className="mt-4 inline-block text-sm font-medium underline-offset-4 hover:underline" href="/workspace">Open your workspace</Link>
          </Card>
        ) : state.kind === "error" ? (
          <Card padding="lg" className="mt-8" role="alert">
            <h2 className="text-lg font-medium">Bookings couldn&apos;t load</h2>
            <p className="mt-2 text-sm leading-6 text-gray-muted">Nothing is lost, and visitors can still book. Reload the page to try again.</p>
          </Card>
        ) : (
          <>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <nav aria-label="Bookings view" className="inline-flex rounded-lg border border-gray-border p-0.5">
                {(["day", "week"] as const).map((value) => (
                  <a key={value} href={href(workspaceId, value, ready!.from, ready!.source)} aria-current={view === value ? "page" : undefined}
                    className={`inline-flex items-center max-sm:min-h-11 rounded-md px-3 py-1.5 text-sm font-medium ${view === value ? "bg-warm-black text-warm-white" : "text-gray-muted hover:text-warm-black"}`}>
                    {value === "day" ? "Day" : "Week"}
                  </a>
                ))}
              </nav>
              <nav aria-label={view === "day" ? "Change day" : "Change week"} className="flex items-center gap-1 text-sm">
                <a className="inline-flex items-center max-sm:min-h-11 rounded-md px-2 py-1.5 text-gray-muted hover:bg-gray-bg hover:text-warm-black" href={href(workspaceId, view, addDays(ready!.from, -step), ready!.source)}>
                  {view === "day" ? "Previous day" : "Previous week"}
                </a>
                <a className="inline-flex items-center max-sm:min-h-11 rounded-md px-2 py-1.5 text-gray-muted hover:bg-gray-bg hover:text-warm-black" href={href(workspaceId, view, undefined, ready!.source)}>Today</a>
                <a className="inline-flex items-center max-sm:min-h-11 rounded-md px-2 py-1.5 text-gray-muted hover:bg-gray-bg hover:text-warm-black" href={href(workspaceId, view, addDays(ready!.from, step), ready!.source)}>
                  {view === "day" ? "Next day" : "Next week"}
                </a>
              </nav>
            </div>
            {ready!.agentVisibility ? <nav aria-label="Booking source" className="mt-4 flex flex-wrap gap-3 text-sm">
              {(["all", "agent"] as const).map(source => <a key={source} href={href(workspaceId, view, ready!.from, source)} aria-current={(ready!.source ?? "all") === source ? "page" : undefined} className="inline-flex min-h-11 items-center rounded-md px-3 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2">{source === "all" ? "All bookings" : "Booked through agents"}</a>)}
            </nav> : null}
            {ready!.readOnly ? <p className="mt-4 text-sm text-gray-muted">Shared bookings · read only. The owner decides booking requests.</p> : null}
            {ready!.agentVisibility && view === "week" ? <p className="mt-4 text-sm text-gray-muted">{ready!.sites.some(s => s.unavailable || s.evidence?.truncated) ? "Agent request count is unavailable for this week." : `${ready!.sites.reduce((n, s) => n + s.bookings.filter(b => b.agentName).length, 0)} agent requests for this week. Requests are not confirmed bookings.`}</p> : null}
            {ready!.sites.length === 0 ? (
              <Card padding="lg" className="mt-6">
                <h2 className="text-lg font-medium">{ready!.native ? "Your Bookings System is not set up yet" : "No booking site is connected to this business yet"}</h2>
                <p className="mt-2 text-sm leading-6 text-gray-muted">{ready!.native ? "Ask Strelva to prepare bookings for this business through a Request. A website is optional." : "Bookings show here once Strelva runs a site that takes them for this business."}</p>
              </Card>
            ) : ready!.sites.map((site) => <SiteSection key={site.tenantId} site={site} bookings={ready!} workspaceId={workspaceId} many={ready!.sites.length > 1} />)}
          </>
        )}
      </div>
    </main>
  );
}
