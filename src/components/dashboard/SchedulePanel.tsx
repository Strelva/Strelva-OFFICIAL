"use client";

import { useMemo, useState } from "react";
import { XaButton, XaEmpty, XaSegmented, XaSystemTile, XaTextLink } from "@/components/ui/strelva/Xa";
import { TodayRoster, rosterHeadline } from "./RosterPanel";
import { useDashboardOptional } from "./DashboardContext";
import { DashNote, DashPage, DashSection, dashStyles as dash } from "./xa/DashboardXa";
import type { Booking, BookingConfig, DateOverride, WeeklySlot } from "@/lib/types";
import { ConfirmDialog } from "./ConfirmDialog";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const inputClass =
  "min-h-[40px] rounded-[var(--st-r-md)] border border-[var(--st-line)] bg-[var(--st-surface)] px-3 text-[15px] tabular-nums text-[var(--st-text)] outline-none transition-colors focus-visible:border-[var(--st-accent)] disabled:opacity-40";

function formatTime(hhmm: string): string {
  const parts = hhmm.split(":").map(Number);
  const h = parts[0];
  const m = parts[1];
  if (h === undefined || Number.isNaN(h)) return hhmm;
  const period = h >= 12 ? "pm" : "am";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

/**
 * Group header label: "Today", "Tomorrow", else "Mon, Jul 14". Anchored to the
 * tenant-local `today` (YYYY-MM-DD) passed from the server — never a UTC date,
 * which would mislabel tonight's appointments as "Tomorrow" after ~8pm ET.
 */
function dayHeading(iso: string, today: string): string {
  if (iso === today) return "Today";
  const d = new Date(`${iso}T00:00:00`);
  const tomorrow = new Date(`${today}T00:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (iso === tomorrow.toISOString().slice(0, 10)) return "Tomorrow";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** Normalize the weekly schedule to 7 rows (Sun→Sat), filling gaps sensibly. */
function normalizeSchedule(schedule: WeeklySlot[]): WeeklySlot[] {
  return DAY_NAMES.map((_, day) => {
    const found = schedule.find((s) => s.day === day);
    return found ?? { day, start: "09:00", end: "17:00", enabled: false };
  });
}

export function SchedulePanel({
  bookings,
  config,
  overrides,
  today,
  initialView = "today",
}: {
  bookings: Booking[];
  config: BookingConfig;
  overrides: DateOverride[];
  today: string;
  initialView?: "today" | "week" | "availability";
}) {
  // One Bookings System: today's roster, the week ahead, and when people can book.
  const [tab, setTab] = useState<"today" | "week" | "availability">(initialView);
  const [statuses, setStatuses] = useState<Record<string, Booking["status"]>>({});
  const todays = bookings.filter((b) => b.date === today);
  const weekCount = useMemo(() => {
    const end = new Date(`${today}T00:00:00`); end.setDate(end.getDate() + 6);
    const last = end.toISOString().slice(0, 10);
    return bookings.filter((b) => b.date >= today && b.date <= last && b.status !== "cancelled").length;
  }, [bookings, today]);
  const title = tab === "today" ? rosterHeadline(todays, statuses)
    : tab === "week" ? (weekCount ? `${weekCount} ${weekCount === 1 ? "appointment" : "appointments"} this week.` : "No one is booked this week.")
      : "When people can book you.";

  return (
    <DashPage
      title={title}
      lead={<XaSystemTile kind="bookings" size={48} label="Bookings" />}
      actions={<XaSegmented label="Bookings view" value={tab} onChange={setTab} options={[{ value: "today", label: "Today" }, { value: "week", label: "This week" }, { value: "availability", label: "When you're open" }]} />}
      label="Bookings"
    >
      {tab === "today" ? <TodayRoster bookings={todays} today={today} onChange={setStatuses} />
        : tab === "week" ? <Appointments bookings={bookings} today={today} />
          : <Availability config={config} overrides={overrides} today={today} />}
    </DashPage>
  );
}

// --- Appointments --------------------------------------------------------------

function Appointments({ bookings, today }: { bookings: Booking[]; today: string }) {
  const dashboard = useDashboardOptional();
  const apiHref = dashboard?.dashboardHref ?? ((path: string) => path);
  const [cancelled, setCancelled] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upcoming = useMemo(
    () =>
      bookings
        .filter((b) => b.date >= today && b.status !== "cancelled" && !cancelled.has(b.id))
        .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)),
    [bookings, today, cancelled]
  );

  const groups = useMemo(() => {
    const map = new Map<string, Booking[]>();
    for (const b of upcoming) {
      const arr = map.get(b.date) ?? [];
      arr.push(b);
      map.set(b.date, arr);
    }
    return Array.from(map.entries());
  }, [upcoming]);

  async function doCancel(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(apiHref(`/api/booking/${id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (!res.ok) throw new Error();
      setCancelled((prev) => new Set(prev).add(id));
      setConfirmId(null);
      setOpenId(null);
    } catch {
      setError("That appointment wasn't cancelled. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (upcoming.length === 0) {
    return (
      <>
        {error ? <DashNote tone="down" role="alert">{error}</DashNote> : null}
        <XaEmpty pose="resting" title="No one is booked yet." job="Your booking page is open and taking times">
          The moment someone books, they show up here by day. Open one to call them or cancel it.
        </XaEmpty>
      </>
    );
  }

  const confirming = upcoming.find((b) => b.id === confirmId) ?? null;
  return (
    <>
      {error ? <DashNote tone="down" role="alert">{error}</DashNote> : null}
      {groups.map(([date, dayBookings]) => (
        <DashSection key={date} label={dayHeading(date, today)}>
          <ul className={dash.list} aria-label={dayHeading(date, today)}>
            {dayBookings.map((b) => {
              const open = openId === b.id;
              return <li key={b.id} className="!block">
                <button type="button" className="flex w-full items-start gap-[14px] border-0 bg-transparent p-0 text-left text-inherit" aria-expanded={open} onClick={() => setOpenId(open ? null : b.id)}>
                  <span className="w-[76px] shrink-0 pt-[1px] text-[15px] tabular-nums text-[var(--st-text)]">{formatTime(b.startTime)}</span>
                  <span className={dash.listText}>
                    <span className={dash.listTitle}>{b.clientName}</span>
                    <span className={dash.listDetail}>{b.serviceName} · until {formatTime(b.endTime)}</span>
                  </span>
                </button>
                {open ? <p className="m-0 mt-3 flex flex-wrap gap-x-2 gap-y-1 pl-[90px] text-[14px] text-[var(--st-text-2)] max-md:pl-0">
                  {b.clientPhone ? <><a className="font-medium text-[var(--st-accent)] hover:underline" href={`tel:${b.clientPhone}`}>Call {b.clientPhone}</a><span aria-hidden="true">·</span></> : null}
                  {b.clientEmail ? <><a className="font-medium text-[var(--st-accent)] hover:underline" href={`mailto:${b.clientEmail}`}>Email</a><span aria-hidden="true">·</span></> : null}
                  <XaTextLink onClick={() => setConfirmId(b.id)} aria-label={`Cancel ${b.clientName} at ${formatTime(b.startTime)}`}>Cancel this appointment</XaTextLink>
                </p> : null}
              </li>;
            })}
          </ul>
        </DashSection>
      ))}

      <ConfirmDialog
        open={confirming !== null}
        title={confirming ? `Cancel ${confirming.clientName} at ${formatTime(confirming.startTime)}?` : "Cancel this appointment?"}
        message="The time opens up for someone else. This can't be undone from here."
        confirmLabel="Cancel the appointment"
        cancelLabel="Keep it"
        destructive
        busy={busy}
        onConfirm={() => confirmId && doCancel(confirmId)}
        onCancel={() => !busy && setConfirmId(null)}
      />
    </>
  );
}

// --- Availability --------------------------------------------------------------

function Availability({
  config,
  overrides,
  today,
}: {
  config: BookingConfig;
  overrides: DateOverride[];
  today: string;
}) {
  const dashboard = useDashboardOptional();
  const apiHref = dashboard?.dashboardHref ?? ((path: string) => path);
  const [schedule, setSchedule] = useState<WeeklySlot[]>(() => normalizeSchedule(config.weeklySchedule));
  const [slotDuration, setSlotDuration] = useState(config.slotDuration);
  const [bufferTime, setBufferTime] = useState(config.bufferTime);
  const [savingHours, setSavingHours] = useState(false);
  const [hoursSaved, setHoursSaved] = useState(false);
  const [hoursError, setHoursError] = useState<string | null>(null);

  const [rows, setRows] = useState<DateOverride[]>(overrides);
  const [savingOverrides, setSavingOverrides] = useState(false);
  const [overridesSaved, setOverridesSaved] = useState(false);
  const [overridesError, setOverridesError] = useState<string | null>(null);

  function patchDay(day: number, patch: Partial<WeeklySlot>) {
    setSchedule((prev) => prev.map((s) => (s.day === day ? { ...s, ...patch } : s)));
    setHoursSaved(false);
  }

  async function saveHours() {
    setSavingHours(true);
    setHoursError(null);
    setHoursSaved(false);
    try {
      const next: BookingConfig = {
        ...config,
        weeklySchedule: schedule,
        slotDuration,
        bufferTime,
      };
      const res = await fetch(apiHref("/api/booking/config"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error();
      setHoursSaved(true);
    } catch {
      setHoursError("Your hours didn't save. Try again.");
    } finally {
      setSavingHours(false);
    }
  }

  function addOverride() {
    setRows((prev) => [...prev, { date: today, available: false, reason: "" }]);
    setOverridesSaved(false);
  }

  function patchOverride(idx: number, patch: Partial<DateOverride>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    setOverridesSaved(false);
  }

  function removeOverride(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
    setOverridesSaved(false);
  }

  async function saveOverrides() {
    // A "Special hours" (available) day MUST carry both a start and an end. If
    // the times are dropped, generateSlots silently falls back to the (disabled)
    // weekly schedule and the day the owner meant to OPEN stays closed — so
    // block the save with an inline error rather than saving nothing.
    if (rows.some((r) => r.available && (!r.start || !r.end))) {
      setOverridesError("Set both a start and end time for special hours.");
      setOverridesSaved(false);
      return;
    }
    setSavingOverrides(true);
    setOverridesError(null);
    setOverridesSaved(false);
    try {
      // Strip empty start/end on closed days + trim reason so the schema is happy.
      const cleaned = rows.map((r) => ({
        date: r.date,
        available: r.available,
        ...(r.available && r.start ? { start: r.start } : {}),
        ...(r.available && r.end ? { end: r.end } : {}),
        ...(r.reason?.trim() ? { reason: r.reason.trim() } : {}),
      }));
      const res = await fetch(apiHref("/api/booking/overrides"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cleaned),
      });
      if (!res.ok) throw new Error();
      setOverridesSaved(true);
    } catch {
      setOverridesError("Your dates didn't save. Try again.");
    } finally {
      setSavingOverrides(false);
    }
  }

  return (
    <>
      <DashSection label="When you take bookings">
        <p className="m-0 text-[15px] text-[var(--st-text-2)]">Open or close each day, and set the hours people can book within it.</p>
        <ul className={dash.list} aria-label="Weekly hours">
          {schedule.map((s) => (
            <li key={s.day} className="flex-wrap items-center">
              <label className="flex w-[150px] shrink-0 items-center gap-3 text-[15px] text-[var(--st-text)]">
                <input type="checkbox" checked={s.enabled} onChange={() => patchDay(s.day, { enabled: !s.enabled })} className="h-4 w-4 accent-[var(--st-accent)]" />
                {DAY_NAMES[s.day]}
              </label>
              {s.enabled ? <span className="flex flex-wrap items-center gap-2">
                <input type="time" value={s.start} onChange={(e) => patchDay(s.day, { start: e.target.value })} className={inputClass} aria-label={`${DAY_NAMES[s.day]} opening time`} />
                <span className="text-[14px] text-[var(--st-text-2)]">to</span>
                <input type="time" value={s.end} onChange={(e) => patchDay(s.day, { end: e.target.value })} className={inputClass} aria-label={`${DAY_NAMES[s.day]} closing time`} />
              </span> : <span className="text-[15px] text-[var(--st-text-3)]">Closed</span>}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-5">
          <label className="flex flex-col gap-2">
            <span className="text-[13px] font-medium text-[var(--st-text-body)]">Appointment length, in minutes</span>
            <input type="number" min={1} max={1440} value={slotDuration} onChange={(e) => { setSlotDuration(Number(e.target.value)); setHoursSaved(false); }} className={`w-36 ${inputClass}`} />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-[13px] font-medium text-[var(--st-text-body)]">Gap between, in minutes</span>
            <input type="number" min={0} max={1440} value={bufferTime} onChange={(e) => { setBufferTime(Number(e.target.value)); setHoursSaved(false); }} className={`w-36 ${inputClass}`} />
          </label>
        </div>
        {hoursError ? <DashNote tone="down" role="alert">{hoursError}</DashNote> : null}
        <div className="flex items-center gap-4">
          <XaButton busy={savingHours} onClick={saveHours}>Save your hours</XaButton>
          {hoursSaved ? <span className="text-[14px] text-[var(--st-accent)]" role="status">Saved. Your booking page uses them now.</span> : null}
        </div>
      </DashSection>

      <DashSection label="Closed dates and special hours" aside={<XaTextLink onClick={addOverride}>Add a date</XaTextLink>}>
        <p className="m-0 text-[15px] text-[var(--st-text-2)]">Close for a holiday, or open different hours for one day. These win over your weekly hours.</p>
        {rows.length > 0 ? (
          <ul className={dash.list} aria-label="Closed dates and special hours">
            {rows.map((r, idx) => (
              <li key={idx} className="flex-col items-stretch">
                <div className="flex flex-wrap items-center gap-3">
                  <input type="date" value={r.date} onChange={(e) => patchOverride(idx, { date: e.target.value })} className={inputClass} aria-label="Date" />
                  <XaSegmented label="Closed or open" value={r.available ? "open" : "closed"} onChange={(value) => patchOverride(idx, value === "open" ? { available: true, start: r.start ?? "09:00", end: r.end ?? "17:00" } : { available: false })}
                    options={[{ value: "closed", label: "Closed" }, { value: "open", label: "Special hours" }]} />
                  {r.available ? <span className="flex flex-wrap items-center gap-2">
                    <input type="time" value={r.start ?? "09:00"} onChange={(e) => patchOverride(idx, { start: e.target.value })} className={inputClass} aria-label="Special opening time" />
                    <span className="text-[14px] text-[var(--st-text-2)]">to</span>
                    <input type="time" value={r.end ?? "17:00"} onChange={(e) => patchOverride(idx, { end: e.target.value })} className={inputClass} aria-label="Special closing time" />
                  </span> : null}
                  <span className="ml-auto"><XaTextLink onClick={() => removeOverride(idx)} aria-label="Remove this date">Remove</XaTextLink></span>
                </div>
                <input type="text" value={r.reason ?? ""} onChange={(e) => patchOverride(idx, { reason: e.target.value })} placeholder="Why, if you like: Thanksgiving" maxLength={200} aria-label="Why" className={`w-full ${inputClass}`} />
              </li>
            ))}
          </ul>
        ) : <p className="m-0 text-[15px] text-[var(--st-text-3)]">No closed dates coming up.</p>}
        {overridesError ? <DashNote tone="down" role="alert">{overridesError}</DashNote> : null}
        <div className="flex items-center gap-4">
          <XaButton busy={savingOverrides} onClick={saveOverrides}>Save dates</XaButton>
          {overridesSaved ? <span className="text-[14px] text-[var(--st-accent)]" role="status">Saved.</span> : null}
        </div>
      </DashSection>
    </>
  );
}
