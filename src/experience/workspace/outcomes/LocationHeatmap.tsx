"use client";

import { useId, useRef, useState } from "react";
import { motion } from "motion/react";
import { EntranceProvider, Reveal, entranceTransition, useEntranceTrigger } from "@/components/ui/motion/Entrance";
import { strelvaMotion } from "@/platform/infra/motion";
import { WEEK_DAYS, formatReplyTime } from "./reply-pattern";
import { HEAT_EMPTY, HEAT_SCALE, formatTileMinutes, heatStep, heatmapVerdict, type HeatmapRow } from "./location-heatmap";
import { outcomeFont } from "./outcome-font";
import styles from "./outcomes.module.css";

const TILE_STEP = 0.015;

/**
 * Which location is slipping? Locations × days, each tile coloured by that
 * day's reply time, a verdict headline computed from the data and at most one
 * action, offered only when a location is slipping.
 */
export function LocationHeatmap({ eyebrow, rows, suggestion, actionLabel, onAction, ratingCutoff = 4.5, className }: {
  eyebrow: string;
  rows: HeatmapRow[];
  /** What Strelva can do about it ("Strelva can route its leads to Amherst's team."). */
  suggestion?: string;
  /** Button label for the slipping location; defaults to "Route {name} leads". */
  actionLabel?: (name: string) => string;
  onAction?: (rowId: string) => void;
  ratingCutoff?: number;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const entrance = useEntranceTrigger(ref);
  const titleId = useId();
  const [active, setActive] = useState<string | null>(null);
  const verdict = heatmapVerdict(rows);
  const shown = entrance.started || entrance.snap;
  const lastTile = rows.length * WEEK_DAYS.length * TILE_STEP;
  const hasRating = rows.some(row => row.rating != null);
  const hasBooked = rows.some(row => row.booked != null);
  const slipping = verdict.worst;
  const missing = <><span aria-hidden="true">–</span><span className="sr-only">Not measured</span></>;

  return <EntranceProvider value={entrance}>
    <section ref={ref} aria-labelledby={titleId} className={[styles.card, outcomeFont.variable, className].filter(Boolean).join(" ")} data-outcome="location-heatmap">
      <Reveal className={styles.heatTop}>
        <div style={{ minWidth: 0, flex: "1 1 420px" }}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h2 id={titleId} className={styles.headline} style={{ fontSize: "clamp(28px, 4.4vw, 44px)" }}>{verdict.headline}</h2>
          <p className={styles.lede}>{verdict.detail}{verdict.worst && suggestion ? ` ${suggestion}` : ""}</p>
        </div>
        {slipping && onAction ? <button type="button" className={styles.action} onClick={() => onAction(slipping.id)}>
          {actionLabel ? actionLabel(slipping.name) : `Route ${slipping.name} leads`}
        </button> : null}
      </Reveal>

      {rows.length ? <div className={styles.heatScroll}>
        <table className={styles.heat}>
          <caption className="sr-only">Typical reply time by location and day</caption>
          <thead><tr><th scope="col"><span className="sr-only">Location</span></th>{WEEK_DAYS.map(day => <th key={day} scope="col">{day}</th>)}{hasRating ? <th scope="col" style={{ textAlign: "right" }}>Rating</th> : null}{hasBooked ? <th scope="col" style={{ textAlign: "right" }}>Booked</th> : null}</tr></thead>
          <tbody>
            {rows.map((row, rowIndex) => {
              const worst = verdict.worst?.id === row.id;
              return <tr key={row.id}>
                <th scope="row">{row.name}{worst ? <small>
                  <motion.span className={styles.statusDot} aria-hidden="true"
                    initial={entrance.snap ? false : { scale: 0 }}
                    animate={{ scale: shown ? 1 : 0 }}
                    transition={entranceTransition(entrance, strelvaMotion.gooey, lastTile + 0.04)} />needs you</small> : null}</th>
                {row.days.map((minutes, dayIndex) => {
                  const step = heatStep(minutes);
                  const key = `${row.id}-${dayIndex}`;
                  const day = WEEK_DAYS[dayIndex] ?? "";
                  const text = minutes === null ? "No leads" : formatTileMinutes(minutes);
                  const description = minutes === null ? `${row.name}, ${day}: no leads` : `${row.name}, ${day}: replies took ${formatReplyTime(minutes)} on a typical lead`;
                  const tile = {
                    className: styles.tile,
                    style: { color: step.ink },
                    initial: entrance.snap ? false as const : { backgroundColor: HEAT_EMPTY.fill },
                    animate: { backgroundColor: shown ? step.fill : HEAT_EMPTY.fill },
                    transition: entranceTransition(entrance, { duration: 0.24, ease: strelvaMotion.reveal.ease }, (rowIndex * WEEK_DAYS.length + dayIndex) * TILE_STEP),
                    onMouseEnter: () => setActive(key),
                    onMouseLeave: () => setActive(null),
                    onFocus: () => setActive(key),
                    onBlur: () => setActive(null),
                  };
                  return <td key={key}>
                    {row.receiptsHref && minutes !== null
                      ? <motion.a href={`${row.receiptsHref}${row.receiptsHref.includes("?") ? "&" : "?"}day=${day.toLowerCase()}`} aria-label={`${description}. Open receipts`} {...tile}>{text}</motion.a>
                      : <motion.span tabIndex={0} role="img" aria-label={description} {...tile}>{text}</motion.span>}
                    {active === key ? <span className={styles.tooltip} aria-hidden="true" style={{ left: "50%", top: -6 }}>{day} · {minutes === null ? "no leads" : `${formatReplyTime(minutes)} to reply`}{row.receiptsHref && minutes !== null ? " · receipts" : ""}</span> : null}
                  </td>;
                })}
                {hasRating ? <td className={styles.figure} data-low={row.rating != null && row.rating < ratingCutoff || undefined}>{row.rating != null ? row.rating.toFixed(1) : missing}</td> : null}
                {hasBooked ? <td className={styles.figure}>{row.booked != null ? row.booked : missing}</td> : null}
              </tr>;
            })}
          </tbody>
        </table>
      </div> : null}

      {rows.length ? <ul className={styles.scale} aria-label="Reply time key, faster to slower">
        <li>faster</li>
        {HEAT_SCALE.map(step => <li key={step.label} data-swatch style={{ background: step.fill }} title={step.label}><span className="sr-only">{step.label}</span></li>)}
        <li>slower</li>
      </ul> : null}
    </section>
  </EntranceProvider>;
}
