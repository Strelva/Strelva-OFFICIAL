import { z } from "zod";

/**
 * Business-level account bindings: one OAuth grant per (business, provider,
 * origin tenant). Mirrors supabase/migrations/20261007170000_workspace_account_bindings.sql.
 *
 * A binding gives access, never authority. Holding a Google token is not
 * approval to post (publishing spec, section 4 "Never").
 */

export const ACCOUNT_BINDING_STATUSES = ["connected", "needs_reauth", "revoked", "error"] as const;
export const accountBindingStatusSchema = z.enum(ACCOUNT_BINDING_STATUSES);
export type AccountBindingStatus = z.infer<typeof accountBindingStatusSchema>;

export const googleLocationSchema = z.object({
  accountId: z.string().regex(/^accounts\/[A-Za-z0-9_-]{1,64}$/),
  locationId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  title: z.string().nullable(),
  isPrimary: z.boolean(),
});
export type GoogleLocation = z.infer<typeof googleLocationSchema>;

/** What an actor-facing read returns. No token, ever. */
export const accountBindingSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  provider: z.literal("google"),
  subject: z.string().nullable(),
  originTenantStableId: z.string().uuid().nullable(),
  originTenantId: z.string().nullable(),
  /** Null: connected before scope tracking. Callers attempt the write. */
  scopes: z.array(z.string()).nullable(),
  tokenExpiresAt: z.string().nullable(),
  status: accountBindingStatusSchema,
  lastCheckedAt: z.string().nullable(),
  lastError: z.string().nullable(),
  migratedFrom: z.enum(["redis", "oauth"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  locations: z.array(googleLocationSchema),
});
export type AccountBinding = z.infer<typeof accountBindingSchema>;

/** Service-only read for the token adapter. Ciphertexts, never plaintext. */
export const accountBindingWithSecretsSchema = accountBindingSchema.extend({
  refreshTokenCiphertext: z.string().nullable(),
  accessTokenCiphertext: z.string().nullable(),
});
export type AccountBindingWithSecrets = z.infer<typeof accountBindingWithSecretsSchema>;

export const bindingTargetSchema = z.object({
  tenantStableId: z.string().uuid(),
  workspaceId: z.string().uuid(),
});
export type BindingTarget = z.infer<typeof bindingTargetSchema>;

/** The plaintext grant a caller hands the store. The store encrypts. */
export interface GoogleGrantInput {
  workspaceId: string;
  originTenantStableId: string | null;
  subject?: string | null;
  /** Undefined or null: scopes unknown (legacy). Never coerced to []. */
  scopes?: string[] | null;
  refreshToken?: string | null;
  accessToken?: string | null;
  tokenExpiresAt?: string | null;
  status: AccountBindingStatus;
  lastError?: string | null;
}

export type UpsertMode = "copy" | "oauth";
export interface UpsertResult {
  status: "created" | "updated" | "exists";
  id: string;
}
