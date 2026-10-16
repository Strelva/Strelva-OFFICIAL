"use client";

import { useState } from "react";
import { XaButton, XaStatus, XaSystemTile, XaTextLink } from "@/components/ui/strelva/Xa";
import { DashEmpty, DashNote, DashPage, dashStyles as styles } from "./xa/DashboardXa";
import type { Booking } from "@/lib/types";

function formatTime(hhmm: string): string {
  const parts = hhmm.split(":").map(Number);
  const h = parts[0];
  const m = parts[1];
  if (h === undefined || Number.isNaN(h)) return hhmm;
  const period = h >= 12 ? "pm" : "am";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

function friendlyToday(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

export function RosterPanel({ bookings, today }: { bookings: Booking[]; today: string }) {
  // Cancelled appointments aren't "booked today" — drop them from the roster.
  const active = bookings
    .filter((b) => b.status !== "cancelled")
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const [statuses, setStatuses] = useState<Record<string, Booking["status"]>>(
    () => Object.fromEntries(active.map((b) => [b.id, b.status]))
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(id: string, status: Booking["status"], failMsg: string) {
    setPendingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/booking/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      setStatuses((prev) => ({ ...prev, [id]: status }));
    } catch {
      setError(failMsg);
    } finally {
      setPendingId(null);
    }
  }

  // Check-in marks the booking done; Undo puts it back to confirmed so a
  // mis-tap is always recoverable (there's no separate "arrived" status).
  const checkIn = (id: string) =>
    setStatus(id, "completed", "Couldn't check that one in. Please try again.");
  const undoCheckIn = (id: string) =>
    setStatus(id, "confirmed", "Couldn't undo that. Please try again.");

  const remaining = active.filter((b) => statuses[b.id] !== "completed");
  const next = remaining[0] ?? null;

  if (active.length === 0) {
    return (
      <DashEmpty pose="resting" title="No one is booked today." job={`Holding ${friendlyToday(today)} open for online bookings`}>
        When someone books through your website, they show up here so you can check them in as they arrive.
      </DashEmpty>
    );
  }

  return (
    <DashPage
      title={remaining.length === 0 ? "Everyone is checked in." : next ? `Next up: ${next.clientName}, ${formatTime(next.startTime)}.` : ""}
      quiet={`${active.length} booked ${friendlyToday(today)}${remaining.length && remaining.length < active.length ? `, ${remaining.length} still to arrive` : ""}.`}
      lead={<XaSystemTile kind="bookings" size={48} label="Bookings" />}
      label="Today's bookings"
    >
      {error ? <DashNote tone="down" role="alert">{error}</DashNote> : null}
      <ul className={styles.list} aria-label="Today's bookings">
        {active.map((b) => {
          const checkedIn = statuses[b.id] === "completed";
          const busy = pendingId === b.id;
          return (
            <li key={b.id}>
              <span className="w-[76px] shrink-0 pt-[1px] text-[15px] tabular-nums text-[var(--st-text)]">{formatTime(b.startTime)}</span>
              <div className={styles.listText}>
                <span className={styles.listTitle}>{b.clientName}</span>
                <span className={styles.listDetail}>
                  {b.serviceName}{b.endTime ? ` · until ${formatTime(b.endTime)}` : ""}
                  {b.clientPhone ? <> · <a className="text-inherit underline-offset-2 hover:underline" href={`tel:${b.clientPhone}`}>{b.clientPhone}</a></> : null}
                </span>
              </div>
              <div className={styles.listEnd}>
                {checkedIn ? (
                  <span className="inline-flex items-center gap-3">
                    <XaStatus kind="live" size="sm">Checked in</XaStatus>
                    <XaTextLink onClick={() => undoCheckIn(b.id)} aria-label={`Undo check-in for ${b.clientName}`}>{busy ? "Undoing" : "Undo"}</XaTextLink>
                  </span>
                ) : (
                  <XaButton size="sm" busy={busy} onClick={() => checkIn(b.id)}>Check in</XaButton>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </DashPage>
  );
}
