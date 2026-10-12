/** Screen words only. Stable product IDs and routes keep their existing names. */
export const PLACE_LABELS = {
  home: "Home", needsYou: "Needs you", requests: "Requests", running: "Running",
  filesAndResults: "Files and results", systems: "Systems", systemsAndFiles: "All systems and files", readyMade: "Ready-made",
  yours: "Yours", whatChanged: "What changed", businessDetails: "Business details",
  access: "People & access", help: "Help", account: "Account", system: "System", ask: "Ask Strelva",
} as const;

export const KIND_LABELS = {
  website: "Website", inquiries: "Inquiries", bookings: "Bookings", document: "Document",
  app: "Internal tool", tracker: "Internal tool", onboarding: "Onboarding",
  listing: "Google listing", newsletter: "Newsletter", home_finder: "HomeFinder",
  investigation: "Saved check", request: "Request",
} as const;

export const COLLECTION_LABELS = {
  websites: "Websites", applications: "Internal tools", scheduling: KIND_LABELS.bookings,
  investigations: "Saved checks", operations: PLACE_LABELS.requests,
  documents: "Documents", onboarding: "Onboarding cases",
} as const;

export const STATE_LABELS = {
  lifecycle: { draft: "Draft", live: "Live", paused: "Paused" },
  health: { healthy: "Working", degraded: "Something is off", blocked: "Not working", unknown: "Unknown" },
  possibility: { exploring: "Exploring", ready: "Ready" },
  history: "History", makeReal: "Make it live", makingReal: "Making it live…", partlyLive: "Partly live",
} as const;

export const CONNECTION_LABELS = {
  outgoing: { read: "Reads", act: "Acts on", appear: "Appears on", share: "Shares with", depend: "Depends on", trigger: "Starts work in" },
  incoming: { read: "Read by", act: "Acted on by", appear: "Shows", share: "Shared with", depend: "Needed by", trigger: "Started by" },
} as const;

/** Compatibility export for existing receipt consumers. */
export const STRELVA_HANDLED_LABEL = PLACE_LABELS.whatChanged;
