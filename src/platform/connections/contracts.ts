import { z } from "zod";

/**
 * Connections: every outside account a business's Systems read from or act on,
 * with two separate answers ADR 0016 requires:
 *
 * - accountHolder: whose login was connected (the business's own Google
 *   account, an agency's HighLevel agency account, Strelva's sending domain).
 * - accessThrough: whose approved provider app or project the calls run
 *   through (Strelva's platform project, one agency's own project).
 *
 * A Connection never grants authority by itself (GLOSSARY "Connection").
 * Agency authority still comes from the business's area grants.
 */

export const CONNECTION_PROVIDERS = [
  "google_business_profile",
  "google_calendar",
  "calendly",
  "highlevel",
  "connected_site",
  "stripe",
  "resend",
  "instagram",
] as const;
export const connectionProviderSchema = z.enum(CONNECTION_PROVIDERS);
export type ConnectionProvider = z.infer<typeof connectionProviderSchema>;

/** The access areas a business grants an agency (agency-clients CLAIM_AREAS). */
export const CONNECTION_AREAS = ["website", "inquiries", "bookings", "google", "internal_tools"] as const;
export type ConnectionArea = (typeof CONNECTION_AREAS)[number];

export const credentialHolderSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("platform") }).strict(),
  z.object({ kind: z.literal("agency"), workspaceId: z.string().uuid() }).strict(),
  z.object({ kind: z.literal("business"), workspaceId: z.string().uuid() }).strict(),
  /** Legacy rows recorded before ADR 0016. Shown honestly; never treated as eligible platform access. */
  z.object({ kind: z.literal("unknown") }).strict(),
]);
export type CredentialHolder = z.infer<typeof credentialHolderSchema>;
export type CredentialHolderKind = CredentialHolder["kind"];

export const PROVIDER_APPROVALS = ["approved", "pending", "not_required", "none"] as const;
export type ProviderApproval = (typeof PROVIDER_APPROVALS)[number];

/** Whose provider app/project serves one provider in this deployment, and its approval state. */
export const providerAccessSchema = z.object({
  provider: connectionProviderSchema,
  through: credentialHolderSchema,
  approval: z.enum(PROVIDER_APPROVALS),
}).strict();
export type ProviderAccess = z.infer<typeof providerAccessSchema>;

export const CONNECTION_STATES = ["connected", "stale", "disconnected", "unavailable"] as const;
export type WorkspaceConnectionState = (typeof CONNECTION_STATES)[number];

export const UNAVAILABLE_REASONS = ["coming_soon", "not_configured", "approval_pending", "not_your_agency", "area_not_granted"] as const;
export type UnavailableReason = (typeof UNAVAILABLE_REASONS)[number];

/** One row on a workspace's Connections page, whatever store it came from. */
export const workspaceConnectionSchema = z.object({
  /** Stable ref `<provider>:<source row id>`; also the Versions ConnectionOwnership ref where one exists. */
  ref: z.string().min(3).max(200),
  provider: connectionProviderSchema,
  /** The business this connection serves; for an agency's own account, the agency workspace. */
  workspaceId: z.string().uuid(),
  accountLabel: z.string().max(200).nullable(),
  accountHolder: credentialHolderSchema,
  accessThrough: credentialHolderSchema,
  state: z.enum(CONNECTION_STATES),
  unavailableReason: z.enum(UNAVAILABLE_REASONS).nullable(),
  connectedAt: z.string().nullable(),
  /** System ids in this workspace that bind this connection; empty when unknown or unused. */
  systemIds: z.array(z.string().uuid()),
}).strict();
export type WorkspaceConnection = z.infer<typeof workspaceConnectionSchema>;

/** Each product that stores outside accounts implements one source; the read model composes them. */
export interface ConnectionSource {
  provider: ConnectionProvider;
  list(input: { workspaceId: string; access: ProviderAccess }): Promise<WorkspaceConnection[]>;
}

/** What an App or System needs from outside, declared before install (system-versions declaration). */
export const requiredConnectionSchema = z.object({
  provider: connectionProviderSchema,
  access: z.enum(["read", "act"]),
  optional: z.boolean().default(false),
  purpose: z.string().trim().min(1).max(200),
}).strict();
export type RequiredConnection = z.infer<typeof requiredConnectionSchema>;

export type ProviderEligibility =
  | { eligible: true; through: CredentialHolder }
  | { eligible: false; reason: UnavailableReason; message: string };

/** Additive read evidence, including providers with no account rows yet. */
export const providerEligibilitySchema = z.union([
  z.object({ eligible: z.literal(true), through: credentialHolderSchema }).strict(),
  z.object({ eligible: z.literal(false), reason: z.enum(UNAVAILABLE_REASONS), message: z.string() }).strict(),
]);
export type ProviderEligibilityMap = Partial<Record<ConnectionProvider, ProviderEligibility>>;
