import styles from "./visitor.module.css";
import { formatVisitorTime, visitorTimeZoneLabel } from "@/platform/bookings/public-admission-time";

/**
 * XA · E4. The open times as the visitor's week: one column per day on a
 * wide screen, one row per day on a phone, each time a choice. Days between
 * the first and last open day with nothing open say so in place ("No times"),
 * never a gray slab. One radio group, so the form has one submit.
 *
 * `value` is what the form posts for a time: its index for a handoff link,
 * its ISO start for an offer link. Every choice's accessible name is the full
 * date and zone, so a screen reader never hears a bare "10:30".
 */
export function VisitorSlotWeek({ slots, timeZone, name, value, legend, closed = [] }: {
  slots: readonly { start: string }[];
  timeZone: string;
  name: string;
  value: (slot: { start: string }, index: number) => string;
  legend: string;
  /** Local dates (YYYY-MM-DD) the business is closed, with the reason when it gave one ("Thanksgiving"). */
  closed?: readonly VisitorClosedDay[];
}) {
  const zone = safeZone(timeZone);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" });
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short" });
  const date = new Intl.DateTimeFormat("en-US", { timeZone: zone, day: "numeric" });
  const month = new Intl.DateTimeFormat("en-US", { timeZone: zone, month: "long" });
  const time = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" });

  const byDay = new Map<string, { start: string; index: number }[]>();
  slots.forEach((slot, index) => {
    const key = day.format(new Date(slot.start));
    byDay.set(key, [...(byDay.get(key) ?? []), { start: slot.start, index }]);
  });
  const keys = [...byDay.keys()].sort();
  // Fill the calendar days between the first and last open day, at most two weeks.
  const days: string[] = [];
  if (keys.length) {
    const first = Date.parse(`${keys[0]}T12:00:00Z`);
    const last = Date.parse(`${keys[keys.length - 1]}T12:00:00Z`);
    for (let at = first; at <= last && days.length < 14; at += 86_400_000) days.push(new Date(at).toISOString().slice(0, 10));
  }
  const firstStart = slots[0]?.start;
  const range = keys.length ? rangeLabel(keys[0]!, keys[keys.length - 1]!, month) : "";
  const closedOn = new Map(closed.filter(item => days.includes(item.date)).map(item => [item.date, item.label?.trim() || ""]));
  const closures = closureNotes([...closedOn].filter(([, label]) => label).map(([date, label]) => ({ date, label })), month);

  return <fieldset className={styles.fieldset}>
    <legend className={styles.srOnly}>{legend}</legend>
    {range ? <p className={styles.range}>{range}{firstStart ? <span className={styles.muted}>Times in {visitorTimeZoneLabel(firstStart, zone)}</span> : null}</p> : null}
    {closures.map(note => <p key={note} className={styles.closure}>{note}</p>)}
    <div className={styles.week} style={{ ["--visitor-days" as string]: String(Math.min(days.length, 7)) }}>
      {days.map(key => {
        const open = byDay.get(key) ?? [];
        const noon = new Date(`${key}T12:00:00Z`);
        return <div key={key} className={styles.day} data-empty={open.length ? undefined : true}>
          <p className={styles.dayHead}><span>{weekday.format(noon)}</span><b>{date.format(noon)}</b></p>
          <div className={styles.times}>
            {open.length ? open.map(slot => <label key={slot.start} className={styles.time}>
              <input type="radio" name={name} value={value(slot, slot.index)} required aria-label={formatVisitorTime(slot.start, zone)} />
              <span aria-hidden="true">{time.format(new Date(slot.start))}</span>
            </label>) : <span className={styles.noTimes}>{closedOn.has(key) ? "Closed" : "No times"}</span>}
          </div>
        </div>;
      })}
    </div>
  </fieldset>;
}

export interface VisitorClosedDay { date: string; label?: string }

/** "Closed Nov 26–27 for Thanksgiving.": consecutive closed days with the same reason read as one sentence. */
function closureNotes(days: readonly { date: string; label: string }[], month: Intl.DateTimeFormat): string[] {
  const runs: { first: string; last: string; label: string }[] = [];
  for (const day of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    const previous = runs[runs.length - 1];
    if (previous && previous.label === day.label && Date.parse(`${day.date}T12:00:00Z`) - Date.parse(`${previous.last}T12:00:00Z`) === 86_400_000) previous.last = day.date;
    else runs.push({ first: day.date, last: day.date, label: day.label });
  }
  return runs.map(run => {
    const a = new Date(`${run.first}T12:00:00Z`), b = new Date(`${run.last}T12:00:00Z`);
    const short = (at: Date) => month.format(at).slice(0, 3);
    const span = run.first === run.last ? `${short(a)} ${a.getUTCDate()}`
      : short(a) === short(b) ? `${short(a)} ${a.getUTCDate()}–${b.getUTCDate()}` : `${short(a)} ${a.getUTCDate()} to ${short(b)} ${b.getUTCDate()}`;
    const label = run.label.replace(/\.$/, "");
    // A reason that already reads as a sentence ("Closed for staff training") keeps its own words.
    return /^closed\b/i.test(label) ? `${label}, ${span}.` : `Closed ${span} for ${label}.`;
  });
}

function safeZone(zone: string): string {
  try { new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(); return zone; } catch { return "UTC"; }
}

function rangeLabel(first: string, last: string, month: Intl.DateTimeFormat): string {
  const a = new Date(`${first}T12:00:00Z`), b = new Date(`${last}T12:00:00Z`);
  const ma = month.format(a), mb = month.format(b);
  const da = Number(first.slice(8)), db = Number(last.slice(8));
  if (first === last) return `${ma} ${da}`;
  return ma === mb ? `${ma} ${da} to ${db}` : `${ma} ${da} to ${mb} ${db}`;
}
