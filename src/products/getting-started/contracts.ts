import { z } from "zod";

/**
 * Getting started (GLOSSARY): how a business starts on Strelva from what it
 * already has. Browser-safe shapes only; the server owns reads and writes.
 *
 * A Found fact is read from somewhere the business already is (its website)
 * and shown with where it came from. It is never written to the business
 * record until the owner confirms it; confirming is the owner's own write.
 */

/*
 * One Found-fact shape for the whole product: these mirror lane L3's
 * `foundFactInputSchema` / `FOUND_FACT_KEYS` in
 * src/products/agency-clients/contracts.ts (table `business_found_facts`,
 * migration 20261024300000_claim_review.sql) field for field. At merge,
 * import them from there and delete these copies. The owner path here does
 * not stage rows: L3's table and RPCs are agency-add/claim only (agency id
 * NOT NULL), so the owner reads and decides in one sitting.
 */
export const FOUND_FACT_KEYS = ["phone", "email", "address", "hours", "description", "links"] as const;
export type FoundFactKey = typeof FOUND_FACT_KEYS[number];
export type FoundFactEntity = "fact" | "service" | "person";

export const FOUND_FACT_LABELS: Record<FoundFactKey | "service" | "person", string> = {
  phone: "Phone", email: "Email", address: "Address", hours: "Hours", description: "Description", links: "Links",
  service: "Service", person: "Person",
};

const sourceUrl = z.string().min(8).max(2048).regex(/^https?:\/\/\S+$/);
const quote = z.string().trim().min(1).max(300);
const named = z.object({ name: z.string().trim().min(1).max(160) }).strict();

/** One thing the crawl read, before the owner has seen it (L3's `foundFactInputSchema`). */
export const foundFactInputSchema = z.discriminatedUnion("entity", [
  z.object({ entity: z.literal("fact"), key: z.enum(FOUND_FACT_KEYS), value: z.unknown(), sourceUrl, quote }).strict(),
  z.object({ entity: z.literal("service"), value: named, sourceUrl, quote }).strict(),
  z.object({ entity: z.literal("person"), value: named, sourceUrl, quote }).strict(),
]);
export type FoundFactInput = z.infer<typeof foundFactInputSchema>;

/** A Found fact as the owner sees it here: the L3 input shape plus what the screen needs. */
export type FoundFact = FoundFactInput & {
  /** Stable within one reading. */
  id: string;
  label: string;
  /** What the owner reads; for an address, its formatted line. */
  display: string;
  /** What the record holds for this key today, when it differs. */
  current: string | null;
};

export interface WebsiteReading {
  url: string;
  /** The record revision the facts were compared against; confirming checks it. */
  revision: number;
  facts: FoundFact[];
  pagesRead: number;
}

export interface GettingStartedBusiness {
  workspaceId: string;
  name: string;
  website: string | null;
  /** Only the business owner confirms found facts into the record. */
  canConfirm: boolean;
  revision: number;
}

export interface CheckForBusiness {
  resultId: string;
  /** The business name the check was run for; an audit has none. */
  name: string | null;
  website: string | null;
  kind: "ai_visibility" | "website_audit";
}

export const CHECK_RESULT_ID = /^(scan_[a-z0-9]{1,251}|audit_[a-f0-9]{32})$/i;
const uuid = z.string().uuid();

export const gettingStartedActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start_from_check"), resultId: z.string().trim().regex(CHECK_RESULT_ID), name: z.string().trim().min(1).max(120) }).strict(),
  z.object({ action: z.literal("read_website"), workspaceId: uuid, url: z.string().trim().min(1).max(2048) }).strict(),
  z.object({
    action: z.literal("confirm_found_facts"), workspaceId: uuid, revision: z.number().int().min(0),
    website: z.string().trim().min(1).max(2048).optional(),
    facts: z.array(foundFactInputSchema).max(40),
  }).strict(),
]);
export type GettingStartedAction = z.infer<typeof gettingStartedActionSchema>;

/** Where a held brief waits in this browser until an agency is brought in. Never sent anywhere. */
export function heldBriefKey(workspaceId: string): string {
  return `strelva:getting-started:held-brief:${workspaceId}`;
}
