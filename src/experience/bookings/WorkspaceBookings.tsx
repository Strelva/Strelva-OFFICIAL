import { actorLabel } from "@/platform/presentation/actor";
import { XaButtonLink, XaEmpty, XaSays, XaStatus, XaTextLink } from "@/components/ui/strelva/Xa";
import { BookingRequestYes } from "./BookingRequestYes";
import { SystemHead, SidePanel } from "@/experience/systems/xa/SystemHead";
import x from "@/experience/systems/xa/system-xa.module.css";
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
 *
 * XA · S2: the System's clay and one state line, the week as open rows
 * grouped by day (status only where it differs from booked), and beside it
 * what people see when they book, drawn from the bookable hours alone.
 */

export type WorkspaceBookingsState =
  | { kind: "ready"; bookings: Bookings }
  | { kind: "permission" }
  | { kind: "error" };

/** Said only where a visit differs from booked (status as exception). */
const STATUS: Record<BookingRow["status"], string> = {
  confirmed: "Booked",
  completed: "Checked in",
  cancelled: "Cancelled",
  requested: "Waits for you",
  held: "Waits for the customer to confirm",
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

/** "08:00" → "8:00": the time column reads at a glance; the full time stays in the label. */
function shortTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return time;
  return `${(h % 12) || 12}:${String(m).padStart(2, "0")}`;
}

function href(workspaceId: string, view: BookingView, date?: string, source?: "all" | "agent"): string {
  const params = new URLSearchParams({ workspaceId, view });
  if (date) params.set("date", date);
  if (source === "agent") params.set("source", source);
  return `/workspace/bookings?${params}`;
}

const WAITS: ReadonlySet<BookingRow["status"]> = new Set(["requested", "held"]);
const OFF: ReadonlySet<BookingRow["status"]> = new Set(["cancelled", "declined", "no_show"]);

const REMINDER: Record<string, string> = { reminder_24h: "24-hour reminder", reminder_2h: "2-hour reminder", request_owner_reminder: "Reminder to you" };
/** A reminder's outcome in owner words. Delivery is never claimed beyond what the provider confirmed. */
function reminderLine(reminder: string, status: string): string {
  const name = REMINDER[reminder] ?? "Notice that the request lapsed";
  return status === "sent" ? `${name} sent` : status === "claimed" ? `${name} may not have arrived` : status === "suppressed" ? `${name} not sent: reminder emails are off for now`
    : status === "skipped" ? `${name} not sent` : `${name} couldn't be sent`;
}

/** The status word a visit shows, or none for an ordinary booked or checked-in visit. */
function exception(booking: BookingRow, view: BookingView, readOnly?: boolean): string | null {
  if (booking.status === "confirmed") return null;
  if (booking.status === "completed") return view === "day" ? STATUS.completed : null;
  if (booking.status === "requested") return readOnly ? "Waits for the owner" : STATUS.requested;
  return STATUS[booking.status];
}

function BookingItem({ booking, site, workspaceId, view, readOnly, agentVisible, when }: { booking: BookingRow; site: SiteBookings; workspaceId: string; view: BookingView; readOnly?: boolean; agentVisible?: boolean; /** Day before the time, for a pinned request. */ when?: string }) {
  const muted = OFF.has(booking.status);
  const tz = (at: string) => new Date(at).toLocaleString("en-US", { timeZone: site.timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  const said = exception(booking, view, readOnly);
  const asked = booking.status === "requested" ? ` · ${booking.clientName} asked for this time` : "";
  const more = booking.notes || booking.intake?.length || booking.evidence || readOnly || (agentVisible && booking.agentName);
  const action = !readOnly ? <BookingActions canMarkNoShow={booking.evidence?.canMarkNoShow} workspaceId={workspaceId} tenantId={site.tenantId} bookingId={booking.id} status={booking.status} clientName={booking.clientName} view={view} /> : null;
  return <li>
    <div className={x.visit} aria-label={`${booking.clientName}, ${timeLabel(booking.startTime)} to ${timeLabel(booking.endTime)}`}>
      <span className={x.visitTime}><time dateTime={`${booking.date}T${booking.startTime}`}>{when ? `${when} ` : ""}{shortTime(booking.startTime)}–{shortTime(booking.endTime)}</time></span>
      <span className={x.visitText}>
        <span className={x.visitName}>{muted ? <s>{booking.clientName}</s> : booking.clientName}</span>
        <span className={x.visitDetail}><span>{booking.serviceName}{asked}</span>{said ? <XaStatus kind={WAITS.has(booking.status) ? "waits" : "draft"} size="sm">{said}</XaStatus> : null}</span>
      </span>
      {action ? <span className={x.visitEnd}>{action}</span> : null}
    </div>
    {more ? <div className={x.bookingMore}>
      {booking.evidence?.outsideRecordHours && (booking.status === "confirmed" || booking.status === "requested") ? <p className={x.sentence} data-tone="waits">Outside the business&apos;s current opening hours. This booking is kept; review it with the customer.</p> : null}
      {booking.evidence?.calendar && booking.evidence.calendar.status !== "skipped" ? <p>{booking.evidence.calendar.status === "verified" ? "Calendar copy was verified." : "Not verified on your calendar yet. The booking is kept; the calendar copy needs review."} <time dateTime={booking.evidence.calendar.updatedAt}>{tz(booking.evidence.calendar.updatedAt)}</time></p> : null}
      {booking.evidence && !booking.evidence.calendar && booking.status === "confirmed" && site.evidence?.calendarHealth === "connected" ? <p>No calendar copy has been verified yet. The booking is kept.</p> : null}
      {booking.notes || booking.intake?.length ? <details>
        <summary>What {booking.clientName} told you</summary>
        {booking.notes ? <p>{booking.notes}</p> : null}
        {booking.intake?.length ? <dl>{booking.intake.map((entry, index) => <div key={index}><dt>{entry.label}</dt><dd>{entry.answer}</dd></div>)}</dl> : null}
        {booking.clientPhone || booking.clientEmail ? <p className={x.textLinks}>{booking.clientPhone ? <a href={`tel:${booking.clientPhone}`}>{booking.clientPhone}</a> : null}{booking.clientEmail ? <a href={`mailto:${booking.clientEmail}`}>{booking.clientEmail}</a> : null}</p> : null}
      </details> : null}
      {readOnly && !booking.evidence ? <details><summary>Booking details</summary><p>{booking.agentName ? `Booked through ${booking.agentName}. Assistant names are supplied at booking.` : "No assistant source recorded."}</p></details> : null}
      {!readOnly && !booking.evidence && agentVisible && booking.agentName ? <details><summary>How it was booked</summary><p>Booked through {booking.agentName}. Assistant names are supplied at booking.</p></details> : null}
      {booking.evidence ? <details>
        <summary>Booking history</summary>
        {booking.agentName && agentVisible ? <p>Booked through {booking.agentName}. Assistant names are supplied at booking.</p> : null}
        {booking.evidence.history.length === 0 ? <p>No history is recorded yet.</p> : <ol>{booking.evidence.history.map((entry, index) => <li key={index}>
          <p>{entry.kind === "change" ? `${entry.reason ?? STATUS[entry.to]} · ${entry.actorSnapshot ? actorLabel(entry.actorSnapshot) : entry.actor === "visitor" ? "Customer" : entry.actor === "strelva" ? "Strelva" : entry.actor.charAt(0).toUpperCase() + entry.actor.slice(1)}` : reminderLine(entry.reminder, entry.status)}</p>
          <time dateTime={entry.at}>{tz(entry.at)}</time>
        </li>)}</ol>}
        {booking.evidence.historyTruncated ? <p>Showing the latest 50 history entries.</p> : null}
      </details> : null}
    </div> : null}
  </li>;
}

function DayList({ site, date, workspaceId, view, readOnly, agentVisible, pinned }: { site: SiteBookings; date: string; workspaceId: string; view: BookingView; readOnly?: boolean; agentVisible?: boolean; /** Requests already pinned at the top with their yes. */ pinned: ReadonlySet<string> }) {
  const all = site.bookings.filter((b) => b.date === date);
  const rows = all.filter(b => !pinned.has(b.id));
  if (rows.length === 0) return <p className={x.quiet}>{all.length ? "Only the request above." : view === "day" ? "No appointments this day." : "No bookings."}</p>;
  return <ul className={x.bookingList}>{rows.map((booking) => <BookingItem key={booking.id} booking={booking} site={site} workspaceId={workspaceId} view={view} readOnly={readOnly} agentVisible={agentVisible} />)}</ul>;
}

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** "08:00" → "8", "13:30" → "1:30": a booking window read at a glance. */
function hourLabel(time: string): string {
  const [h, m] = time.split(":").map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return time;
  return `${(h % 12) || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** What people see when they book: each day's bookable window, or Closed in plain text. Drawn only from recorded hours; no times are invented. */
function WhatPeopleSee({ site }: { site: SiteBookings }) {
  const hours = site.hours;
  const ranges = hours?.bookable ?? hours?.record ?? null;
  if (!ranges) return null;
  return <SidePanel title="What people see when they book" intro={hours?.bookable ? "Your booking hours, narrower than your opening hours." : "Same as your opening hours."}>
    <div className={x.phone} aria-label={`${site.siteName} booking page, by day`}>
      <p className={x.phoneBrand}>{site.siteName}</p>
      <p className={x.phoneTitle}>Book a visit</p>
      <ul className={x.days}>{WEEK_ORDER.map(day => {
        const open = ranges.filter(range => range.day === day).sort((a, b) => a.opens.localeCompare(b.opens));
        return <li key={day} className={x.day}><span className={x.dayName}>{SHORT[day]}</span>
          {open.length ? open.map(range => <span key={`${range.opens}-${range.closes}`} className={x.slot}>{hourLabel(range.opens)}–{hourLabel(range.closes)}</span>) : <span className={x.slot} data-closed="true">Closed</span>}
        </li>;
      })}</ul>
      {site.evidence?.paused ? <p className={x.sentence} data-tone="waits">Paused. Nobody can book right now; existing bookings stay.</p> : null}
    </div>
  </SidePanel>;
}

/** The one sentence that matters this week, in Pebble's words, with one way forward. */
function weekSentence(sites: readonly SiteBookings[], workspaceId: string, source?: "all" | "agent"): { text: string; link?: { href: string; label: string } } | null {
  const rows = sites.flatMap(site => site.unavailable ? [] : site.bookings.map(booking => ({ booking, site })));
  const asked = rows.filter(row => row.booking.status === "requested");
  if (asked.length) {
    const first = asked[0]!.booking;
    return { text: asked.length === 1 ? `${first.clientName} asked for ${dayLabel(first.date, "short").split(",")[0]} at ${timeLabel(first.startTime)}. Confirm it, or say not yet and the time opens again.` : `${asked.length} people asked for a time. Each one waits for your yes at the top.` };
  }
  const missed = rows.filter(row => row.booking.status === "no_show" && row.booking.date <= row.site.today).at(-1);
  if (missed) {
    const first = missed.booking.clientName.split(" ")[0];
    return { text: `${missed.booking.clientName} didn't come in for ${dayLabel(missed.booking.date, "short").split(",")[0]}'s ${timeLabel(missed.booking.startTime)} ${missed.booking.serviceName.toLowerCase()}.`, ...(missed.booking.clientEmail ? { link: { href: `mailto:${missed.booking.clientEmail}`, label: `Write to ${first}` } } : {}) };
  }
  const next = rows.find(row => row.booking.status === "confirmed" && row.booking.date >= row.site.today);
  if (next) return { text: `Next up: ${next.booking.clientName}, ${next.booking.date === next.site.today ? "today" : dayLabel(next.booking.date, "short").split(",")[0]} at ${timeLabel(next.booking.startTime)}.`, link: { href: href(workspaceId, "day", next.booking.date, source), label: next.booking.date === next.site.today ? "Open today" : "Open that day" } };
  return null;
}

function SiteSection({ site, bookings, workspaceId, many }: { site: SiteBookings; bookings: Bookings; workspaceId: string; many: boolean }) {
  const days = bookings.view === "day" ? [bookings.from] : Array.from({ length: 7 }, (_, i) => addDays(bookings.from, i));
  const shown = bookings.source === "agent" ? { ...site, bookings: site.bookings.filter(b => b.agentName) } : site;
  const active = shown.bookings.filter((b) => !["cancelled", "declined", "no_show", "held"].includes(b.status));
  const checkedIn = active.filter((b) => b.status === "completed").length;
  // A request waits at the top with its yes beside it, never below the fold.
  const asked = bookings.readOnly ? [] : shown.bookings.filter(b => b.status === "requested");
  const pinned = new Set(asked.map(b => b.id));
  const homeHref = `/workspace?workspaceId=${encodeURIComponent(workspaceId)}`;
  return <section className={x.week} id={`site-${site.tenantId}`} aria-label={many ? site.siteName : "Your bookings"}>
    {many ? <h2 className={x.panelHead}>{site.siteName}</h2> : null}
    {site.unavailable ? <p className={x.sentence} data-tone="waits" role="status">Bookings for {site.siteName} couldn&apos;t be read right now. {site.tenantId.startsWith("workspace:") ? "Existing booking records are kept. Reload to try again." : "Nothing is lost, and visitors can still book. Reload to try again."}</p> : <>
      {asked.map(booking => <div key={booking.id} className={x.waitsFor} aria-label={`${booking.clientName}'s request waits for you`}>
        <ul className={x.bookingList}><BookingItem booking={booking} site={site} workspaceId={workspaceId} view={bookings.view} agentVisible={bookings.agentVisibility} when={dayLabel(booking.date, "short").split(",")[0]} /></ul>
        <BookingRequestYes workspaceId={workspaceId} bookingId={booking.id} clientName={booking.clientName} homeHref={homeHref} />
      </div>)}
      {site.evidence ? <>
        {site.evidence.calendarHealth === "reconnect" ? <p className={x.sentence} data-tone="waits">Reconnect your calendar. Bookings are kept, and new bookings can still be requested.</p> : site.evidence.calendarHealth === "setup" ? <p className={x.note}>Your calendar needs setup. Bookings work while it is disconnected.</p> : site.evidence.calendarHealth === "not_connected" ? <p className={x.note}>No calendar is connected. Your booking records are kept here.</p> : null}
        {site.evidence.truncated ? <p className={x.note} role="status">Showing the first 500 bookings in this date range. Open the day view to narrow the list.</p> : null}
      </> : null}
      {bookings.view === "day" ? <p className={x.note}>{active.length === 0 ? "Nothing booked." : `${active.length} ${active.length === 1 ? "appointment" : "appointments"} · ${checkedIn} checked in`}</p> : null}
      {bookings.view === "week" && shown.bookings.length === 0 ? <p className={x.note}>Nothing is booked this week. People can book in the hours shown beside this list.</p> : days.map((date) => <div key={date} className={x.main} style={{ gap: 2 }}>
        {bookings.view === "week" ? <h3 className={x.dayHead}>{dayLabel(date, "short")}{date === site.today ? <span>Today</span> : null}</h3> : null}
        <DayList readOnly={bookings.readOnly} site={shown} date={date} workspaceId={workspaceId} view={bookings.view} agentVisible={bookings.agentVisibility} pinned={pinned} />
      </div>)}
    </>}
  </section>;
}

function SiteSide({ site, bookings, workspaceId, rulesEnabled }: { site: SiteBookings; bookings: Bookings; workspaceId: string; rulesEnabled: boolean }) {
  if (site.unavailable) return null;
  // The card above already shows the hours, so the editor is one labeled link, not the same hours again.
  const shownAbove = Boolean(site.hours?.bookable ?? site.hours?.record);
  return <>
    <WhatPeopleSee site={site} />
    {site.hours && !bookings.readOnly ? <BookingHoursEditor workspaceId={workspaceId} tenantId={site.tenantId} siteName={site.siteName} hours={site.hours} summary={!shownAbove} /> : null}
    {site.hours && !bookings.readOnly && rulesEnabled ? <BookingRulesPanel key={`${workspaceId}:${site.tenantId}`} workspaceId={workspaceId} tenantId={site.tenantId} calendarHealth={site.evidence?.calendarHealth} /> : null}
    {site.evidence && site.hours && site.evidence.calendarHealth !== "connected" ? <details className={x.bookingMore}><summary>Reconnect or choose a calendar</summary><CalendarConnectionPanel workspaceId={workspaceId} /></details> : null}
    {site.manual && !bookings.readOnly ? <SidePanel title="Add a booking"><ManualBookingForm workspaceId={workspaceId} tenantId={site.tenantId} /></SidePanel> : null}
  </>;
}

export function WorkspaceBookings({ workspaceId, state, view, rulesEnabled = false }: { workspaceId: string; rulesEnabled?: boolean; state: WorkspaceBookingsState; view: BookingView }) {
  const homeHref = `/workspace?workspaceId=${encodeURIComponent(workspaceId)}`;
  const ready = state.kind === "ready" ? state.bookings : null;
  const agentCount = ready?.sites.reduce((n, s) => n + s.bookings.filter(b => b.agentName).length, 0) ?? 0;
  const step = view === "day" ? 1 : 7;
  const heading = ready
    ? view === "day" ? dayLabel(ready.from) : `Week of ${dayLabel(ready.from, "short")}`
    : view === "day" ? "Today" : "This week";
  const back = <a className={x.back} href={homeHref}>‹ Home</a>;
  const booked = ready?.sites.reduce((n, s) => n + s.bookings.filter(b => !OFF.has(b.status) && b.status !== "held").length, 0) ?? 0;
  const waiting = ready?.sites.reduce((n, s) => n + s.bookings.filter(b => WAITS.has(b.status)).length, 0) ?? 0;
  const paused = ready?.sites.some(s => s.evidence?.paused) ?? false;
  const status = !ready ? undefined : paused ? { kind: "draft" as const, label: "Paused" } : waiting ? { kind: "waits" as const, label: `${waiting} ${waiting === 1 ? "booking waits" : "bookings wait"} for ${ready.readOnly ? "the owner" : "you"}` } : ready.sites.length ? { kind: "live" as const, label: "Taking bookings" } : undefined;
  const says = ready && !ready.readOnly ? weekSentence(ready.sites, workspaceId, ready.source) : null;
  return (
    <div data-dashboard data-workspace-theme="linen"><div className={x.screen}>
      <SystemHead kind="bookings" back={back} title="Bookings" status={status} tone={waiting && !paused ? "waits" : undefined}
        line={ready ? <>{heading} · {booked} booked</> : heading}
        actions={ready ? <nav aria-label="Bookings view" className={x.views}>{(["day", "week"] as const).map(value => <a key={value} href={href(workspaceId, value, ready.from, ready.source)} aria-current={view === value ? "page" : undefined}>{value === "day" ? "Day" : "Week"}</a>)}</nav> : undefined} />
      {state.kind === "permission" ? <XaEmpty size="sm" bare pose="alone" title="These bookings belong to another business" job="Pebble kept them closed to your account" action={<XaButtonLink href="/workspace">Go to Home</XaButtonLink>}>Your account isn&apos;t a member of this business. Ask its owner to invite you, or open your own workspace.</XaEmpty>
        : state.kind === "error" ? <XaEmpty size="sm" bare pose="fixing" title="Bookings couldn't load just now" job="Pebble kept every booking. Visitors can still book." action={<XaTextLink href={href(workspaceId, view)}>Reload</XaTextLink>} />
          : <>
            {view === "day" ? <p className={x.note}>{ready!.readOnly ? "Shared appointments, in order. The owner decides booking requests." : "Who's coming in, in order. Check people in as they arrive."}</p> : null}
            {ready!.readOnly ? <p className={x.note}>Shared bookings · read only. The owner decides booking requests.</p> : null}
            {ready!.sites.length === 0 ? <XaEmpty size="sm" pose="resting" title={ready!.native ? "Your Bookings System is not set up yet" : "No booking site is connected to this business yet"} job={ready!.native ? "Pebble is ready to set up your hours and visits" : "Pebble is waiting for a site that takes bookings"}>{ready!.native ? "Set up bookings for this business yourself, or ask your agency. A website is optional." : "Bookings show here once a site that takes them is connected."}</XaEmpty>
              : <div className={x.body} data-side="wide">
                <div className={x.week}>
                  {says ? <XaSays links={says.link ? [<XaTextLink key="go" href={says.link.href}>{says.link.label}</XaTextLink>] : undefined}>{says.text}</XaSays> : null}
                  <div className={x.weekNav}>
                    <nav aria-label={view === "day" ? "Change day" : "Change week"} className={x.textLinks}>
                      <a href={href(workspaceId, view, addDays(ready!.from, -step), ready!.source)}>{view === "day" ? "Previous day" : "Previous week"}</a>
                      <a href={href(workspaceId, view, undefined, ready!.source)}>Today</a>
                      <a href={href(workspaceId, view, addDays(ready!.from, step), ready!.source)}>{view === "day" ? "Next day" : "Next week"}</a>
                    </nav>
                    {ready!.agentVisibility ? <nav aria-label="Booking source" className={x.views}>{(["all", "agent"] as const).map(source => <a key={source} href={href(workspaceId, view, ready!.from, source)} aria-current={(ready!.source ?? "all") === source ? "page" : undefined}>{source === "all" ? "All bookings" : "Booked through assistants"}</a>)}</nav> : null}
                  </div>
                  {ready!.agentVisibility && view === "week" ? <p className={x.quiet}>{ready!.sites.some(s => s.unavailable || s.evidence?.truncated) ? "Assistant request count is unavailable for this week." : `${agentCount} assistant ${agentCount === 1 ? "request" : "requests"} for this week. Requests are not confirmed bookings.`}</p> : null}
                  {ready!.sites.map((site) => <SiteSection key={site.tenantId} site={site} bookings={ready!} workspaceId={workspaceId} many={ready!.sites.length > 1} />)}
                </div>
                <aside className={x.side} aria-label="How people book">
                  {ready!.sites.map(site => <SiteSide key={site.tenantId} site={site} bookings={ready!} workspaceId={workspaceId} rulesEnabled={rulesEnabled} />)}
                  {paused ? <XaStatus kind="draft" size="sm">Paused. Bookings already made are kept.</XaStatus> : null}
                </aside>
              </div>}
          </>}
    </div></div>
  );
}
