/** XA-1 preview screens and the states each one shows. Server-safe (no "use client"). */
export const XA1_SCREENS = {
  b1: ["ready", "agency", "google-only", "sent", "error", "invited", "closed"],
  b2: ["ready", "picked", "existing", "loading", "error", "signed-out"],
  b3: ["ready", "reading", "error", "member"],
  b4: ["ready", "waiting", "nothing-found", "conflict", "no-website"],
  b5: ["ready", "nothing-added", "closed", "request"],
  b6: ["ready", "quiet", "loading", "error"],
} as const;
export type Xa1Screen = keyof typeof XA1_SCREENS;
