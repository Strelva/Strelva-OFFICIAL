"use client";

import { useState, type CSSProperties } from "react";
import { StEmpty, StMono, StTextButton } from "@/components/ui/strelva/Kit";
import { calendarWallDate, openCalendarIntervals, type CalendarInterval, type CalendarReservation } from "./calendar-display";
import styles from "./scheduling-calendar.module.css";

const DAY = 86_400_000;
const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const clock = (hour: number) => { const whole = Math.floor(hour); const minutes = Math.round((hour - whole) * 60); return `${whole % 12 || 12}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""}${whole < 12 ? " am" : " pm"}`; };
const dateLabel = (date: Date, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(date);

/** Read-only calendar object. Mutation controls remain with the schedule's owner. */
export function SchedulingCalendar({ availability, reservations, timeZone }: { availability: readonly CalendarInterval[]; reservations: readonly CalendarReservation[]; timeZone?: string }) {
  const [offset, setOffset] = useState(0);
  if (!availability.length && !reservations.length) return <StEmpty>No session windows or reservations yet.</StEmpty>;
  const intervals = [...availability, ...reservations.filter(item => item.status !== "cancelled")];
  if (!intervals.length) return <StEmpty>No open windows. Cancelled reservations remain in the history below.</StEmpty>;
  const first = calendarWallDate(intervals.reduce((earliest, item) => Date.parse(item.start) < Date.parse(earliest) ? item.start : earliest, intervals[0]!.start), timeZone);
  const monday = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate() - (first.getUTCDay() + 6) % 7) + offset * 14 * DAY);
  const endOfView = new Date(monday.getTime() + 14 * DAY);
  const weekend = intervals.some(item => {
    const start = calendarWallDate(item.start, timeZone), end = calendarWallDate(item.end, timeZone);
    for (let day = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())); day < end; day = new Date(day.getTime() + DAY)) {
      if ((day.getUTCDay() === 0 || day.getUTCDay() === 6) && day >= monday && day < endOfView) return true;
    }
    return false;
  });
  const days = weekend ? 7 : 5;
  const visible = intervals.filter(item => calendarWallDate(item.end, timeZone) > monday && calendarWallDate(item.start, timeZone) < endOfView);
  const overnight = visible.some(item => dateKey(calendarWallDate(item.start, timeZone)) !== dateKey(calendarWallDate(item.end, timeZone)));
  const from = overnight ? 0 : Math.min(9, ...visible.map(item => calendarWallDate(item.start, timeZone).getUTCHours()));
  const to = overnight ? 24 : Math.max(17, ...visible.map(item => { const date = calendarWallDate(item.end, timeZone); return date.getUTCHours() + (date.getUTCMinutes() ? 1 : 0); }));
  const span = Math.max(1, to - from);
  const blocks = [
    ...openCalendarIntervals(availability, reservations).map((item, index) => ({ ...item, id: `open-${index}`, title: "Open", status: "open" })),
    ...reservations.filter(item => item.status !== "cancelled").map(item => ({ ...item, id: item.requestId })),
  ];
  const last = Math.max(...intervals.map(item => calendarWallDate(item.end, timeZone).getTime()));
  return <section aria-label="Session calendar" className={styles.calendar}>
    {offset > 0 || last > endOfView.getTime() ? <div className={styles.navigation}><StTextButton disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - 1))}>Earlier</StTextButton><StMono>{dateLabel(monday, { month: "short", day: "numeric" })} – {dateLabel(new Date(endOfView.getTime() - DAY), { month: "short", day: "numeric", year: "numeric" })}</StMono><StTextButton disabled={last <= endOfView.getTime()} onClick={() => setOffset(value => value + 1)}>Later</StTextButton></div> : null}
    <div className={styles.weeks}>
      {[0, 1].map(week => {
        const start = new Date(monday.getTime() + week * 7 * DAY);
        return <div key={week} className={styles.week} style={{ "--calendar-days": days } as CSSProperties}>
          <p className={styles.weekLabel}>{dateLabel(start, { month: "short", day: "numeric" })} – {dateLabel(new Date(start.getTime() + (days - 1) * DAY), { day: "numeric" })}</p>
          <div className={styles.hours}>{Array.from({ length: Math.floor(span / 2) + 1 }, (_, index) => <span key={index} style={{ top: `${index * 2 / span * 100}%` }}>{clock(from + index * 2)}</span>)}</div>
          <div className={styles.dayGrid}>{Array.from({ length: days }, (_, index) => {
            const date = new Date(start.getTime() + index * DAY);
            const active = blocks.some(item => dateKey(calendarWallDate(item.start, timeZone)) <= dateKey(date) && calendarWallDate(item.end, timeZone).getTime() > date.getTime());
            return <div key={index} className={styles.day}>
              <div className={styles.dayHead} data-active={active || undefined}><span>{dateLabel(date, { weekday: "short" })}</span><strong>{date.getUTCDate()}</strong></div>
              <div className={styles.dayBody} style={{ "--calendar-hours": Math.ceil(span / 2) } as CSSProperties}>{blocks.map(block => {
                const blockStart = calendarWallDate(block.start, timeZone), blockEnd = calendarWallDate(block.end, timeZone);
                const low = Math.max(blockStart.getTime(), date.getTime() + from * 3_600_000), high = Math.min(blockEnd.getTime(), date.getTime() + to * 3_600_000);
                if (high <= low) return null;
                const hourStart = (low - date.getTime()) / 3_600_000, hourEnd = (high - date.getTime()) / 3_600_000;
                return <div key={block.id} className={styles.block} data-status={block.status} style={{ top: `${(hourStart - from) / span * 100}%`, height: `${(hourEnd - hourStart) / span * 100}%` }} title={`${block.title} · ${new Date(block.start).toLocaleString("en-US", { timeZone })} to ${new Date(block.end).toLocaleString("en-US", { timeZone })}`}>
                  <span>{block.title}</span><span className={styles.blockTime}>{clock(hourStart)} – {clock(hourEnd)}</span>{block.status !== "open" ? <span className="sr-only">{block.status === "reserved" ? "Reserved in workspace" : block.status === "accepted" ? "Calendar accepted" : "Calendar needs checking"}</span> : null}
                </div>;
              })}</div>
            </div>;
          })}</div>
        </div>;
      })}
    </div>
  </section>;
}
