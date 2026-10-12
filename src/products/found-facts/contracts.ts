import { z } from "zod";

/**
 * Found facts (GLOSSARY: Found fact): the one store, whatever found them.
 * Browser-safe shapes only. SQL contract: `business_found_facts` in
 * supabase/migrations/20261024300000_claim_review.sql.
 *
 * A Found fact is read from somewhere the business already is (its website,
 * its Google listing, an agency's client list or HighLevel sub-account) and
 * kept beside the business record with where it came from and who found it.
 * It joins the record only when the business owner confirms or changes it, as
 * the owner's own verified write. Nobody else confirms one.
 */

export const FOUND_FACT_KEYS = ["phone", "email", "address", "hours", "description", "links", "categories"] as const;
export type FoundFactKey = (typeof FOUND_FACT_KEYS)[number];
/** Keys a Found fact can carry into the record. Categories are kept for reference only. */
export const RECORD_FOUND_FACT_KEYS = ["phone", "email", "address", "hours", "description", "links"] as const;
export type RecordFoundFactKey = (typeof RECORD_FOUND_FACT_KEYS)[number];

export const FOUND_FACT_LABELS: Record<FoundFactKey | "service" | "person", string> = {
  phone: "Phone", email: "Email", address: "Address", hours: "Hours", description: "Description", links: "Links",
  categories: "Categories", service: "Service", person: "Person",
};

export const FOUND_FACT_SOURCE_KINDS = ["website_crawl", "google_listing", "client_import_sheet", "client_import_gohighlevel"] as const;
export type FoundFactSourceKind = (typeof FOUND_FACT_SOURCE_KINDS)[number];
/** Where it came from, in the owner's words. */
export const FOUND_FACT_SOURCE_LABELS: Record<FoundFactSourceKind, string> = {
  website_crawl: "On your website",
  google_listing: "On your Google listing",
  client_import_sheet: "From your agency's client list",
  client_import_gohighlevel: "From your agency's HighLevel account",
};

export const FOUND_FACT_STATUSES = ["unconfirmed", "later", "confirmed", "changed", "removed"] as const;
export type FoundFactStatus = (typeof FOUND_FACT_STATUSES)[number];

const uuid = z.string().uuid();
const sourceUrl = z.string().min(8).max(2048).regex(/^https?:\/\/\S+$/);
const quote = z.string().trim().min(1).max(300);
const named = z.object({ name: z.string().trim().min(1).max(160) }).strict();
const sourceRef = z.string().trim().min(1).max(2048).regex(/^\S+$/);
const importKind = z.enum(["client_import_sheet", "client_import_gohighlevel"]);

/** One thing a website crawl read, with its page and words, before anyone decided it. */
export const foundFactInputSchema = z.discriminatedUnion("entity", [
  z.object({ entity: z.literal("fact"), key: z.enum(RECORD_FOUND_FACT_KEYS), value: z.unknown(), sourceUrl, quote }).strict(),
  z.object({ entity: z.literal("service"), value: named, sourceUrl, quote }).strict(),
  z.object({ entity: z.literal("person"), value: named, sourceUrl, quote }).strict(),
]);
export type FoundFactInput = z.infer<typeof foundFactInputSchema>;

/** One fact an agency's import carried (a column, a sub-account field). No quote. */
export const importedFoundFactInputSchema = z.object({
  entity: z.literal("fact"), key: z.enum(["phone", "address"]), value: z.unknown(), sourceKind: importKind, sourceRef,
}).strict();
export type ImportedFoundFactInput = z.infer<typeof importedFoundFactInputSchema>;

/** What an agency's add stages: website items and import items. */
export type AgencyFoundFactInput = FoundFactInput | ImportedFoundFactInput;

/** A staged Found fact, as every reader sees it. */
export const foundFactSchema = z.object({
  id: uuid,
  entity: z.enum(["fact", "service", "person"]),
  key: z.enum(FOUND_FACT_KEYS).nullable(),
  value: z.unknown(),
  status: z.enum(["unconfirmed", "later"]),
  sourceKind: z.enum(FOUND_FACT_SOURCE_KINDS),
  sourceRef: z.string(),
  /** The page, when the source is a web page. */
  sourceUrl: z.string().nullable(),
  /** The words on the page; structured sources have none. */
  quote: z.string().nullable(),
  foundBy: z.enum(["owner", "agency", "operator"]),
  foundAt: z.string(),
}).strict();
export type FoundFact = z.infer<typeof foundFactSchema>;
export const foundFactListSchema = z.array(foundFactSchema);

export const FOUND_FACT_DECISIONS = ["confirm", "change", "remove", "later"] as const;
export const foundFactDecisionSchema = z.object({
  id: uuid,
  decision: z.enum(FOUND_FACT_DECISIONS),
  /** Required for change, and for confirming hours (the owner supplies the time zone). Links may be merged. */
  value: z.unknown().optional(),
}).strict();
export type FoundFactDecision = z.infer<typeof foundFactDecisionSchema>;
export const foundFactDecisionsSchema = z.array(foundFactDecisionSchema).max(200)
  .refine((items) => new Set(items.map((item) => item.id)).size === items.length, "Decide each found fact once.");

export const foundFactsDecidedSchema = z.object({
  confirmed: z.number().int().min(0), changed: z.number().int().min(0), removed: z.number().int().min(0),
  later: z.number().int().min(0), waiting: z.number().int().min(0), revision: z.number().int().min(0),
  found: foundFactListSchema,
}).strict();
export type FoundFactsDecided = z.infer<typeof foundFactsDecidedSchema>;

/** A plain line about where a Found fact came from. */
export function foundFactSourceLine(fact: Pick<FoundFact, "sourceKind" | "sourceUrl">): string {
  return FOUND_FACT_SOURCE_LABELS[fact.sourceKind];
}
