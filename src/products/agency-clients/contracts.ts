import { z } from "zod";
import { foundFactDecisionSchema, foundFactSchema } from "@/products/found-facts/contracts";
import type { AiVisibilityResult } from "@/products/ai-visibility/contracts";

/**
 * An agency adds a client business (agency 1.0 #259). Shapes shared by the
 * route, the server and the UI. The SQL contract is
 * supabase/migrations/20261015100000_agency_add_client.sql.
 */

const uuid = z.string().uuid();
const email = z.string().trim().toLowerCase().email().max(254);

export const addAgencyClientInputSchema = z.object({
  action: z.literal("add"),
  agencyWorkspaceId: uuid,
  /** Optional when a prospect or the scanned site names the business. */
  name: z.string().trim().min(1).max(120).optional(),
  url: z.string().trim().min(4).max(2048).optional(),
  prospectId: uuid.optional(),
  /** Agency-owned intake identity; the server checks access before creating a business. */
  leadToken: z.string().regex(/^[a-f0-9]{36}$/).optional(),
  /** Where the owner claim link is addressed. Delivery requires an explicit opt-in. */
  ownerEmail: email.optional(),
  /** Only an explicit reviewed send; imports keep this absent. */
  sendOwnerEmail: z.boolean().optional(),
  idempotencyKey: uuid,
  /**
   * Found facts the agency already holds (Import clients carries a sheet's or
   * a HighLevel sub-account's phone and address). They win over what the scan
   * found. Behind the claim review they are staged in the one Found-fact
   * store with their import source; otherwise they are stored like scanned
   * facts (the agency's, unconfirmed).
   */
  foundFacts: z.object({
    phone: z.string().trim().min(3).max(40).optional(),
    address: z.string().trim().min(1).max(200).optional(),
    /** Which import and which row they came from. */
    source: z.object({
      kind: z.enum(["client_import_sheet", "client_import_gohighlevel"]),
      ref: z.string().trim().min(1).max(200).regex(/^\S+$/),
    }).strict().optional(),
  }).strict().optional(),
}).strict().refine((input) => input.url || input.prospectId || input.name, "Enter the business's website, or choose a prospect.")
  .refine((input) => !input.leadToken || !input.prospectId, "Choose either an agency lead or a prospect.")
  .refine((input) => !input.leadToken || Boolean(input.name), "Enter the lead's business name before adding the client.");
export type AddAgencyClientInput = z.infer<typeof addAgencyClientInputSchema>;

export const issueOwnerClaimInputSchema = z.object({
  action: z.literal("owner_link"),
  agencyWorkspaceId: uuid,
  customerWorkspaceId: uuid,
  ownerEmail: email,
  /** Explicit consent for this delivery; defaults off. */
  sendEmail: z.boolean().optional(),
}).strict();
export type IssueOwnerClaimInput = z.infer<typeof issueOwnerClaimInputSchema>;

export const agencyClientActionSchema = z.union([addAgencyClientInputSchema, issueOwnerClaimInputSchema]);

/** How the owner link reached the owner. Copy-only remains the default; provider acceptance is distinct from unknown delivery. */
export const ownerClaimDeliverySchema = z.object({
  status: z.enum(["not_sent", "sending", "accepted", "unknown"]),
  reason: z.string(),
  decision: z.string(),
  agencyEmailVerified: z.boolean(),
}).passthrough();
export type OwnerClaimDelivery = z.infer<typeof ownerClaimDeliverySchema>;

/** One plain sentence pair for every surface that shows a claim: what happened, then what the agency can do. */
export function ownerClaimDeliveryCopy(delivery: OwnerClaimDelivery): { headline: string; next: string } {
  const share = "Copy the link and share it yourself.";
  if (delivery.status === "accepted") return { headline: "Email accepted for delivery.", next: "You can also copy the link." };
  if (delivery.status === "sending" || delivery.status === "unknown") return { headline: "Email delivery unconfirmed.", next: share };
  if (delivery.reason === "gated" || delivery.reason === "email_suppressed") return { headline: "Claim not sent: email to owners is off.", next: share };
  if (delivery.reason === "permission_or_email_gate") return { headline: "Claim not sent: email to owners is off or not permitted for your agency.", next: share };
  return { headline: "Claim not sent.", next: share };
}

export const agencyClientAdditionSchema = z.object({
  additionId: uuid,
  agencyWorkspaceId: uuid,
  customerWorkspaceId: uuid,
  name: z.string(),
  sourceKind: z.enum(["url", "prospect"]),
  sourceUrl: z.string().nullable(),
  prospectId: uuid.nullable(),
  factsSeeded: z.number().int().min(0),
  seatId: uuid.nullable(),
  addedBy: uuid,
  addedAt: z.string(),
  replayed: z.boolean(),
});
export type AgencyClientAddition = z.infer<typeof agencyClientAdditionSchema>;

export const agencyClientListItemSchema = agencyClientAdditionSchema.extend({
  ownerClaimed: z.boolean(),
  seatActive: z.boolean(),
  pendingClaim: z.object({ claimId: uuid, recipientEmail: z.string(), expiresAt: z.string(), delivery: ownerClaimDeliverySchema }).nullable(),
});
export type AgencyClientListItem = z.infer<typeof agencyClientListItemSchema>;

export const ownerClaimSchema = z.object({
  claimId: uuid,
  customerWorkspaceId: uuid,
  workspaceName: z.string(),
  recipientEmail: z.string(),
  delivery: ownerClaimDeliverySchema,
  expiresAt: z.string(),
  createdAt: z.string(),
  replacedPending: z.boolean(),
});
/** The issued link. `claimPath` holds the one-time token: show it once, to the agency. */
export type OwnerClaim = z.infer<typeof ownerClaimSchema> & { claimPath: string };

export const ownerClaimPreviewSchema = z.object({
  workspaceName: z.string(),
  agencyName: z.string(),
  recipientEmail: z.string(),
  status: z.enum(["pending", "accepted", "revoked", "expired"]),
  expiresAt: z.string(),
});
export type OwnerClaimPreview = z.infer<typeof ownerClaimPreviewSchema>;

export const ownerClaimAcceptedSchema = z.object({
  workspaceId: uuid,
  workspaceName: z.string(),
  status: z.enum(["accepted", "revoked", "expired"]),
  alreadyAccepted: z.boolean(),
});
export type OwnerClaimAccepted = z.infer<typeof ownerClaimAcceptedSchema>;

/** What the URL scan found, for the agency to see before the owner confirms anything. */
export interface ClientSiteScan {
  status: "scanned" | "unreachable" | "not_requested";
  /** Fact keys seeded from the scan (all unconfirmed). */
  seeded: string[];
  /** The business name the site gave, when the agency did not name it. */
  name: string | null;
  message: string | null;
}

/** The two website entries offered for a new client (strategy #423). */
export interface ClientWebsiteEntries {
  connect: string;
  rebuild: string;
  /** Named staff can open website work through the verified provider seat.
   * Individual reads and writes recheck current seat/staff/agency membership. */
  rebuildOpenToAgency: boolean;
}

export interface AddAgencyClientResult {
  client: AgencyClientAddition;
  scan: ClientSiteScan;
  ownerClaim: OwnerClaim | null;
  /** Set when the owner email was given but its link could not be made; the client was still added. */
  ownerClaimError: string | null;
  website: ClientWebsiteEntries;
  aiCheck: ClientAiCheck;
  /** Only behind the claim review release: what was staged for the owner. */
  found?: ClientFoundFacts;
  /** Business creation and marking its source lead converted have separate receipts. */
  leadConversion?: { status: "converted" | "unconfirmed"; message?: string };
}

/** What an add staged for the owner's claim, and the areas the agency may Prepare until then. */
export interface ClientFoundFacts {
  status: "staged" | "owner_claimed" | "unavailable";
  staged: number;
  waiting: number;
  preparing: string[];
  message?: string;
}
export const AGENCY_CLIENT_FOUND_LIMIT = 120;

/** An agency-owned private assessment of the client's public website. */
export type ClientAiCheck =
  | { status: "ready"; workId: string; href: string; result: AiVisibilityResult }
  | { status: "unavailable" | "pending"; message: string; href: string }
  | { status: "not_requested" };

export function clientWebsiteEntries(customerWorkspaceId: string): ClientWebsiteEntries {
  const base = (entry: "connect" | "rebuild") => `/workspace/site?${new URLSearchParams({ workspaceId: customerWorkspaceId, entry })}`;
  return { connect: base("connect"), rebuild: base("rebuild"), rebuildOpenToAgency: true };
}

export const OWNER_CLAIM_PATH = "/workspace/claim/";
export const OWNER_CLAIM_LIFETIME_DAYS = 14;

/* ── Claim review (STRELVA_CLAIM_REVIEW_RELEASE) ─────────────────────────────
 * GLOSSARY: Found fact, Claim, Prepare / Full control. What the add found on
 * the client's site is staged as Found facts (with the page and words it came
 * from) and joins the business record only when the owner confirms it at the
 * claim. Until the claim, the adding agency holds Prepare in every area; at
 * the claim the owner decides each area. SQL contract:
 * supabase/migrations/20261024300000_claim_review.sql. */

// The one Found-fact shape lives in src/products/found-facts/contracts.ts.
export {
  FOUND_FACT_KEYS, FOUND_FACT_LABELS, FOUND_FACT_SOURCE_LABELS, foundFactInputSchema, foundFactSchema, importedFoundFactInputSchema,
  type AgencyFoundFactInput, type FoundFact, type FoundFactInput, type FoundFactKey, type ImportedFoundFactInput,
} from "@/products/found-facts/contracts";

export const CLAIM_AREAS = ["website", "inquiries", "bookings", "google", "internal_tools"] as const;
export type ClaimArea = (typeof CLAIM_AREAS)[number];
export const CLAIM_AREA_CHOICES = ["prepare", "full_control", "none"] as const;
export type ClaimAreaChoice = (typeof CLAIM_AREA_CHOICES)[number];
const areaChoice = z.enum(CLAIM_AREA_CHOICES);

export const claimReviewSchema = z.object({
  status: z.enum(["pending", "accepted", "revoked", "expired"]),
  workspaceId: uuid,
  workspaceName: z.string(),
  agencyWorkspaceId: uuid,
  agencyName: z.string(),
  found: z.array(foundFactSchema),
  prepared: z.array(z.object({ id: uuid, name: z.string(), kind: z.string() }).strict()),
  /** Areas where another agency already holds Full control; Full control can't be chosen there. */
  fullControlTaken: z.array(z.enum(CLAIM_AREAS)),
}).strict();
export type ClaimReview = z.infer<typeof claimReviewSchema>;

export const claimFactDecisionSchema = foundFactDecisionSchema;
export type ClaimFactDecision = z.infer<typeof claimFactDecisionSchema>;

export const claimReviewAcceptInputSchema = z.object({
  facts: z.array(claimFactDecisionSchema).max(200)
    .refine((items) => new Set(items.map((item) => item.id)).size === items.length, "Decide each found fact once."),
  areas: z.object({ website: areaChoice, inquiries: areaChoice, bookings: areaChoice, google: areaChoice, internal_tools: areaChoice }).strict(),
}).strict();
export type ClaimReviewAcceptInput = z.infer<typeof claimReviewAcceptInputSchema>;

export const claimReviewAcceptedSchema = ownerClaimAcceptedSchema.extend({
  areas: z.partialRecord(z.enum(CLAIM_AREAS), z.enum(CLAIM_AREA_CHOICES)).optional(),
  facts: z.object({ confirmed: z.number().int().min(0), changed: z.number().int().min(0), removed: z.number().int().min(0), later: z.number().int().min(0).optional(), waiting: z.number().int().min(0) }).optional(),
  /** Areas where the owner chose Full control: it starts when the agency accepts. */
  waitingForAgency: z.array(z.enum(CLAIM_AREAS)).optional(),
});
export type ClaimReviewAccepted = z.infer<typeof claimReviewAcceptedSchema>;

export * from "./import-contract";
