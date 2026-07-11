"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Clock, Plus, Trash2, X } from "lucide-react";
import type { Booking, BookingConfig, DateOverride, WeeklySlot } from "@/lib/types";
import { ConfirmDialog } from "./ConfirmDialog";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const inputClass =
  "rounded-lg border border-gray-border bg-surface-base px-3 py-2 text-[14px] text-warm-black outline-none transition-colors focus:border-accent/40 disabled:opacity-40";

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return hhmm;
  const period = h >= 12 ? "PM" : "AM";
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
}: {
  bookings: Booking[];
  config: BookingConfig;
  overrides: DateOverride[];
  today: string;
}) {
  const [tab, setTab] = useState<"appointments" | "availability">("appointments");

  return (
    <div className="h-full overflow-y-auto animate-route-enter px-4 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-5">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted">
            Schedule
          </p>
          <div className="flex items-center gap-1 rounded-lg border border-glass-border bg-glass p-1">
            <TabButton active={tab === "appointments"} onClick={() => setTab("appointments")}>
              Appointments
            </TabButton>
            <TabButton active={tab === "availability"} onClick={() => setTab("availability")}>
              Availability
            </TabButton>
          </div>
        </div>

        {tab === "appointments" ? (
          <Appointments bookings={bookings} today={today} />
        ) : (
          <Availability config={config} overrides={overrides} today={today} />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
        active ? "bg-accent text-on-accent" : "text-gray-muted hover:text-warm-black"
      }`}
    >
      {children}
    </button>
  );
}

// --- Appointments --------------------------------------------------------------

function Appointments({ bookings, today }: { bookings: Booking[]; today: string }) {
  const [cancelled, setCancelled] = useState<Set<string>>(new Set());
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

  // Verdict: appointments within the next 7 days (today through today+6).
  const weekEnd = useMemo(() => {
    const d = new Date(`${today}T00:00:00`);
    d.setDate(d.getDate() + 6);
    return d.toISOString().slice(0, 10);
  }, [today]);
  const thisWeek = upcoming.filter((b) => b.date <= weekEnd).length;

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
      const res = await fetch(`/api/booking/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (!res.ok) throw new Error();
      setCancelled((prev) => new Set(prev).add(id));
      setConfirmId(null);
    } catch {
      setError("Couldn't cancel that appointment. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (upcoming.length === 0) {
    return (
      <>
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <h2 className="mb-4 font-[family-name:var(--font-display)] text-[22px] font-normal tracking-[-0.01em] text-warm-black">
          No appointments yet
        </h2>
        <div className="rounded-xl dashboard-panel p-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-accent-dim text-accent">
            <CalendarDays className="h-5 w-5" strokeWidth={1.5} />
          </div>
          <p className="text-[14px] font-medium text-warm-black">
            Your booking page is live and ready
          </p>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-gray-muted">
            As soon as someone books a time, their appointment shows up here, grouped by day,
            with one-tap cancel when plans change.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <h2 className="mb-1 font-[family-name:var(--font-display)] text-[22px] font-normal tracking-[-0.01em] text-warm-black">
        You have {thisWeek} {thisWeek === 1 ? "appointment" : "appointments"} this week
      </h2>
      <p className="mb-5 text-[13px] text-gray-muted">
        {upcoming.length} upcoming in total
      </p>

      <div className="space-y-6">
        {groups.map(([date, dayBookings]) => (
          <div key={date}>
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-gray-muted">
              {dayHeading(date, today)}
            </p>
            <div className="space-y-2">
              {dayBookings.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between gap-3 rounded-xl dashboard-panel p-4"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[13px] font-medium text-warm-black">
                      <Clock className="h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={1.5} />
                      {formatTime(b.startTime)}
                      <span className="text-gray-muted">–</span>
                      <span className="text-gray-muted">{formatTime(b.endTime)}</span>
                    </div>
                    <p className="mt-1.5 truncate text-[14px] font-semibold tracking-[-0.01em] text-warm-black">
                      {b.clientName}
                    </p>
                    <p className="mt-0.5 truncate text-[13px] text-gray-muted">{b.serviceName}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfirmId(b.id)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-border px-3 py-2 text-[12px] font-medium text-gray-muted transition-colors hover:border-critical0/40 hover:text-critical"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Cancel
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={confirmId !== null}
        title="Cancel this appointment?"
        message="The time slot reopens for other customers. This can't be undone."
        confirmLabel="Cancel appointment"
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
      const res = await fetch("/api/booking/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error();
      setHoursSaved(true);
    } catch {
      setHoursError("Couldn't save your hours. Please try again.");
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
      const res = await fetch("/api/booking/overrides", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cleaned),
      });
      if (!res.ok) throw new Error();
      setOverridesSaved(true);
    } catch {
      setOverridesError("Couldn't save your closed dates. Please try again.");
    } finally {
      setSavingOverrides(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Weekly hours */}
      <section className="rounded-xl dashboard-panel p-5">
        <h2 className="text-[15px] font-semibold text-warm-black">When you take bookings</h2>
        <p className="mt-1 text-[13px] text-gray-muted">
          Turn a day on or off, and set the hours customers can book within it.
        </p>

        <div className="mt-4 space-y-2">
          {schedule.map((s) => (
            <div key={s.day} className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => patchDay(s.day, { enabled: !s.enabled })}
                className={`w-[86px] shrink-0 rounded-lg px-3 py-2 text-[12px] font-medium transition-colors ${
                  s.enabled
                    ? "bg-accent-dim text-accent"
                    : "border border-gray-border text-gray-muted hover:text-warm-black"
                }`}
              >
                {s.enabled ? "Open" : "Closed"}
              </button>
              <span className="w-[92px] shrink-0 text-[14px] text-warm-black">
                {DAY_NAMES[s.day]}
              </span>
              <input
                type="time"
                value={s.start}
                disabled={!s.enabled}
                onChange={(e) => patchDay(s.day, { start: e.target.value })}
                className={inputClass}
                aria-label={`${DAY_NAMES[s.day]} opening time`}
              />
              <span className="text-[13px] text-gray-muted">to</span>
              <input
                type="time"
                value={s.end}
                disabled={!s.enabled}
                onChange={(e) => patchDay(s.day, { end: e.target.value })}
                className={inputClass}
                aria-label={`${DAY_NAMES[s.day]} closing time`}
              />
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap gap-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-gray-muted">Appointment length (min)</span>
            <input
              type="number"
              min={1}
              max={1440}
              value={slotDuration}
              onChange={(e) => {
                setSlotDuration(Number(e.target.value));
                setHoursSaved(false);
              }}
              className={`w-32 ${inputClass}`}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-gray-muted">Gap between (min)</span>
            <input
              type="number"
              min={0}
              max={1440}
              value={bufferTime}
              onChange={(e) => {
                setBufferTime(Number(e.target.value));
                setHoursSaved(false);
              }}
              className={`w-32 ${inputClass}`}
            />
          </label>
        </div>

        {hoursError && <ErrorBanner className="mt-4">{hoursError}</ErrorBanner>}

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={saveHours}
            disabled={savingHours}
            className="inline-flex min-h-[40px] items-center rounded-lg bg-accent px-4 text-[13px] font-medium text-on-accent transition-colors hover:bg-accent/85 disabled:opacity-60"
          >
            {savingHours ? "Saving…" : "Save hours"}
          </button>
          {hoursSaved && <span className="text-[13px] text-accent">Saved</span>}
        </div>
      </section>

      {/* Closed dates / special hours */}
      <section className="rounded-xl dashboard-panel p-5">
        <h2 className="text-[15px] font-semibold text-warm-black">Closed dates & special hours</h2>
        <p className="mt-1 text-[13px] text-gray-muted">
          Block off a holiday, or open different hours for one day. These override your weekly hours.
        </p>

        {rows.length > 0 && (
          <div className="mt-4 space-y-3">
            {rows.map((r, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-gray-border bg-surface-raised p-3"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="date"
                    value={r.date}
                    onChange={(e) => patchOverride(idx, { date: e.target.value })}
                    className={inputClass}
                    aria-label="Override date"
                  />
                  <div className="flex items-center gap-1 rounded-lg border border-gray-border p-0.5">
                    <button
                      type="button"
                      onClick={() => patchOverride(idx, { available: false })}
                      className={`rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                        !r.available ? "bg-accent text-on-accent" : "text-gray-muted hover:text-warm-black"
                      }`}
                    >
                      Closed
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        patchOverride(idx, {
                          available: true,
                          start: r.start ?? "09:00",
                          end: r.end ?? "17:00",
                        })
                      }
                      className={`rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                        r.available ? "bg-accent text-on-accent" : "text-gray-muted hover:text-warm-black"
                      }`}
                    >
                      Special hours
                    </button>
                  </div>
                  {r.available && (
                    <>
                      <input
                        type="time"
                        value={r.start ?? "09:00"}
                        onChange={(e) => patchOverride(idx, { start: e.target.value })}
                        className={inputClass}
                        aria-label="Special opening time"
                      />
                      <span className="text-[13px] text-gray-muted">to</span>
                      <input
                        type="time"
                        value={r.end ?? "17:00"}
                        onChange={(e) => patchOverride(idx, { end: e.target.value })}
                        className={inputClass}
                        aria-label="Special closing time"
                      />
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => removeOverride(idx)}
                    className="ml-auto inline-flex items-center rounded-lg border border-gray-border p-2 text-gray-muted transition-colors hover:border-critical0/40 hover:text-critical"
                    aria-label="Remove this date"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </button>
                </div>
                <input
                  type="text"
                  value={r.reason ?? ""}
                  onChange={(e) => patchOverride(idx, { reason: e.target.value })}
                  placeholder="Reason (optional): e.g. Thanksgiving"
                  maxLength={200}
                  className={`mt-2 w-full ${inputClass}`}
                />
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={addOverride}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-gray-border px-3 py-2 text-[13px] font-medium text-warm-black transition-colors hover:border-accent/35"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
          Add a date
        </button>

        {overridesError && <ErrorBanner className="mt-4">{overridesError}</ErrorBanner>}

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={saveOverrides}
            disabled={savingOverrides}
            className="inline-flex min-h-[40px] items-center rounded-lg bg-accent px-4 text-[13px] font-medium text-on-accent transition-colors hover:bg-accent/85 disabled:opacity-60"
          >
            {savingOverrides ? "Saving…" : "Save dates"}
          </button>
          {overridesSaved && <span className="text-[13px] text-accent">Saved</span>}
        </div>
      </section>
    </div>
  );
}

function ErrorBanner({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-critical0/30 bg-critical0/10 px-3 py-2 text-[13px] text-critical ${className}`}
    >
      {children}
    </div>
  );
}
