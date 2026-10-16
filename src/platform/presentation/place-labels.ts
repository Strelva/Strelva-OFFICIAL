/** Screen words only. Stable product IDs and routes keep their existing names. */
export const PLACE_LABELS = {
  home: "Home", needsYou: "Needs you", requests: "Requests", running: "Running",
  filesAndResults: "Files and results", systems: "Systems", systemsAndFiles: "All systems and files", apps: "Apps",
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

/**
 * October 15, 2026 (XA). Words the XA board uses for places and the yes. They
 * live here so a GLOSSARY decision is one edit: "Today" is the owner's and the
 * agency's Home, "Minutes" the dated record of what happened and what is kept
 * true, and the yes button reads "Make it live" (GLOSSARY; settled October 16 over the
 * board's "Put it live", see design-notes/XA-FOUNDATION.md).
 */
export const XA_PLACE_LABELS = {
  today: "Today", requests: PLACE_LABELS.requests, minutes: "Minutes", newRequest: "New request", search: "Search",
  yourBusiness: "Your business", yourAgency: "Your agency", addToBusiness: "Add to your business",
  queue: "Queue", library: "Library", clients: "Clients", addClient: "Add a client", team: "Team", verification: "Verification",
  leads: "Leads", paymentLinks: "Payment links",
  businessRecord: "Business record", access: PLACE_LABELS.access, plan: "Plan and usage", takeItWithYou: "Take it with you",
  connections: "Connections", help: PLACE_LABELS.help, account: PLACE_LABELS.account, details: PLACE_LABELS.businessDetails, agencyDetails: "Agency details",
} as const;

export const XA_YES_LABELS = { yes: "Make it live", notYet: "Not yet", undo: "Undo", tryAgain: "Try again" } as const;
