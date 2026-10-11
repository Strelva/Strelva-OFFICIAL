"use client";

import { useId, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { ReceiptText, TrendingUp } from "lucide-react";
import { CountUp, formatDollars, formatInteger } from "@/components/ui/motion/CountUp";
import { EntranceProvider, Reveal, entranceTransition, useEntranceTrigger } from "@/components/ui/motion/Entrance";
import { strelvaMotion } from "@/platform/infra/motion";
import { loopChips, loopHeadline, loopRibbonGeometry, type LoopStage, type LoopStageKey } from "./loop";
import { outcomeFont } from "./outcome-font";
import styles from "./outcomes.module.css";

export interface LoopRibbonProps {
  /** "This week at Hertel Ave". */
  eyebrow: string;
  stages: LoopStage[];
  /** Real comparison only ("+18% vs last week"); omit without a prior week. */
  trend?: string;
  /** One owner-plain sentence of what it meant. */
  footer?: string;
  /** Shown when any stage links to receipts. */
  receiptsNote?: string;
  className?: string;
}

const WIDTH = 1000;
const HEIGHT = 160;

/**
 * Did Strelva bring me business this week? A tapering ribbon
 * found → asked → answered → booked → earned. Unmeasured stages read
 * "Not measured yet"; Found is marked as an estimate.
 */
export function LoopRibbon({ eyebrow, stages, trend, footer, receiptsNote = "Every number opens its receipts", className }: LoopRibbonProps) {
  const ref = useRef<HTMLElement>(null);
  const entrance = useEntranceTrigger(ref);
  const titleId = useId();
  const clipId = useId();
  const gradientId = useId();
  const shapeId = useId();
  const [active, setActive] = useState<LoopStageKey | null>(null);
  const geometry = useMemo(() => loopRibbonGeometry(stages, { width: WIDTH, height: HEIGHT }), [stages]);
  const chips = useMemo(() => loopChips(stages), [stages]);
  const measured = stages.some(stage => stage.value !== null);
  const linked = stages.some(stage => stage.receiptHref && stage.value !== null);
  const shown = entrance.started || entrance.snap;

  return <EntranceProvider value={entrance}>
    <section ref={ref} aria-labelledby={titleId} className={[styles.card, outcomeFont.variable, className].filter(Boolean).join(" ")} data-outcome="loop">
      <Reveal as="header" className={styles.loopHeader}>
        <div>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h2 id={titleId} className={styles.headline}>{loopHeadline(stages)}</h2>
        </div>
        {trend ? <span className={styles.chip}><TrendingUp size={16} aria-hidden="true" />{trend}</span> : null}
      </Reveal>

      <ol className={styles.stages} aria-label="This week, stage by stage">
        {stages.map((stage, index) => {
          const value = stage.value;
          const numeral = value === null ? null : <CountUp className={styles.numeral} value={value} format={stage.kind === "currency" ? formatDollars : formatInteger} delay={index * 0.06} />;
          return <li key={stage.key} className={styles.stage} data-kind={stage.kind} data-active={active === stage.key || undefined}
            onMouseEnter={() => setActive(stage.key)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(stage.key)} onBlur={() => setActive(null)}>
            {numeral === null ? <em className={styles.notMeasured}>Not measured yet</em>
              : stage.receiptHref ? <a href={stage.receiptHref} aria-label={`${stage.kind === "currency" ? formatDollars(value as number) : formatInteger(value as number)} ${stage.label}, open receipts`}>{numeral}</a> : numeral}
            <strong>{stage.label}</strong>
            {stage.estimated || stage.detail ? <small>{stage.estimated ? <span className={styles.estimate}>Estimated{stage.detail ? " · " : ""}</span> : null}{stage.detail}</small> : null}
          </li>;
        })}
      </ol>

      {measured ? <div className={styles.ribbonWrap} aria-hidden="true">
        <svg className={styles.ribbon} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" focusable="false">
          <defs>
            <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#D9E3D4" />
              <stop offset="0.55" stopColor="#8FB083" />
              <stop offset="1" stopColor="#3F5E43" />
            </linearGradient>
            <clipPath id={clipId}>
              {/* Draw role: the ribbon is revealed left to right, 120–720 ms. */}
              <motion.rect x={0} y={0} height={HEIGHT}
                initial={entrance.snap ? false : { width: 0 }}
                animate={{ width: shown ? WIDTH : 0 }}
                transition={entranceTransition(entrance, strelvaMotion.draw, 0.12)} />
            </clipPath>
            <clipPath id={shapeId}><path d={geometry.path} /></clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`}>
            <path d={geometry.path} fill={`url(#${gradientId})`} />
            <g clipPath={`url(#${shapeId})`}>
              {/* Unmeasured stages wash out; the hovered stage brightens. */}
              {geometry.segments.map(segment => <rect key={segment.key} data-segment={segment.key} x={segment.x0} y={0} width={segment.x1 - segment.x0} height={HEIGHT}
                fill={segment.measured ? "#FFFFFF" : "#F7F4EE"}
                fillOpacity={!segment.measured ? 0.78 : active === segment.key ? 0.24 : 0}
                style={{ transition: "fill-opacity var(--motion-feedback) var(--motion-ease)" }} />)}
            </g>
          </g>
        </svg>
        <div className={styles.ribbonChips}>
          {chips.map((chip, index) => {
            const segment = geometry.segments.find(item => item.key === chip.stage);
            if (!segment) return null;
            // The wrapper centres the chip; the inner span owns the gooey scale.
            return <span key={chip.key} style={{ left: `${((segment.x0 + segment.x1) / 2 / WIDTH) * 100}%` }}>
              <motion.span className={`${styles.chip} ${styles.ribbonChip}`}
                initial={entrance.snap ? false : { opacity: 0, scale: 0.6 }}
                animate={shown ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.6 }}
                transition={entranceTransition(entrance, strelvaMotion.gooey, index === 0 ? 0.6 : 0.76)}>{chip.text}</motion.span>
            </span>;
          })}
        </div>
      </div> : <div className={styles.empty}>
        <strong>Nothing is measured yet.</strong>
        <span>Strelva starts counting when your site, inquiries and bookings are connected. Until then every stage stays blank rather than showing a guess.</span>
      </div>}
      {/* Ratio chips are visual; give them to assistive technology as text. */}
      {chips.length ? <p className="sr-only">{chips.map(chip => chip.text).join(". ")}.</p> : null}

      {footer || linked ? <Reveal as="footer" className={styles.footer} delay={0.76}>
        {footer ? <span>{footer}</span> : <span />}
        {linked ? <small><ReceiptText size={16} aria-hidden="true" />{receiptsNote}</small> : null}
      </Reveal> : null}
    </section>
  </EntranceProvider>;
}
