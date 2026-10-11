"use client";

import { useEffect, useId, useRef, useState } from "react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { ArrowRight, CalendarClock, Eye, Package, ShieldCheck, Undo2, type LucideIcon } from "lucide-react";
import { CountUp, formatInteger } from "@/components/ui/motion/CountUp";
import { EntranceProvider, Reveal, entranceTransition, useEntranceTrigger } from "@/components/ui/motion/Entrance";
import { strelvaMotion } from "@/platform/infra/motion";
import { confirmLabel, slideCommits, slideProgress } from "./price-sheet";
import { outcomeFont } from "./outcome-font";
import styles from "./outcomes.module.css";

export type PriceTermIcon = "keep" | "undo" | "live" | "safe";

export interface PriceTerm {
  icon: PriceTermIcon;
  title: string;
  detail: string;
}

const ICONS: Record<PriceTermIcon, LucideIcon> = { keep: Package, undo: Undo2, live: CalendarClock, safe: ShieldCheck };
const KNOB = 56;
const INSET = 4;

type Status = "idle" | "pending" | "done" | "error";

/**
 * What exactly am I saying yes to? A bottom sheet over a preview of the thing
 * being bought. The real button is always present and does exactly what the
 * slide does; the slide is a touch enhancement (shown on coarse pointers, or
 * always with `slider="always"`). Release past 85% commits; otherwise the
 * knob settles back.
 */
export function PriceSheet({ title, price, cadence = "once", cadenceDetail, terms, previewLabel, previewImage = "/images/outcomes/storefront.webp", verb = "Build it", slider = "auto", onConfirm, className }: {
  title: string;
  /** Whole dollars. */
  price: number;
  cadence?: string;
  cadenceDetail?: string;
  terms: PriceTerm[];
  /** "Preview: booking page on your site". */
  previewLabel: string;
  previewImage?: string;
  /** The button reads "{verb} for ${price}". */
  verb?: string;
  slider?: "auto" | "always" | "never";
  onConfirm: () => void | Promise<void>;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const entrance = useEntranceTrigger(ref);
  const titleId = useId();
  const trackRef = useRef<HTMLDivElement>(null);
  const [travel, setTravel] = useState(0);
  const [status, setStatus] = useState<Status>("idle");
  const x = useMotionValue(0);
  const labelOpacity = useTransform(x, value => 1 - slideProgress(value, travel) * 1.2);
  const shown = entrance.started || entrance.snap;
  const label = confirmLabel(price, verb);
  const settle = entrance.snap ? strelvaMotion.reduced : strelvaMotion.settle;

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const measure = () => setTravel(Math.max(0, track.clientWidth - KNOB - INSET * 2));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, []);

  // A second tap or release before React re-renders must not confirm twice.
  const committing = useRef(false);

  async function confirm() {
    if (committing.current) return;
    committing.current = true;
    setStatus("pending");
    try {
      await onConfirm();
      setStatus("done");
    } catch {
      committing.current = false;
      setStatus("error");
      animate(x, 0, settle);
    }
  }

  function release() {
    if (committing.current) return;
    if (slideCommits(x.get(), travel)) {
      animate(x, travel, settle);
      void confirm();
    } else {
      animate(x, 0, settle);
    }
  }

  const busy = status === "pending" || status === "done";

  return <EntranceProvider value={entrance}>
    <section ref={ref} aria-labelledby={titleId} className={[styles.card, styles.sheetFrame, outcomeFont.variable, className].filter(Boolean).join(" ")} style={{ backgroundImage: `url(${previewImage})` }} data-outcome="price-sheet">
      <span className={styles.previewTag}><Eye size={16} aria-hidden="true" />{previewLabel}</span>
      <motion.div className={styles.sheet}
        initial={entrance.snap ? false : { y: "100%" }}
        animate={{ y: shown ? 0 : "100%" }}
        transition={entranceTransition(entrance, strelvaMotion.gooey)}>
        <div className={styles.grabber} aria-hidden="true" />
        <h3 id={titleId}>{title}</h3>
        <div className={styles.price}>
          <span className={styles.numeral}><span aria-hidden="true" style={{ fontSize: "0.45em", verticalAlign: "0.9em", marginRight: 2 }}>$</span><span className="sr-only">$</span><CountUp value={price} format={formatInteger} /></span>
          <small><strong>{cadence}</strong>{cadenceDetail}</small>
        </div>
        <ul className={styles.terms}>
          {terms.map((term, index) => {
            const Icon = ICONS[term.icon];
            return <Reveal as="li" key={term.title} index={index} delay={0.12}>
              <span aria-hidden="true"><Icon size={18} /></span>
              <span><strong>{term.title}</strong><small>{term.detail}</small></span>
            </Reveal>;
          })}
        </ul>

        {slider !== "never" ? <div ref={trackRef} className={styles.slider} data-force={slider === "always" || undefined} aria-hidden="true">
          <motion.span className={styles.sliderLabel} style={{ opacity: labelOpacity }}>{status === "done" ? "Confirmed" : `Slide to ${label.charAt(0).toLowerCase()}${label.slice(1)}`}</motion.span>
          <motion.div className={styles.knob} style={{ x }} drag={busy ? false : "x"} dragConstraints={{ left: 0, right: travel }} dragElastic={0} dragMomentum={false} onDragEnd={release} data-slide-knob>
            <ArrowRight size={22} />
          </motion.div>
        </div> : null}

        <button type="button" className={styles.confirm} data-only={slider === "never" || undefined} disabled={busy} onClick={() => {
          if (travel) animate(x, travel, settle);
          void confirm();
        }}>{status === "pending" ? "Confirming…" : status === "done" ? "Confirmed" : label}</button>
        <p role="status" className={styles.confirmed}>{status === "done" ? `Confirmed. Strelva has your yes for $${formatInteger(price)}.` : status === "error" ? "That didn't go through. Try again." : ""}</p>
      </motion.div>
    </section>
  </EntranceProvider>;
}
