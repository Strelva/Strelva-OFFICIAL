"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { motion, type TargetAndTransition, type Transition } from "motion/react";
import { EntranceProvider, Reveal, entranceTransition, useEntranceTrigger } from "@/components/ui/motion/Entrance";
import { strelvaMotion } from "@/lib/motion";
import { WEEK_DAYS, formatReplyTime, pinLayout, replyVerdict, type ReplyLead } from "./reply-pattern";
import { outcomeFont } from "./outcome-font";
import styles from "./outcomes.module.css";

const STEM_START = 0.2;
const STEM_STEP = 0.02;
const STEM_DURATION = 0.26;

function describe(lead: ReplyLead): string {
  const when = `${WEEK_DAYS[lead.day] ?? ""} ${lead.time}`.trim();
  return `${when} · ${lead.name} · ${lead.minutes === null ? "not answered yet" : `answered in ${formatReplyTime(lead.minutes)}`}`;
}

/** One lead. A link when its receipt exists, otherwise a button that only reveals detail. */
function Pin({ lead, left, bottom, active, onActive, initial, animate, transition }: {
  lead: ReplyLead;
  left: string;
  bottom: string;
  active: boolean;
  onActive: (id: string | null) => void;
  initial: false | TargetAndTransition;
  animate: TargetAndTransition;
  transition: Transition;
}) {
  const shared = {
    className: styles.pin,
    "data-active": active || undefined,
    "data-waiting": lead.minutes === null || undefined,
    style: { left, bottom },
    onMouseEnter: () => onActive(lead.id),
    onMouseLeave: () => onActive(null),
    onFocus: () => onActive(lead.id),
    onBlur: () => onActive(null),
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => { if (event.key === "Escape") onActive(null); },
    initial,
    animate,
    transition,
  };
  return lead.receiptHref
    ? <motion.a href={lead.receiptHref} aria-label={`${describe(lead)}, open receipt`} {...shared}><span /></motion.a>
    : <motion.button type="button" aria-label={describe(lead)} {...shared}><span /></motion.button>;
}

/**
 * Are leads answered fast? A week strip where each lead is a pin whose stem
 * height is minutes to reply. Pins are focusable; hover or focus shows who,
 * when and how fast.
 */
export function ReplyPattern({ eyebrow = "Reply speed · this week", leads, line, threshold = 5, className }: {
  eyebrow?: string;
  leads: ReplyLead[];
  /** A sourced sentence of context ("Most of Buffalo takes 42 hours."). */
  line?: string;
  threshold?: number;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const entrance = useEntranceTrigger(ref);
  const titleId = useId();
  const tipId = useId();
  const [active, setActive] = useState<string | null>(null);
  const verdict = replyVerdict(leads, threshold);
  const pins = useMemo(() => pinLayout(leads, threshold), [leads, threshold]);
  const shown = entrance.started || entrance.snap;
  const lastLanding = pins.length ? STEM_START + (pins.length - 1) * STEM_STEP + STEM_DURATION : 0;

  return <EntranceProvider value={entrance}>
    <section ref={ref} aria-labelledby={titleId} className={[styles.card, outcomeFont.variable, className].filter(Boolean).join(" ")} data-outcome="reply-pattern">
      <Reveal as="header">
        <p className={styles.eyebrow}>{eyebrow}</p>
        <div className={styles.verdictRow}>
          <h2 id={titleId} className={styles.verdictWord}>{verdict.word}</h2>
          {verdict.chip ? <span className={styles.chip}>{verdict.chip}</span> : null}
        </div>
        {line ? <p className={styles.lede}>{line}</p> : null}
      </Reveal>

      {pins.length ? <>
        <div className={styles.week} role="group" aria-label="Leads by day">
          {WEEK_DAYS.map((day, dayIndex) => <div key={day}>
            <Reveal className={styles.dayBand} index={dayIndex} data-edge={dayIndex === 0 ? "start" : dayIndex === WEEK_DAYS.length - 1 ? "end" : undefined} data-shade={dayIndex % 2 ? "light" : undefined}>
              {pins.filter(pin => pin.lead.day === dayIndex).map(pin => {
                const stemDelay = STEM_START + pin.order * STEM_STEP;
                const bottom = `calc(${pin.height} * (100% - 28px))`;
                const isActive = active === pin.lead.id;
                return <div key={pin.lead.id}>
                  <motion.span aria-hidden="true" className={styles.stem} data-active={isActive || undefined}
                    style={{ left: `${pin.x * 100}%`, height: bottom }}
                    initial={entrance.snap ? false : { scaleY: 0 }}
                    animate={{ scaleY: shown ? 1 : 0 }}
                    transition={entranceTransition(entrance, { ...strelvaMotion.draw, duration: STEM_DURATION }, stemDelay)} />
                  <Pin lead={pin.lead} left={`${pin.x * 100}%`} bottom={bottom} active={isActive} onActive={setActive}
                    initial={entrance.snap ? false : { opacity: 0, scale: 0.3 }}
                    animate={shown ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.3 }}
                    transition={entranceTransition(entrance, strelvaMotion.gooey, stemDelay + STEM_DURATION)} />
                  {isActive ? <span id={tipId} role="tooltip" aria-hidden="true" className={styles.tooltip} style={{ left: `${pin.x * 100}%`, bottom }}>
                    {describe(pin.lead)}
                  </span> : null}
                </div>;
              })}
            </Reveal>
            <div className={styles.dayLabel} aria-hidden="true">{day}</div>
          </div>)}
        </div>
        <Reveal as="p" className={styles.callout} delay={Math.max(0.3, lastLanding)}>each pin is a lead · height is minutes to reply</Reveal>
      </> : <div className={styles.empty}>
        <strong>No leads this week.</strong>
        <span>When someone calls, texts or fills in a form, their pin appears on the day they asked.</span>
      </div>}
    </section>
  </EntranceProvider>;
}
