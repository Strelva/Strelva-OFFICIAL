/** Strelva motion roles. Seconds here; CSS counterparts use milliseconds. */
export const strelvaMotion = {
  feedback: { duration: 0.12 },
  gooey: { type: "spring", visualDuration: 0.36, bounce: 0.16 },
  settle: { type: "spring", visualDuration: 0.28, bounce: 0.08 },
  exit: { duration: 0.22, ease: [0.2, 0.8, 0.2, 1] },
  reduced: { duration: 0 },
} as const;
