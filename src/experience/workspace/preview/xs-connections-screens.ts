/** Screens and states of the XS · Connections preview. Server-safe (no "use client"). */
export type XsScreen = "google" | "google-agency" | "assistants" | "authorize" | "domain" | "forwarding";
export const XS_SCREENS: Readonly<Record<XsScreen, readonly string[]>> = {
  google: ["connect", "choose", "waiting", "connected", "facts", "pending", "disconnected", "paused", "member", "agency", "soon", "loading", "error"],
  "google-agency": ["ready", "expired", "forbidden", "unavailable"],
  assistants: ["ready", "empty", "expired", "loading", "error", "member"],
  authorize: ["ready", "one", "none", "invalid", "error"],
  domain: ["pending", "verified", "error", "none", "request"],
  forwarding: ["ready", "none", "gmail", "arrived", "loading", "error", "member"],
};

