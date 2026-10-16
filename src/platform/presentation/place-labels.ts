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
 * live here so a GLOSSARY decision is one edit. October 16 (word calls, main
 * session, reversible): GLOSSARY.md wins over the Pen board. The owner's and
 * the agency's first place is **Home** (the board's "Today"), the place for
 * what is kept true is **Running** (the board's "Minutes"), the agency's time
 * place reads GLOSSARY's **Time this month**, the business menu's record is
 * **Business details**, and the yes reads **Make it live** / **Not yet**.
 * The key names (`today`, `minutes`) stay so callers do not churn.
 */
export const XA_PLACE_LABELS = {
  today: PLACE_LABELS.home, requests: PLACE_LABELS.requests, minutes: PLACE_LABELS.running,
  /** The agency's own place for time recorded this month (AG6); "Running" is the business's place. */
  agencyMinutes: "Time this month", newRequest: "New request", search: "Search",
  yourBusiness: "Your business", yourAgency: "Your agency", addToBusiness: "Add to your business",
  queue: "Queue", library: "Library", clients: "Clients", addClient: "Add a client", team: "Team", verification: "Verification",
  // GLOSSARY: "Lead" is internal inquiry storage and "Prospect" is Strelva's own sales record, so the
  // agency places use "Service request" (a Request sent to an agency) and the check link's own words.
  // Routes keep /workspace/leads and /workspace/prospects. Pending Jacob's call (lane xs-leads, Oct 16).
  leads: "Service requests", checkResults: "Check results", paymentLinks: "Payment links",
  businessRecord: PLACE_LABELS.businessDetails, access: PLACE_LABELS.access, plan: "Plan and usage", takeItWithYou: "Take it with you",
  connections: "Connections", help: PLACE_LABELS.help, account: PLACE_LABELS.account, details: PLACE_LABELS.businessDetails, agencyDetails: "Agency details",
} as const;

/**
 * The one yes, product-wide (XaYes: a click or ⌘↵, then Undo). "Make it live"
 * for anything that changes what is live; GLOSSARY's own verbs stay for acts
 * that are not a live change (Confirm for a booking, Send for a reply).
 * There is no "Approve", "Put it live" or "Save and make it live".
 */
export const XA_YES_LABELS = { yes: "Make it live", notYet: "Not yet", undo: "Undo", tryAgain: "Try again", confirm: "Confirm", send: "Send" } as const;
