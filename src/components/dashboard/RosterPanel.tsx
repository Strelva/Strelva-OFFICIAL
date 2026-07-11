"use client";

import { useState } from "react";
import { CalendarCheck, Check, Clock, Phone } from "lucide-react";
import type { Booking } from "@/lib/types";

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return hhmm;
  const period = h >= 12 ? "PM" : "AM";
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

  const remaining = active.filter((b) => statuses[b.id] !== "completed").length;

  return (
    <div className="h-full overflow-y-auto animate-route-enter px-4 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-5">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted">
            Roster · {friendlyToday(today)}
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-[24px] font-normal tracking-[-0.01em] text-warm-black sm:text-[30px]">
            {active.length === 0
              ? "Nothing booked today"
              : `${active.length} booked today`}
          </h1>
          {active.length > 0 && (
            <p className="mt-3 flex items-center gap-1.5 text-[14px] text-gray-muted">
              <CalendarCheck className="h-4 w-4 text-accent" strokeWidth={1.5} />
              {remaining === 0
                ? "Everyone's checked in"
                : `${remaining} still to check in`}
            </p>
          )}
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-critical0/30 bg-critical0/10 px-3 py-2 text-[13px] text-critical">
            {error}
          </div>
        )}

        {active.length === 0 ? (
          <div className="rounded-xl dashboard-panel p-6 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-accent-dim text-accent">
              <Clock className="h-5 w-5" strokeWidth={1.5} />
            </div>
            <p className="text-[14px] font-medium text-warm-black">
              No appointments booked for today
            </p>
            <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-gray-muted">
              When someone books through your website, they&apos;ll show up here so you can check
              them in with one tap.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {active.map((b) => {
              const status = statuses[b.id];
              const checkedIn = status === "completed";
              return (
                <div key={b.id} className="rounded-xl dashboard-panel p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-[13px] font-medium text-warm-black">
                        <Clock className="h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={1.5} />
                        {formatTime(b.startTime)}
                        <span className="text-gray-muted">–</span>
                        <span className="text-gray-muted">{formatTime(b.endTime)}</span>
                      </div>
                      <p className="mt-1.5 truncate text-[15px] font-medium text-warm-black">
                        {b.clientName}
                      </p>
                      <p className="mt-0.5 truncate text-[13px] text-gray-muted">{b.serviceName}</p>
                      {b.clientPhone && (
                        <a
                          href={`tel:${b.clientPhone}`}
                          className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] text-gray-muted underline-offset-2 hover:text-warm-black hover:underline"
                        >
                          <Phone className="h-3 w-3" strokeWidth={1.5} />
                          {b.clientPhone}
                        </a>
                      )}
                    </div>

                    {checkedIn ? (
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-accent-dim px-3 py-2 text-[12px] font-medium text-accent">
                          <Check className="h-3.5 w-3.5" strokeWidth={2} />
                          Checked in
                        </span>
                        <button
                          type="button"
                          onClick={() => undoCheckIn(b.id)}
                          disabled={pendingId === b.id}
                          className="text-[12px] text-gray-muted underline-offset-2 transition-colors hover:text-warm-black hover:underline disabled:opacity-60"
                        >
                          {pendingId === b.id ? "…" : "Undo"}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => checkIn(b.id)}
                        disabled={pendingId === b.id}
                        className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg bg-accent px-4 text-[13px] font-medium text-on-accent transition-colors hover:bg-accent/85 disabled:opacity-60"
                      >
                        {pendingId === b.id ? "Checking in…" : "Check in"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
