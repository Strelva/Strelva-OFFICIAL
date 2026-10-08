import { z } from "zod";

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
  /** Where the owner claim link is addressed. Nothing is sent to it. */
  ownerEmail: email.optional(),
  idempotencyKey: uuid,
}).strict().refine((input) => input.url || input.prospectId || input.name, "Enter the business's website, or choose a prospect.");
export type AddAgencyClientInput = z.infer<typeof addAgencyClientInputSchema>;

export const issueOwnerClaimInputSchema = z.object({
  action: z.literal("owner_link"),
  agencyWorkspaceId: uuid,
  customerWorkspaceId: uuid,
  ownerEmail: email,
}).strict();
export type IssueOwnerClaimInput = z.infer<typeof issueOwnerClaimInputSchema>;

export const agencyClientActionSchema = z.union([addAgencyClientInputSchema, issueOwnerClaimInputSchema]);

/** How the owner link reached the owner. Today always not_sent / gated (decision R08, #235). */
export const ownerClaimDeliverySchema = z.object({
  status: z.literal("not_sent"),
  reason: z.literal("gated"),
  decision: z.string(),
  agencyEmailVerified: z.boolean(),
}).passthrough();
export type OwnerClaimDelivery = z.infer<typeof ownerClaimDeliverySchema>;

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
  /** Staffed provider seats can open the rebuild; the server rechecks current
   * full-work scope and every native write still enforces its own authority. */
  rebuildOpenToAgency: boolean;
}

export interface AddAgencyClientResult {
  client: AgencyClientAddition;
  scan: ClientSiteScan;
  ownerClaim: OwnerClaim | null;
  /** Set when the owner email was given but its link could not be made; the client was still added. */
  ownerClaimError: string | null;
  website: ClientWebsiteEntries;
}

export function clientWebsiteEntries(customerWorkspaceId: string): ClientWebsiteEntries {
  const base = (entry: "connect" | "rebuild") => `/workspace/site?${new URLSearchParams({ workspaceId: customerWorkspaceId, entry })}`;
  return { connect: base("connect"), rebuild: base("rebuild"), rebuildOpenToAgency: true };
}

export const OWNER_CLAIM_PATH = "/workspace/claim/";
export const OWNER_CLAIM_LIFETIME_DAYS = 14;
