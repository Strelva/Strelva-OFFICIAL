/** XA-2 preview screens and the states each one shows. Shared by the server routes and the client preview. */
export const XA2_SCREENS = {
  "a1-sign-up": ["ready", "business", "single-door"],
  "a2-name-it": ["ready", "loading", "error", "signed-out", "unavailable", "choose"],
  "a3-day-one": ["ready", "later", "member"],
  "a4-add-client": ["ready", "submitting", "loading", "error", "signed-out", "prospect"],
  "a5-client-added": ["ready", "no-link", "claimed", "rebuild-later", "nothing-read"],
  "a6-every-client": ["ready", "empty", "loading", "error", "stale", "down"],
  "c1-claim": ["ready", "plain", "review", "expired", "replaced", "broken", "loading"],
  "c2-owner": ["ready", "plain", "already"],
} as const;
export type Xa2Screen = keyof typeof XA2_SCREENS;
