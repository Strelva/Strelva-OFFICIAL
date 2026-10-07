/** Strelva motion roles. Seconds here; CSS counterparts use milliseconds. */
export const strelvaMotion = {
  feedback: { duration: 0.12 },
  gooey: { type: "spring", visualDuration: 0.36, bounce: 0.16 },
  settle: { type: "spring", visualDuration: 0.28, bounce: 0.08 },
  exit: { duration: 0.22, ease: [0.2, 0.8, 0.2, 1] },
  /** Entry of text blocks, cards and rows: opacity 0→1, y 8→0. */
  reveal: { duration: 0.28, ease: [0.2, 0.8, 0.2, 1] },
  /** Ribbons, lines, stems and highlight sweeps. */
  draw: { duration: 0.6, ease: [0.65, 0, 0.35, 1] },
  /** Headline numerals tween from 0 or the last shown value. */
  count: { duration: 0.6, ease: [0.2, 0.8, 0.2, 1] },
  reduced: { duration: 0 },
} as const;

/** Data-surface entry rules shared by reveal, draw and count. */
export const strelvaEntrance = {
  /** Fraction of the element that must be in view before entry runs (once). */
  amount: 0.3,
  /** Distance a revealed block rises, in px. */
  revealY: 8,
  /** Seconds between staggered reveals in one group. */
  stagger: 0.04,
  /** Items after this many in a group appear with the last staggered one. */
  maxStagger: 6,
} as const;

/** Stagger delay in seconds for item `index`; items past the cap share the cap's delay. */
export function staggerDelay(index: number, step: number = strelvaEntrance.stagger, cap: number = strelvaEntrance.maxStagger): number {
  const position = Math.max(0, Math.min(Math.floor(index), Math.max(1, cap) - 1));
  return Math.round(position * step * 1000) / 1000;
}
