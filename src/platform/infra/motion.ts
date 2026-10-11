/**
 * Strelva motion for JS (Motion, rAF). Seconds here; the CSS ladder in
 * src/app/styles/motion.css uses milliseconds. Keep the two in step:
 * scripts/check-motion.mjs compares them.
 */
export const strelvaDuration = {
  press: 0.08,
  fast: 0.14,
  base: 0.22,
  slow: 0.36,
  long: 0.6,
  hold: 0.8,
  stagger: 0.04,
} as const;

export const strelvaEase = {
  settle: [0.2, 0.8, 0.2, 1],
  draw: [0.65, 0, 0.35, 1],
  breathe: [0.45, 0, 0.55, 1],
} as const;

/** Strelva motion roles, each built from the ladder above. */
export const strelvaMotion = {
  press: { duration: strelvaDuration.press, ease: strelvaEase.settle },
  feedback: { duration: strelvaDuration.fast, ease: strelvaEase.settle },
  gooey: { type: "spring", visualDuration: strelvaDuration.slow, bounce: 0.16 },
  settle: { type: "spring", visualDuration: strelvaDuration.base, bounce: 0.08 },
  exit: { duration: strelvaDuration.base, ease: strelvaEase.settle },
  /** Entry of text blocks, cards and rows: opacity 0→1, y 8→0. */
  reveal: { duration: strelvaDuration.base, ease: strelvaEase.settle },
  /** Ribbons, lines, stems and highlight sweeps. */
  draw: { duration: strelvaDuration.long, ease: strelvaEase.draw },
  /** Short marks drawn as part of a larger entry (ticks, dots, small stems). */
  drawShort: { duration: strelvaDuration.slow, ease: strelvaEase.draw },
  /** Headline numerals tween from 0 or the last shown value. */
  count: { duration: strelvaDuration.long, ease: strelvaEase.settle },
  /** Hold to accept: linear fill while held. */
  hold: { duration: strelvaDuration.hold, ease: "linear" },
  /** JS-driven motion snaps under reduced motion; CSS keeps a 120 ms crossfade. */
  reduced: { duration: 0 },
} as const;

/** Data-surface entry rules shared by reveal, draw and count. */
export const strelvaEntrance = {
  /** Fraction of the element that must be in view before entry runs (once). */
  amount: 0.3,
  /** Distance a revealed block rises, in px. */
  revealY: 8,
  /** Seconds between staggered reveals in one group. */
  stagger: strelvaDuration.stagger,
  /** Items after this many in a group appear with the last staggered one. */
  maxStagger: 6,
} as const;

/** Stagger delay in seconds for item `index`; items past the cap share the cap's delay. */
export function staggerDelay(index: number, step: number = strelvaEntrance.stagger, cap: number = strelvaEntrance.maxStagger): number {
  const position = Math.max(0, Math.min(Math.floor(index), Math.max(1, cap) - 1));
  return Math.round(position * step * 1000) / 1000;
}
