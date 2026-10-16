/** XA-8 preview screens and states, shared by the server route and the client preview. */
export const XA8_SCREENS = ["record", "hours", "people", "agency", "remove", "take", "leave"] as const;
export type Xa8Screen = (typeof XA8_SCREENS)[number];
export const XA8_STATES = ["ready", "empty", "loading", "error", "waiting", "done", "readonly", "week", "handoff", "plain"] as const;
export type Xa8State = (typeof XA8_STATES)[number];
