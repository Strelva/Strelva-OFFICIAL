"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import type { BookingHoursView } from "@/products/bookings/server";

/**
 * When a site takes bookings, edited from the bookings screen. Booking hours
 * can only be narrower than the business's opening hours (from the business
 * record): each day's times are bounded by that day's opening hours, and a
 * day the business is closed can't be opened here. Saving the opening hours
 * unchanged goes back to "same as opening hours".
 */

type Range = { day: number; opens: string; closes: string };
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function label(time: string): string {
  const [h, m] = time.split(":").map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return time;
  return `${(h % 12) || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

function openDay(record: Range[], day: number): Range | null {
  const ranges = record.filter((r) => r.day === day).sort((a, b) => a.opens.localeCompare(b.opens));
  if (!ranges.length) return null;
  return { day, opens: ranges[0]!.opens, closes: ranges[ranges.length - 1]!.closes };
}

export function summarizeBookingHours(hours: BookingHoursView): string {
  if (!hours.record) return "Bookings follow the site's own schedule.";
  if (!hours.bookable) return "Same as your opening hours.";
  const days = ORDER.flatMap((day) => {
    const ranges = hours.bookable!.filter((r) => r.day === day);
    return ranges.length ? [`${NAMES[day]!.slice(0, 3)} ${ranges.map((r) => `${label(r.opens)}–${label(r.closes)}`).join(", ")}`] : [];
  });
  return days.length ? days.join(" · ") : "Not taking bookings on any day.";
}

export function BookingHoursEditor({ workspaceId, tenantId, siteName, hours }: {
  workspaceId: string;
  tenantId: string;
  siteName: string;
  hours: BookingHoursView;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const record = hours.record ?? [];
  const [days, setDays] = useState<Record<number, { on: boolean; opens: string; closes: string }>>(() => {
    const out: Record<number, { on: boolean; opens: string; closes: string }> = {};
    for (const day of ORDER) {
      const business = openDay(record, day);
      if (!business) continue;
      const narrowed = hours.bookable?.filter((r) => r.day === day) ?? null;
      out[day] = narrowed === null
        ? { on: true, opens: business.opens, closes: business.closes }
        : narrowed.length ? { on: true, opens: narrowed[0]!.opens, closes: narrowed[narrowed.length - 1]!.closes } : { on: false, opens: business.opens, closes: business.closes };
    }
    return out;
  });

  if (!hours.record) {
    return (
      <p className="text-sm leading-6 text-gray-muted">
        Booking hours: add the business&apos;s opening hours first. Booking hours can only be narrower than them.
      </p>
    );
  }

  async function save(next: Range[] | null) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/workspace/bookings/hours", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, tenantId, hours: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(typeof body.error === "string" ? body.error : "That didn't save. Try again.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("That didn't save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const ranges: Range[] = [];
    let same = true;
    for (const day of ORDER) {
      const business = openDay(record, day);
      const value = days[day];
      if (!business || !value) continue;
      if (!value.on) {
        same = false;
        continue;
      }
      if (value.opens >= value.closes) {
        setError(`${NAMES[day]}: the start has to be before the end.`);
        return;
      }
      if (value.opens < business.opens || value.closes > business.closes) {
        setError(`${NAMES[day]}: booking hours have to fit inside ${label(business.opens)}–${label(business.closes)}.`);
        return;
      }
      if (value.opens !== business.opens || value.closes !== business.closes) same = false;
      ranges.push({ day, opens: value.opens, closes: value.closes });
    }
    void save(same ? null : ranges);
  }

  return (
    <div className="border-t border-gray-border pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Booking hours</p>
          <p className="mt-0.5 text-sm text-gray-muted">{summarizeBookingHours(hours)}</p>
        </div>
        {!open ? <Button className="max-sm:min-h-11" size="sm" variant="ghost" onClick={() => setOpen(true)} aria-label={`Change booking hours for ${siteName}`}>Change</Button> : null}
      </div>
      {open ? (
        <form onSubmit={submit} className="mt-4">
          <p className="text-sm leading-6 text-gray-muted">
            Choose when people can book. These can only be narrower than your opening hours; to change opening hours, ask Strelva.
          </p>
          <ul className="mt-3">
            {ORDER.map((day) => {
              const business = openDay(record, day);
              const value = days[day];
              return (
                <li key={day} className="flex flex-col gap-2 border-t border-gray-border py-3 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm">
                    <span className="font-medium">{NAMES[day]}</span>
                    <span className="ml-2 text-gray-muted">{business ? `Open ${label(business.opens)}–${label(business.closes)}` : "Closed"}</span>
                  </div>
                  {business && value ? (
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <label className="inline-flex min-h-11 items-center gap-2">
                        <input type="checkbox" checked={value.on} onChange={(e) => setDays({ ...days, [day]: { ...value, on: e.target.checked } })} />
                        Takes bookings
                      </label>
                      {value.on ? (
                        <>
                          <label className="sr-only" htmlFor={`opens-${tenantId}-${day}`}>{NAMES[day]} bookings from</label>
                          <input id={`opens-${tenantId}-${day}`} type="time" step={900} min={business.opens} max={business.closes} value={value.opens}
                            onChange={(e) => setDays({ ...days, [day]: { ...value, opens: e.target.value } })}
                            className="min-h-11 rounded-md border border-gray-border bg-surface px-2 tabular-nums" />
                          <span aria-hidden="true">to</span>
                          <label className="sr-only" htmlFor={`closes-${tenantId}-${day}`}>{NAMES[day]} bookings until</label>
                          <input id={`closes-${tenantId}-${day}`} type="time" step={900} min={business.opens} max={business.closes} value={value.closes}
                            onChange={(e) => setDays({ ...days, [day]: { ...value, closes: e.target.value } })}
                            className="min-h-11 rounded-md border border-gray-border bg-surface px-2 tabular-nums" />
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {error ? <p role="alert" className="mt-2 text-sm text-critical">{error}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="submit" className="max-sm:min-h-11" size="sm" loading={saving} disabled={saving}>Save booking hours</Button>
            {hours.bookable ? <Button type="button" className="max-sm:min-h-11" size="sm" variant="ghost" disabled={saving} onClick={() => void save(null)}>Use opening hours</Button> : null}
            <Button type="button" className="max-sm:min-h-11" size="sm" variant="ghost" disabled={saving} onClick={() => { setOpen(false); setError(null); }}>Cancel</Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
