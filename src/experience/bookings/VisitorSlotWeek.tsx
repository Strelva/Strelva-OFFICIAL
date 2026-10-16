import styles from "./visitor.module.css";
import { formatVisitorTime, visitorTimeZoneLabel } from "@/platform/bookings/public-admission-time";
import { visitorWeek, type VisitorClosure } from "@/platform/bookings/visitor-week";

/**
 * XA · E4. The open times as the visitor's week: one column per day on a
 * wide screen, one row per day on a phone, each time a choice. A day the
 * hours record closes says "Closed" in place, with the reason as a small
 * caption under it (and the chip's title), so a narrow column never clips; any other
 * day with nothing open says "Nothing open", never a gray slab. One radio
 * group, so the form has one submit.
 *
 * `value` is what the form posts for a time: its index for a handoff link,
 * its ISO start for an offer link. Every choice's accessible name is the full
 * date and zone, so a screen reader never hears a bare "10:30".
 */
export function VisitorSlotWeek({ slots, timeZone, name, value, legend, closures = [], closed = [], picked }: {
  slots: readonly { start: string }[];
  timeZone: string;
  name: string;
  value: (slot: { start: string }, index: number) => string;
  legend: string;
  closures?: readonly VisitorClosure[];
  /** Same as `closures` (an offer's closedDays), said in place on the day. */
  closed?: readonly VisitorClosure[];
  /** The start the visitor already tapped (from their email), checked when the page opens. */
  picked?: string | null;
}) {
  const week = visitorWeek(slots, timeZone, [...closures, ...closed]);
  const firstStart = slots[0]?.start;
  return <fieldset className={styles.fieldset}>
    <legend className={styles.srOnly}>{legend}</legend>
    {week.range ? <p className={styles.range}>{week.range}{firstStart ? <span className={styles.muted}>Times in {visitorTimeZoneLabel(firstStart, week.zone)}</span> : null}</p> : null}
    <div className={styles.week} style={{ ["--visitor-days" as string]: String(Math.min(week.days.length, 7)) }}>
      {week.days.map(day => <div key={day.key} className={styles.day} data-empty={day.times.length ? undefined : true} data-closed={day.closed ? true : undefined}>
        <p className={styles.dayHead}><span>{day.weekday}</span><b>{day.date}</b></p>
        <div className={styles.times}>
          {day.times.length ? day.times.map(slot => <label key={slot.start} className={styles.time}>
            <input type="radio" name={name} value={value(slot, slot.index)} required defaultChecked={picked ? Date.parse(picked) === Date.parse(slot.start) : undefined} aria-label={formatVisitorTime(slot.start, week.zone)} data-picked={pickedWords(slot.start, week.zone)} />
            <span aria-hidden="true">{slot.label}</span>
          </label>) : day.closed ? <>
            <span className={styles.closed} title={day.closed}>Closed</span>
            {closedWhy(day.closed) ? <span className={styles.closedWhy}>{closedWhy(day.closed)}</span> : null}
          </> : <span className={styles.noTimes}>Nothing open</span>}
        </div>
      </div>)}
    </div>
  </fieldset>;
}

/** The reason a closed day gives ("Thanksgiving" from "Closed, Thanksgiving"), or nothing when it is only "Closed". */
function closedWhy(label: string): string | null {
  const why = label.replace(/^closed\b[,:\s]*/i, "").trim();
  return why ? why.charAt(0).toUpperCase() + why.slice(1) : null;
}

/** "Tuesday, Nov 24 at 9:15 AM": the pick said back under the week; the week already names the zone. */
function pickedWords(iso: string, zone: string): string {
  const at = new Date(iso);
  const day = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "long", month: "short", day: "numeric" }).format(at);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(at);
  return `${day} at ${time}`;
}

/** A closed day as an offer carries it; the same shape the week reads. */
export type VisitorClosedDay = VisitorClosure;
