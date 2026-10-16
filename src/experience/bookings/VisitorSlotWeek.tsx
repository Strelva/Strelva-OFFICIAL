import styles from "./visitor.module.css";
import { formatVisitorTime, visitorTimeZoneLabel } from "@/platform/bookings/public-admission-time";
import { visitorWeek, type VisitorClosure } from "@/platform/bookings/visitor-week";

/**
 * XA · E4. The open times as the visitor's week: one column per day on a
 * wide screen, one row per day on a phone, each time a choice. A day the
 * hours record closes says so in place ("Closed, Thanksgiving"); any other
 * day with nothing open says "Nothing open", never a gray slab. One radio
 * group, so the form has one submit.
 *
 * `value` is what the form posts for a time: its index for a handoff link,
 * its ISO start for an offer link. Every choice's accessible name is the full
 * date and zone, so a screen reader never hears a bare "10:30".
 */
export function VisitorSlotWeek({ slots, timeZone, name, value, legend, closures = [] }: {
  slots: readonly { start: string }[];
  timeZone: string;
  name: string;
  value: (slot: { start: string }, index: number) => string;
  legend: string;
  closures?: readonly VisitorClosure[];
}) {
  const week = visitorWeek(slots, timeZone, closures);
  const firstStart = slots[0]?.start;
  return <fieldset className={styles.fieldset}>
    <legend className={styles.srOnly}>{legend}</legend>
    {week.range ? <p className={styles.range}>{week.range}{firstStart ? <span className={styles.muted}>Times in {visitorTimeZoneLabel(firstStart, week.zone)}</span> : null}</p> : null}
    <div className={styles.week} style={{ ["--visitor-days" as string]: String(Math.min(week.days.length, 7)) }}>
      {week.days.map(day => <div key={day.key} className={styles.day} data-empty={day.times.length ? undefined : true} data-closed={day.closed ? true : undefined}>
        <p className={styles.dayHead}><span>{day.weekday}</span><b>{day.date}</b></p>
        <div className={styles.times}>
          {day.times.length ? day.times.map(slot => <label key={slot.start} className={styles.time}>
            <input type="radio" name={name} value={value(slot, slot.index)} required aria-label={formatVisitorTime(slot.start, week.zone)} />
            <span aria-hidden="true">{slot.label}</span>
          </label>) : <span className={day.closed ? styles.closed : styles.noTimes}>{day.closed ?? "Nothing open"}</span>}
        </div>
      </div>)}
    </div>
  </fieldset>;
}
