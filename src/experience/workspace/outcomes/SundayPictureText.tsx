"use client";

import { useId, useRef, type CSSProperties, type ReactNode } from "react";
import { motion, type Transition } from "motion/react";
import { CountUp } from "@/components/ui/motion/CountUp";
import { EntranceProvider, useEntranceTrigger, type EntranceState } from "@/components/ui/motion/Entrance";
import { strelvaMotion } from "@/platform/infra/motion";
import { weeklyPictureLine, weeklyReportBubbles, weeklyReportText, type WeeklyReport } from "./weekly-report";
import { outcomeFont } from "./outcome-font";
import styles from "./outcomes.module.css";

const BUBBLE_GAP = 0.45;

function Arrival({ entrance, delay, className, style, children }: { entrance: EntranceState; delay: number; className?: string; style?: CSSProperties; children: ReactNode }) {
  const shown = entrance.started || entrance.snap;
  const transition: Transition = entrance.snap ? strelvaMotion.reduced : { ...strelvaMotion.reveal, delay, scale: { ...strelvaMotion.gooey, delay } };
  return <motion.li className={className} style={style}
    initial={entrance.snap ? false : { opacity: 0, y: 12, scale: 0.96 }}
    animate={shown ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 12, scale: 0.96 }}
    transition={transition}>{children}</motion.li>;
}

/**
 * The weekly report as the owner sees it on their phone: a story-style
 * picture message, then plain bubbles. Messages arrive in order; there is no
 * autoplaying story progress. The plain SMS fallback comes from the same data.
 */
export function SundayPictureText({ report, sentAt = "Sunday 6:00 PM", time = "6:01", image = "/images/outcomes/dusk.webp", reply, showText = true, className }: {
  report: WeeklyReport;
  sentAt?: string;
  /** Status-bar clock. */
  time?: string;
  image?: string;
  /** An owner reply to show after the bubbles, e.g. "YES". Preview only. */
  reply?: string;
  /** Show the plain-text fallback under the phone. */
  showText?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const entrance = useEntranceTrigger(ref);
  const titleId = useId();
  const picture = weeklyPictureLine(report);
  const bubbles = weeklyReportBubbles(report);
  // Arrival order: picture at 0, then each message 450 ms after the last.
  const delays = { picture: 0, bubble: (index: number) => (index + (picture ? 1 : 0)) * BUBBLE_GAP };
  const replyDelay = delays.bubble(bubbles.length);

  return <EntranceProvider value={entrance}>
    <div ref={ref} className={[styles.scope, outcomeFont.variable, className].filter(Boolean).join(" ")} data-outcome="sunday-picture-text">
      <section aria-labelledby={titleId} className={styles.phone}>
        <div className={styles.screen}>
          <div className={styles.contact}><span aria-hidden="true" /><strong id={titleId}>Strelva</strong><span className="sr-only">Text message preview, {time}</span></div>
          <ol className={styles.thread} aria-label="Messages">
            <li className={styles.sentAt}>{sentAt}</li>
            {picture ? <Arrival entrance={entrance} delay={delays.picture} className={styles.picture} style={{ backgroundImage: `url(${image})` }}>
              <p className={styles.eyebrow} style={{ margin: 0 }}>Your week · {report.place}</p>
              <CountUp className={styles.numeral} value={picture.value} />
              <strong>{picture.unit}</strong>
              {picture.detail ? <p>{picture.detail}</p> : null}
            </Arrival> : null}
            {bubbles.map((text, index) => <Arrival key={text} entrance={entrance} delay={delays.bubble(index)} className={styles.bubble}>{text}</Arrival>)}
            {!picture && !bubbles.length ? <Arrival entrance={entrance} delay={0} className={styles.bubble}>{weeklyReportText(report)}</Arrival> : null}
            {reply ? <Arrival entrance={entrance} delay={replyDelay} className={styles.reply}><span className="sr-only">You replied: </span>{reply}</Arrival> : null}
          </ol>
        </div>
      </section>
      {showText ? <details className={styles.smsText}>
        <summary>Plain text version</summary>
        <p>{weeklyReportText(report)}</p>
      </details> : null}
    </div>
  </EntranceProvider>;
}
