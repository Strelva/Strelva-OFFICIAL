import { StPage, StHead, StRows, StRow, StSection, StNotice, StEmpty, StState, StMono, StTextButton, StPillLink } from "@/components/ui/strelva/Kit";
import { addDays, type BookingRow, type BookingView, type SiteBookings, type WorkspaceBookings as Bookings } from "@/products/bookings/server";
import { BookingActions } from "./BookingActions";
import { CalendarConnectionPanel } from "@/experience/scheduling/CalendarConnectionPanel";
import { BookingHoursEditor } from "./BookingHoursEditor";
import { BookingRulesPanel } from "./BookingRulesPanel";
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
    <StRow align="start" title={<span className={muted ? "text-gray-muted line-through" : undefined}>{booking.clientName}</span>} kind={<StMono>{timeLabel(booking.startTime)} – {timeLabel(booking.endTime)}</StMono>} detail={<>{booking.serviceName} · <StState kind={booking.status === "requested" || booking.status === "held" ? "need" : booking.status === "confirmed" || booking.status === "completed" ? "live" : "draft"}>{STATUS[booking.status]}</StState></>} end={!readOnly ? <BookingActions canMarkNoShow={booking.evidence?.canMarkNoShow} workspaceId={workspaceId} tenantId={site.tenantId} bookingId={booking.id} status={booking.status} clientName={booking.clientName} view={view} /> : undefined}>
      <div className={muted ? "text-gray-muted" : undefined}>
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
      {readOnly && !booking.evidence ? <details className="text-sm"><summary className="inline-flex min-h-11 cursor-pointer items-center font-medium focus-visible:outline-2 focus-visible:outline-offset-2">Booking details</summary><p className="mt-2 text-gray-muted">{booking.agentName ? `Booked through ${booking.agentName}. Assistant names are supplied at booking.` : "No assistant source recorded."}</p></details> : null}
      {booking.evidence ? (
        <div className="min-w-0 sm:max-w-[260px]">
          {booking.evidence.outsideRecordHours && (booking.status === "confirmed" || booking.status === "requested") ? <p className="text-sm leading-6 text-critical">Outside the business&apos;s current opening hours. This booking is kept; review it with the customer.</p> : null}
          {booking.evidence.calendar && booking.evidence.calendar.status !== "skipped" ? <p className="text-sm leading-6 text-gray-muted">{booking.evidence.calendar.status === "verified" ? "Calendar copy was verified." : "Not verified on your calendar yet. The booking is kept; the calendar copy needs review."} <time dateTime={booking.evidence.calendar.updatedAt}>{new Date(booking.evidence.calendar.updatedAt).toLocaleString("en-US", { timeZone: site.timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}</time></p> : null}
          {!booking.evidence.calendar && booking.status === "confirmed" && site.evidence?.calendarHealth === "connected" ? <p className="text-sm leading-6 text-gray-muted">No calendar copy has been verified yet. The booking is kept.</p> : null}
          <details className="mt-2 text-sm">
            <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-md font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2">Booking history</summary>
            {booking.agentName ? <p className="mt-2 text-gray-muted">Booked through {booking.agentName}. Assistant names are supplied at booking.</p> : null}
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
    </StRow>
  );
}

function DayList({ site, date, workspaceId, view, readOnly }: { site: SiteBookings; date: string; workspaceId: string; view: BookingView; readOnly?: boolean }) {
  const rows = site.bookings.filter((b) => b.date === date);
  if (rows.length === 0) return <p className="py-3 text-sm text-gray-muted">{view === "day" ? "No appointments this day." : "No bookings."}</p>;
  return <StRows>{rows.map((booking) => <BookingItem key={booking.id} booking={booking} site={site} workspaceId={workspaceId} view={view} readOnly={readOnly} />)}</StRows>;
}

function SiteSection({ site, bookings, workspaceId, many, rulesEnabled }: { site: SiteBookings; bookings: Bookings; workspaceId: string; many: boolean; rulesEnabled: boolean }) {
  const days = bookings.view === "day" ? [bookings.from] : Array.from({ length: 7 }, (_, i) => addDays(bookings.from, i));
  const shown = bookings.source === "agent" ? { ...site, bookings: site.bookings.filter(b => b.agentName) } : site;
  const active = shown.bookings.filter((b) => !["cancelled", "declined", "no_show", "held"].includes(b.status));
  const checkedIn = active.filter((b) => b.status === "completed").length;
  return (
    <StSection title={many ? site.siteName : "Your bookings"} id={`site-${site.tenantId}`}>
      {site.unavailable ? (
        <StNotice>
          <p className="text-sm leading-6 text-gray-muted">Bookings for {site.siteName} couldn&apos;t be read right now. {site.tenantId.startsWith("workspace:") ? "Existing booking records are kept. Reload to try again." : "Nothing is lost, and visitors can still book. Reload to try again."}</p>
        </StNotice>
      ) : (
        <>
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
              {rulesEnabled ? <div className="mb-4"><BookingRulesPanel key={`${workspaceId}:${site.tenantId}`} workspaceId={workspaceId} tenantId={site.tenantId} calendarHealth={site.evidence?.calendarHealth} /></div> : null}
              <BookingHoursEditor workspaceId={workspaceId} tenantId={site.tenantId} siteName={site.siteName} hours={site.hours} />
            </div>
          ) : null}
        </>
      )}
    </StSection>
  );
}

export function WorkspaceBookings({ workspaceId, state, view, rulesEnabled = false }: { workspaceId: string; rulesEnabled?: boolean; state: WorkspaceBookingsState; view: BookingView }) {
  const homeHref = `/workspace?workspaceId=${encodeURIComponent(workspaceId)}`;
  const ready = state.kind === "ready" ? state.bookings : null;
  const agentCount = ready?.sites.reduce((n, s) => n + s.bookings.filter(b => b.agentName).length, 0) ?? 0;
  const step = view === "day" ? 1 : 7;
  const heading = ready
    ? view === "day" ? dayLabel(ready.from) : `Week of ${dayLabel(ready.from, "short")}`
    : view === "day" ? "Today" : "This week";
  return (
    <main data-dashboard data-workspace-theme="linen"><StPage>
      <StHead crumb={{ label: "Home", href: homeHref }} title={heading} meta={view === "day" ? ready?.readOnly ? "Shared appointments, in order. The owner decides booking requests." : "Who's coming in, in order. Check people in as they arrive." : ready?.native ? "Every booking this week, kept in this business’s Bookings System." : "Every booking this week, from your website and the tools it connects to."} />
        {state.kind === "permission" ? (
          <StNotice tone="critical">
            <h2 className="text-lg font-medium">These bookings belong to another business</h2>
            <p className="mt-2 text-sm leading-6 text-gray-muted">Your account isn&apos;t a member of this business. Ask its owner to invite you, or open your own workspace.</p>
            <StTextButton href="/workspace">Open your workspace</StTextButton>
          </StNotice>
        ) : state.kind === "error" ? (
          <StNotice tone="critical">
            <h2 className="text-lg font-medium">Bookings couldn&apos;t load</h2>
            <p className="mt-2 text-sm leading-6 text-gray-muted">Nothing is lost, and visitors can still book. Reload the page to try again.</p>
          </StNotice>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <nav aria-label="Bookings view" className="flex gap-2">
                {(["day", "week"] as const).map(value => <span key={value} aria-current={view === value ? "page" : undefined}><StPillLink href={href(workspaceId, value, ready!.from, ready!.source)} variant="soft">{value === "day" ? "Day" : "Week"}</StPillLink></span>)}
              </nav>
              <nav aria-label={view === "day" ? "Change day" : "Change week"} className="flex flex-wrap items-center gap-4 text-sm">
                <StTextButton href={href(workspaceId, view, addDays(ready!.from, -step), ready!.source)}>{view === "day" ? "Previous day" : "Previous week"}</StTextButton>
                <StTextButton href={href(workspaceId, view, undefined, ready!.source)}>Today</StTextButton>
                <StTextButton href={href(workspaceId, view, addDays(ready!.from, step), ready!.source)}>{view === "day" ? "Next day" : "Next week"}</StTextButton>
              </nav>
            </div>
            {ready!.agentVisibility ? <nav aria-label="Booking source" className="flex flex-wrap gap-3 text-sm">
              {(["all", "agent"] as const).map(source => <span key={source} aria-current={(ready!.source ?? "all") === source ? "page" : undefined}><StPillLink href={href(workspaceId, view, ready!.from, source)} variant="soft">{source === "all" ? "All bookings" : "Booked through assistants"}</StPillLink></span>)}
            </nav> : null}
            {ready!.readOnly ? <p className="mt-4 text-sm text-gray-muted">Shared bookings · read only. The owner decides booking requests.</p> : null}
            {ready!.agentVisibility && view === "week" ? <p className="mt-4 text-sm text-gray-muted">{ready!.sites.some(s => s.unavailable || s.evidence?.truncated) ? "Assistant request count is unavailable for this week." : `${agentCount} assistant ${agentCount === 1 ? "request" : "requests"} for this week. Requests are not confirmed bookings.`}</p> : null}
            {ready!.sites.length === 0 ? (
              <StEmpty>
                <h2 className="text-lg font-medium">{ready!.native ? "Your Bookings System is not set up yet" : "No booking site is connected to this business yet"}</h2>
                <p className="mt-2 text-sm leading-6 text-gray-muted">{ready!.native ? "Set up bookings for this business yourself, or ask your agency. A website is optional." : "Bookings show here once a site that takes them is connected."}</p>
              </StEmpty>
            ) : ready!.sites.map((site) => <SiteSection key={site.tenantId} site={site} bookings={ready!} workspaceId={workspaceId} many={ready!.sites.length > 1} rulesEnabled={rulesEnabled} />)}
          </>
        )}
    </StPage></main>
  );
}
