"use client";
/**
 * The changed thing, the way its audience sees it (XA · O3, O4). One renderer
 * per preview kind (OwnerDecision.preview); a decision without one shows its
 * review lines flat in the decision panel. Bookings first: the week of the
 * booking page with its open times, and the changed days marked in clay until
 * the change is live.
 */
import { XaPage } from "@/components/ui/strelva/Xa";
import type { DecisionPreview } from "@/platform/needs-you/contracts";
import styles from "./today.module.css";

export function DecisionPreviewView({ preview, changed }: { preview: DecisionPreview; changed: boolean }) {
  switch (preview.kind) {
    case "bookings_week": return <BookingsWeek preview={preview} changed={changed} />;
  }
}

function BookingsWeek({ preview, changed }: { preview: Extract<DecisionPreview, { kind: "bookings_week" }>; changed: boolean }) {
  const rows = Math.max(1, ...preview.days.map(day => day.closed ? 1 : day.times.length));
  return <XaPage address={preview.address} flat label={`${preview.address}, as ${preview.audience} see it`}>
    <div className={styles.week}>
      <p className={styles.weekTitle}>{preview.title}</p>
      {preview.note ? <p className={styles.weekNote}>{preview.note}</p> : null}
      <ol className={styles.weekDays} style={{ gridTemplateColumns: `repeat(${preview.days.length}, minmax(0, 1fr))` }} aria-label="The week">
        {preview.days.map(day => {
          const date = new Date(`${day.date}T12:00:00`);
          const label = date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
          return <li key={day.date} className={styles.weekDay} data-closed={day.closed || undefined} aria-label={day.closed ? `${label}: closed` : `${label}: ${day.times.length} open ${day.times.length === 1 ? "time" : "times"}`}>
            <span className={styles.weekday} aria-hidden="true">{day.weekday}</span>
            <span className={styles.weekDate} aria-hidden="true">{date.getDate()}</span>
            <span className={styles.slots} style={{ gridTemplateRows: `repeat(${rows}, auto)` }} aria-hidden="true">
              {day.closed ? <span className={styles.slot} data-closed data-changed={changed || undefined}>Closed</span>
                : day.times.map(time => <span key={time} className={styles.slot}>{time}</span>)}
            </span>
          </li>;
        })}
      </ol>
    </div>
  </XaPage>;
}
