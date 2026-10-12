import { z } from "zod";

/**
 * Getting started (GLOSSARY): how a business starts on Strelva from what it
 * already has. Browser-safe shapes only; the server owns reads and writes.
 *
 * A Found fact is read from somewhere the business already is (its website)
 * and shown with where it came from. It is never written to the business
 * record until the owner confirms it; confirming is the owner's own write.
 */

export const FOUND_FACT_KEYS = ["display_name", "phone", "email", "address", "service"] as const;
export type FoundFactKey = typeof FOUND_FACT_KEYS[number];

export const FOUND_FACT_LABELS: Record<FoundFactKey, string> = {
  display_name: "Business name",
  phone: "Phone",
  email: "Public email",
  address: "Address",
  service: "Service",
};

export interface FoundFactSource { url: string; quote: string }

export interface FoundFact {
  /** Stable within one reading: key plus the value's text. */
  id: string;
  key: FoundFactKey;
  label: string;
  /** What the owner reads; for an address, its formatted line. */
  display: string;
  /** The value exactly as the business record would store it. */
  value: unknown;
  source: FoundFactSource | null;
  /** What the record holds for this key today, when it differs. */
  current: string | null;
}

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
    facts: z.array(z.object({ key: z.enum(FOUND_FACT_KEYS), value: z.unknown() }).strict()).max(40),
  }).strict(),
]);
export type GettingStartedAction = z.infer<typeof gettingStartedActionSchema>;

/** Where a held brief waits in this browser until an agency is brought in. Never sent anywhere. */
export function heldBriefKey(workspaceId: string): string {
  return `strelva:getting-started:held-brief:${workspaceId}`;
}
