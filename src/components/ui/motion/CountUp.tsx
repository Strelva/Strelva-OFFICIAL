"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "motion/react";
import { strelvaMotion } from "@/lib/motion";
import { useEntrance } from "./Entrance";

const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** Whole numbers with grouping: 1,840. */
export const formatInteger = (value: number) => integer.format(Math.round(value));
/** Whole dollars: $1,840. */
export const formatDollars = (value: number) => dollars.format(Math.round(value));

/**
 * Count role: a headline numeral that tweens from 0 (or the last value it
 * showed) to `value` over 600 ms once the surrounding Entrance starts.
 *
 * The animated digits are aria-hidden; the final formatted value sits in an
 * sr-only sibling from the first render, so assistive technology never reads
 * an intermediate number. Every frame is rounded to an integer and passed
 * through `format`, so currency stays formatted mid-count. Reduced motion and
 * hidden documents render the final value immediately.
 */
export function CountUp({ value, format = formatInteger, delay = 0, className }: {
  value: number;
  format?: (value: number) => string;
  /** Seconds after the entrance starts. */
  delay?: number;
  className?: string;
}) {
  const entrance = useEntrance();
  const [shown, setShown] = useState(0);
  const shownRef = useRef(0);
  const target = Math.round(value);

  useEffect(() => {
    if (entrance.snap) {
      // Render already shows `target`; keep state in step so leaving snap
      // (a tab becoming visible) does not fall back to an older number.
      shownRef.current = target;
      const frame = requestAnimationFrame(() => setShown(target));
      return () => cancelAnimationFrame(frame);
    }
    if (!entrance.started || shownRef.current === target) return;
    const controls = animate(shownRef.current, target, {
      ...strelvaMotion.count,
      delay,
      onUpdate: latest => {
        const next = Math.round(latest);
        shownRef.current = next;
        setShown(next);
      },
    });
    const onVisibility = () => {
      if (!document.hidden) return;
      controls.stop();
      shownRef.current = target;
      setShown(target);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      controls.stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [entrance.snap, entrance.started, target, delay]);

  // Under snap the end state is derived during render, never animated.
  const display = entrance.snap ? target : shown;
  return <span className={className}>
    <span aria-hidden="true">{format(display)}</span>
    <span className="sr-only">{format(target)}</span>
  </span>;
}
