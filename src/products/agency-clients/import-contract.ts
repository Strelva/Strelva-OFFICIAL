import { z } from "zod";

/**
 * Import clients (GLOSSARY: Import clients). An agency adds many clients at once
 * from a list or from a tool it already uses. Every source (a pasted or uploaded
 * sheet, GoHighLevel, later others) produces the same rows; the agency reviews
 * them in one preview and each confirmed row goes through the ordinary add
 * (`addAgencyClientInputSchema`), so an imported client is exactly a client added
 * by hand. Nothing is sent to an owner from an import.
 */

const email = z.string().trim().toLowerCase().email().max(254);

export const CLIENT_IMPORT_SOURCES = ["sheet", "gohighlevel"] as const;
export const clientImportSourceSchema = z.enum(CLIENT_IMPORT_SOURCES);
export type ClientImportSource = z.infer<typeof clientImportSourceSchema>;

/**
 * Why a source offers an address as the owner's. A source rarely knows who owns
 * the business; these say what it does know.
 */
export const CLIENT_IMPORT_OWNER_CANDIDATE_BASES = [
  /** An administrator of the client's own account in the source (GoHighLevel sub-account admin). */
  "account_admin",
  /** Another person on the client's own account in the source. */
  "account_user",
  /** The business's contact address in the source, not a person's. */
  "business_email",
] as const;

export const clientImportOwnerCandidateSchema = z.object({
  email,
  name: z.string().trim().min(1).max(120).optional(),
  basis: z.enum(CLIENT_IMPORT_OWNER_CANDIDATE_BASES),
}).strict();
export type ClientImportOwnerCandidate = z.infer<typeof clientImportOwnerCandidateSchema>;

/** One client as a source describes it, before the agency confirms it. */
export const clientImportRowSchema = z.object({
  /** Stable within the source (sheet row number, GoHighLevel location id). Re-importing the same source ref never adds a second client. */
  sourceRef: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(120).optional(),
  url: z.string().trim().min(4).max(2048).optional(),
  ownerEmail: email.optional(),
  /** Found facts the source already holds. Shown to the owner at the claim, never confirmed by the import. */
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(300).optional(),
  /**
   * Addresses the source offers as the owner's, when it cannot say which one is.
   * A source sets `ownerEmail` only when it has exactly one person-level
   * candidate; with several, `ownerEmail` stays empty and the agency picks one
   * (or types another) in the preview. Never used to send anything.
   */
  ownerEmailCandidates: z.array(clientImportOwnerCandidateSchema).max(20).optional(),
}).strict();
export type ClientImportRow = z.infer<typeof clientImportRowSchema>;

export const CLIENT_IMPORT_ROW_STATES = [
  /** Ready to add. */
  "ready",
  /** Already a client of this agency (same website or same source ref). */
  "duplicate",
  /** Missing what an add needs: a website or a name. */
  "incomplete",
  /** Added. */
  "added",
  /** The add was refused; `reason` says why in plain words. */
  "refused",
] as const;
export type ClientImportRowState = (typeof CLIENT_IMPORT_ROW_STATES)[number];

export const clientImportPreviewRowSchema = z.object({
  row: clientImportRowSchema,
  state: z.enum(CLIENT_IMPORT_ROW_STATES),
  reason: z.string().max(300).optional(),
  /** Set once the row is added. */
  businessId: z.string().uuid().optional(),
}).strict();
export type ClientImportPreviewRow = z.infer<typeof clientImportPreviewRowSchema>;

/** A source adapter: turns what the agency already has into rows. Reading a source never adds anything. */
export interface ClientImportSourceAdapter {
  source: ClientImportSource;
  readRows(input: unknown): Promise<ClientImportRow[]>;
}
