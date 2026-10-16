import { z } from "zod";
import { foundFactDecisionSchema, type FoundFact as StoredFoundFact } from "@/products/found-facts/contracts";

/**
 * Getting started (GLOSSARY): how a business starts on Strelva from what it
 * already has. Browser-safe shapes only; the server owns reads and writes.
 *
 * A Found fact is read from somewhere the business already is (its website)
 * and shown with where it came from. It is never written to the business
 * record until the owner confirms it; confirming is the owner's own write.
 */

// The one Found-fact shape and store: src/products/found-facts.
export { FOUND_FACT_KEYS, FOUND_FACT_LABELS, foundFactInputSchema, type FoundFactInput } from "@/products/found-facts/contracts";

/** A Found fact as the owner sees it here: the stored fact plus what the screen needs. */
export type FoundFact = StoredFoundFact & {
  label: string;
  /** What the owner reads; for an address, its formatted line. */
  display: string;
  /** What the record holds for this key today, when it differs. */
  current: string | null;
  /** Whether Getting started can add it to the record (categories can't). */
  confirmable: boolean;
};

export interface WebsiteReading {
  url: string;
  /** The record revision the facts were compared against; confirming checks it. */
  revision: number;
  facts: FoundFact[];
  pagesRead: number;
  /** The first page read, as its visitors see it at the top: its title and description. */
  page?: { title: string; description: string | null } | null;
}

export interface GettingStartedBusiness {
  workspaceId: string;
  name: string;
  website: string | null;
  /** Only the business owner confirms found facts into the record. */
  canConfirm: boolean;
  revision: number;
  /** Found facts still waiting for the owner, from any source (a reading, a listing, the agency's add). */
  waiting: FoundFact[];
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
    action: z.literal("decide_found_facts"), workspaceId: uuid, revision: z.number().int().min(0),
    website: z.string().trim().min(1).max(2048).optional(),
    decisions: z.array(foundFactDecisionSchema).max(200),
    /** The device's time zone, used for found hours only when the record has none. */
    timeZone: z.string().trim().min(1).max(64).optional(),
  }).strict(),
]);
export type GettingStartedAction = z.infer<typeof gettingStartedActionSchema>;

