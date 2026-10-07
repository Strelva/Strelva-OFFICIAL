"use client";

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ComponentPropsWithoutRef, type CSSProperties, type ReactNode, type RefObject } from "react";
import { motion, type Transition } from "motion/react";
import { staggerDelay, strelvaEntrance, strelvaMotion } from "@/lib/motion";

/**
 * Entry choreography for data surfaces (reveal, draw, count).
 *
 * `started` turns true the first time the surface is 30% in view and never
 * turns back. `snap` is true under reduced motion or while the document is
 * hidden: every consumer then renders its end state with no transition.
 * Content is always in the DOM; motion only changes how it arrives.
 */
export interface EntranceState {
  started: boolean;
  snap: boolean;
}

/** Outside an Entrance, everything renders its end state. */
const EntranceContext = createContext<EntranceState>({ started: true, snap: true });

export const EntranceProvider = EntranceContext.Provider;

export function useEntrance(): EntranceState {
  return useContext(EntranceContext);
}

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

/** True while the document is hidden (background tab). False on the server. */
export function useDocumentHidden(): boolean {
  return useSyncExternalStore(subscribeVisibility, () => document.hidden, () => false);
}

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const query = window.matchMedia(REDUCED_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * The reduced-motion preference, false on the server and during hydration so
 * server and client markup match; it updates right after hydration.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, () => typeof window.matchMedia === "function" && window.matchMedia(REDUCED_QUERY).matches, () => false);
}

/**
 * True once `ref` has been at least `amount` in view. Never reverts. Without
 * IntersectionObserver it turns true on the next frame.
 */
export function useInViewOnce(ref: RefObject<Element | null>, amount: number = strelvaEntrance.amount): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (seen) return;
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      const frame = requestAnimationFrame(() => setSeen(true));
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setSeen(true);
        observer.disconnect();
      }
    }, { threshold: amount });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, amount, seen]);
  return seen;
}

/** Owns the trigger for one surface. Pair with `EntranceProvider`. */
export function useEntranceTrigger(ref: RefObject<Element | null>): EntranceState {
  const inView = useInViewOnce(ref);
  const reduced = usePrefersReducedMotion();
  const hidden = useDocumentHidden();
  return { started: inView, snap: reduced || hidden };
}

/** Transition for an entrance role, collapsing to the reduced (instant) role when snapping. */
export function entranceTransition(entrance: EntranceState, role: Transition, delay = 0): Transition {
  return entrance.snap ? strelvaMotion.reduced : { ...role, delay };
}

type EntranceTag = "div" | "section" | "article" | "aside";

/** A surface root that triggers its own entrance. */
export function Entrance({ as = "section", children, ...rest }: { as?: EntranceTag; children: ReactNode } & ComponentPropsWithoutRef<"section">) {
  const ref = useRef<HTMLElement>(null);
  const state = useEntranceTrigger(ref);
  const Tag = as as "section";
  return <EntranceProvider value={state}><Tag ref={ref} {...rest}>{children}</Tag></EntranceProvider>;
}

const revealTags = {
  div: motion.div,
  p: motion.p,
  li: motion.li,
  header: motion.header,
  footer: motion.footer,
  span: motion.span,
  tr: motion.tr,
} as const;

type RevealTag = keyof typeof revealTags;

/**
 * Reveal role: opacity 0→1 and y 8→0 over 280 ms once the surrounding
 * Entrance starts. `index` staggers 40 ms per item, capped at 6 per group.
 * `delay` (seconds) offsets the whole group from the entrance.
 */
export function Reveal({ as = "div", index = 0, delay = 0, y = strelvaEntrance.revealY, className, children, id, role, "aria-label": ariaLabel, "aria-labelledby": ariaLabelledBy, style, ...data }: {
  as?: RevealTag;
  index?: number;
  delay?: number;
  y?: number;
  className?: string;
  children?: ReactNode;
  id?: string;
  role?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  style?: CSSProperties;
  /** `data-*` attributes pass through to the element. */
  [data: `data-${string}`]: string | undefined;
}) {
  const entrance = useEntrance();
  const Tag = revealTags[as] as typeof motion.div;
  const shown = entrance.started || entrance.snap;
  return <Tag
    {...data}
    id={id}
    role={role}
    aria-label={ariaLabel}
    aria-labelledby={ariaLabelledBy}
    className={className}
    style={style}
    initial={entrance.snap ? false : { opacity: 0, y }}
    animate={shown ? { opacity: 1, y: 0 } : { opacity: 0, y }}
    transition={entranceTransition(entrance, strelvaMotion.reveal, delay + staggerDelay(index))}
  >{children}</Tag>;
}
