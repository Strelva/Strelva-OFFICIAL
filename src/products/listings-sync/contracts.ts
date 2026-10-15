import { z } from "zod";

/**
 * Listings in sync: what a check reads and what it concludes. Browser-safe (zod
 * only). Every on-screen word for a state comes from here.
 */
export const LISTING_FACTS = ["phone", "address", "hours", "special_hours", "services", "booking_link"] as const;
export type ListingFact = (typeof LISTING_FACTS)[number];
export const SURFACE_KINDS = ["website", "google", "booking", "yelp"] as const;
export type SurfaceKind = (typeof SURFACE_KINDS)[number];
export const FACT_STATES = ["matches", "differs", "not_shown", "not_checked", "follows", "waiting_on_google"] as const;
export type FactState = (typeof FACT_STATES)[number];
/** Who changes this place: Strelva itself, a Request to the agency, the owner by hand, or nobody (read only). */
export const CHANGE_BY = ["strelva", "request", "owner", "read_only"] as const;
export type ChangeBy = (typeof CHANGE_BY)[number];
export const FIX_KINDS = ["booking_hours", "google_hours", "google_info", "site_request", "owner_todo"] as const;
export type FixKind = (typeof FIX_KINDS)[number];

export const factComparisonSchema = z.object({
  fact: z.enum(LISTING_FACTS),
  state: z.enum(FACT_STATES),
  shown: z.string().max(500).nullable(),
  expected: z.string().max(500).nullable(),
  note: z.string().max(300).optional(),
}).strict();
export type FactComparison = z.infer<typeof factComparisonSchema>;

export const surfaceReadingSchema = z.object({
  surfaceKey: z.string().regex(/^[a-z]+:[A-Za-z0-9_:./-]{1,200}$/),
  kind: z.enum(SURFACE_KINDS),
  label: z.string().max(160),
  url: z.string().max(2048).nullable(),
  changeBy: z.enum(CHANGE_BY),
  state: z.enum(["read", "unreadable", "waiting_on_google", "reconnect"]),
  reason: z.string().max(300).optional(),
  facts: z.array(factComparisonSchema).max(6),
}).strict();
export type SurfaceReading = z.infer<typeof surfaceReadingSchema>;

export const listingFixSchema = z.object({
  id: z.string().uuid(),
  surfaceKey: z.string(),
  factKey: z.enum([...LISTING_FACTS, "page"]),
  kind: z.enum(FIX_KINDS),
  proposed: z.record(z.string(), z.unknown()),
  status: z.enum(["proposed", "declined", "applying", "applied", "verified", "failed", "superseded"]),
  outcomeRef: z.string().nullable(),
  reason: z.string().nullable(),
  recordRevision: z.number().int(),
}).strict();
export type ListingFix = z.infer<typeof listingFixSchema>;

export const listingsSyncViewSchema = z.object({
  workspaceId: z.string().uuid(),
  access: z.enum(["owner", "admin", "member", "agency"]),
  checkedAt: z.string().nullable(),
  checking: z.boolean(),
  recordRevision: z.number().int().nullable(),
  surfaces: z.array(surfaceReadingSchema),
  fixes: z.array(listingFixSchema),
  release: z.object({ number: z.number().int().positive(), recordedAt: z.string() }).nullable(),
  pendingConfirmation: z.number().int().min(0),
  waitingOnOwner: z.boolean(),
  lastError: z.string().nullable(),
}).strict();
export type ListingsSyncView = z.infer<typeof listingsSyncViewSchema>;

export const FACT_STATE_LABEL: Record<FactState, string> = {
  matches: "Matches",
  differs: "Differs",
  not_shown: "Not shown there",
  not_checked: "Not checked",
  follows: "Follows your details",
  waiting_on_google: "Waiting on Google",
};

export const FACT_LABEL: Record<ListingFact, string> = {
  phone: "Phone",
  address: "Address",
  hours: "Hours",
  special_hours: "Special hours",
  services: "Services",
  booking_link: "Booking link",
};

export type HeadlineTone = "matches" | "differs" | "waiting" | "unchecked";

/** The one line an owner or agency reads first. 'Differs' needs a shown value that conflicts; absence never counts. */
export function listingsHeadline(view: Pick<ListingsSyncView, "surfaces" | "checkedAt">): { tone: HeadlineTone; text: string } {
  if (!view.checkedAt) return { tone: "unchecked", text: "Not checked yet" };
  const n = view.surfaces.filter(surface => surface.facts.some(fact => fact.state === "differs")).length;
  if (n > 0) return { tone: "differs", text: n === 1 ? "1 place differs" : `${n} places differ` };
  if (view.surfaces.some(surface => surface.state === "waiting_on_google" || surface.facts.some(fact => fact.state === "waiting_on_google"))) {
    return { tone: "waiting", text: "Waiting on Google" };
  }
  if (view.surfaces.some(surface => surface.facts.some(fact => fact.state === "matches"))) return { tone: "matches", text: "Everything matches" };
  return { tone: "unchecked", text: "Nothing to compare yet" };
}
