"use client";

import { useId, useMemo, useRef } from "react";
import { motion } from "motion/react";
import { TrendingDown, TrendingUp, MoveRight } from "lucide-react";
import { EntranceProvider, Reveal, entranceTransition, useEntranceTrigger } from "@/components/ui/motion/Entrance";
import { strelvaMotion } from "@/platform/infra/motion";
import { ratingChartGeometry, ratingTrendWord, type RatingPoint } from "./rating-trend";
import { outcomeFont } from "./outcome-font";
import styles from "./outcomes.module.css";

const WIDTH = 600;
const HEIGHT = 200;
/** Points pop behind the line's draw, 60 ms apart. */
const POINTS_START = 0.3;

/**
 * Am I above the line people filter on? The rating line against a dashed
 * cutoff (4.5 by default) with the most recent crossing annotated.
 */
export function RatingTrend({ eyebrow = "Google rating", points, cutoff = 4.5, cutoffNote, crossingNote, side, className }: {
  eyebrow?: string;
  points: RatingPoint[];
  cutoff?: number;
  /** Sourced reason the cutoff matters ("where 31% stop looking"). */
  cutoffNote?: string;
  /** Full crossing annotation ("Jun · same-day replies start"); defaults to "Jul · crossed 4.5". */
  crossingNote?: string;
  /** One supporting figure ("same-day replies", "38 of 38"). */
  side?: { label: string; value: string };
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const entrance = useEntranceTrigger(ref);
  const titleId = useId();
  const areaId = useId();
  const geometry = useMemo(() => ratingChartGeometry(points, { width: WIDTH, height: HEIGHT, cutoff }), [points, cutoff]);
  const word = ratingTrendWord(points);
  const latest = points.at(-1);
  const shown = entrance.started || entrance.snap;
  const TrendIcon = word === "Climbing" ? TrendingUp : word === "Slipping" ? TrendingDown : MoveRight;
  const crossing = geometry.crossing;
  const crossingLabel = crossing ? crossingNote ?? `${points[crossing.crossing.index]?.label ?? ""} · ${crossing.crossing.direction === "up" ? "crossed" : "fell under"} ${cutoff}` : null;
  const summary = latest ? `Rated ${latest.rating.toFixed(1)} in ${latest.label}, ${word.toLowerCase()}. ${points.map(point => `${point.label} ${point.rating.toFixed(1)}`).join(", ")}.` : "";

  return <EntranceProvider value={entrance}>
    <section ref={ref} aria-labelledby={titleId} className={[styles.card, outcomeFont.variable, className].filter(Boolean).join(" ")} data-outcome="rating-trend">
      <Reveal className={styles.ratingTop}>
        <div>
          <p className={styles.eyebrow} id={titleId}>{eyebrow}</p>
          {latest ? <div className={styles.ratingValue}>
            <span className={styles.numeral}>{latest.rating.toFixed(1)}</span>
            <span className={styles.trend} data-word={word}><TrendIcon size={18} aria-hidden="true" />{word}</span>
          </div> : null}
        </div>
        {side ? <p className={styles.side}><span>{side.label}</span><strong>{side.value}</strong></p> : null}
      </Reveal>

      {points.length >= 2 ? <figure className={styles.chart} style={{ margin: 0 }}>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={summary}>
          <defs>
            <linearGradient id={areaId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#3F5E43" stopOpacity="0.12" />
              <stop offset="1" stopColor="#3F5E43" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Static: the cutoff and its label. */}
          <line x1={0} x2={WIDTH} y1={geometry.cutoffY} y2={geometry.cutoffY} stroke="#B4693F" strokeWidth={2} strokeDasharray="10 8" vectorEffect="non-scaling-stroke" />
          <motion.path d={geometry.area} fill={`url(#${areaId})`}
            initial={entrance.snap ? false : { opacity: 0 }}
            animate={{ opacity: shown ? 1 : 0 }}
            transition={entranceTransition(entrance, { duration: 0.4, ease: strelvaMotion.reveal.ease }, 0.3)} />
          <motion.path d={geometry.line} fill="none" stroke="#3F5E43" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
            initial={entrance.snap ? false : { pathLength: 0 }}
            animate={{ pathLength: shown ? 1 : 0 }}
            transition={entranceTransition(entrance, strelvaMotion.draw)} />
          {geometry.coords.map((point, index) => {
            const last = index === geometry.coords.length - 1;
            return <motion.circle key={points[index]?.label ?? index} cx={point.x} cy={point.y} r={last ? 9 : 8}
              fill={last ? "#3F5E43" : "#FFFEFB"} stroke="#3F5E43" strokeWidth={3}
              style={{ transformOrigin: `${point.x}px ${point.y}px`, transformBox: "view-box" }}
              initial={entrance.snap ? false : { scale: 0, opacity: 0 }}
              animate={shown ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
              transition={entranceTransition(entrance, strelvaMotion.gooey, POINTS_START + index * 0.06)} />;
          })}
        </svg>
        {/* The wrapper owns placement; Reveal owns its own transform. */}
        {crossing && crossingLabel ? <span className={styles.crossing} style={{ left: `${(crossing.x / WIDTH) * 100}%`, top: `${(crossing.y / HEIGHT) * 100}%` }}>
          <Reveal as="span" className={`${styles.tooltip} ${styles.tooltipInline}`} delay={0.7}>{crossingLabel}</Reveal>
        </span> : null}
        <span className={styles.cutoffLabel} style={{ top: `${(geometry.cutoffY / HEIGHT) * 100}%` }}>{cutoff.toFixed(1)}{cutoffNote ? ` · ${cutoffNote}` : ""}</span>
        <figcaption className={styles.axis} aria-hidden="true">{points.map(point => <span key={point.label}>{point.label}</span>)}</figcaption>
      </figure> : <div className={styles.empty}>
        <strong>{points.length ? "One reading so far." : "No rating history yet."}</strong>
        <span>The trend appears once Strelva has two months of ratings to compare.</span>
      </div>}
    </section>
  </EntranceProvider>;
}
