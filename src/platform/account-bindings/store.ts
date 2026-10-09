import { publishingWorkspaceId } from "@/platform/infra/publishing-scope";
import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { encryptSecret } from "@/platform/infra/crypto/secrets";
import {
  accountBindingWithSecretsSchema,
  bindingTargetSchema,
  type AccountBindingStatus,
  type AccountBindingWithSecrets,
  type BindingTarget,
  type GoogleGrantInput,
  type UpsertMode,
  type UpsertResult,
} from "./contracts";

/**
 * Thin RPC layer over 20261007170000_workspace_account_bindings.sql.
 *
 * Encryption guard (publishing spec, section 6 step 2): every token is
 * encrypted with the one secrets path before it leaves this process, and the
 * write refuses unless SECRETS_ENC_KEY is set and encryptSecret returned an
 * `enc:v1:` envelope. encryptSecret is a pass-through with no key, so without
 * this guard plaintext would land in Postgres. The table's CHECK refuses it
 * too; this guard is the first line.
 */

type DbError = { message?: string; code?: string } | null;
export type AccountBindingsDb = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: DbError }>;
};

let override: { db: AccountBindingsDb | null } | null = null;

/** Tests and scripts may supply their own client (null = unconfigured). */
export function setAccountBindingsDb(db: AccountBindingsDb | null | undefined): void {
  override = db === undefined ? null : { db };
}

export function accountBindingsDb(): AccountBindingsDb | null {
  if (override) return override.db;
  return getSupabase() as unknown as AccountBindingsDb | null;
}

/**
 * The binding store is read first and written beside Redis only when
 * STRELVA_GOOGLE_BINDINGS is "1". Off (the default), every Google token
 * read and write behaves exactly as before: Redis only.
 */
export function googleBindingsEnabled(env: { STRELVA_GOOGLE_BINDINGS?: string } = { STRELVA_GOOGLE_BINDINGS: process.env.STRELVA_GOOGLE_BINDINGS }): boolean {
  return env.STRELVA_GOOGLE_BINDINGS === "1";
}

export class BindingEncryptionRefused extends Error {
  constructor() {
    super("Refusing to store a Google token: SECRETS_ENC_KEY is not set, so it would be stored as plaintext.");
    this.name = "BindingEncryptionRefused";
  }
}

export class AccountBindingStoreError extends Error {
  constructor(message: string, readonly code: string | null) {
    super(message);
    this.name = "AccountBindingStoreError";
  }
}

const ENVELOPE = /^enc:v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/;

/** Encrypt one token for the binding table, or refuse. Null stays null. */
export function encryptForBinding(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (!process.env.SECRETS_ENC_KEY) throw new BindingEncryptionRefused();
  const sealed = encryptSecret(value);
  if (!ENVELOPE.test(sealed)) throw new BindingEncryptionRefused();
  return sealed;
}

/** True when this process can write tokens to the binding table at all. */
export function bindingEncryptionReady(): boolean {
  try {
    return encryptForBinding("probe") !== null;
  } catch {
    return false;
  }
}

function classify(error: NonNullable<DbError>): string {
  const detail = `${error.code ?? ""} ${error.message ?? ""}`;
  for (const code of [
    "account_binding_plaintext_refused", "account_binding_tenant_not_linked", "account_binding_workspace_unknown",
    "account_binding_not_found", "account_binding_invalid",
  ]) {
    if (detail.includes(code)) return code;
  }
  if (/PGRST202|42883|42P01/.test(detail)) return "schema_missing";
  return "error";
}

async function call<T>(name: string, args: Record<string, unknown>, parse: (data: unknown) => T, db = accountBindingsDb()): Promise<T> {
  if (!db) throw new AccountBindingStoreError("Account binding storage is unavailable.", "unconfigured");
  const { data, error } = await db.rpc(name, args);
  if (error) {
    const code = classify(error);
    throw new AccountBindingStoreError(`${name} failed: ${code}`, code);
  }
  return parse(data);
}

const upsertResultSchema = z.object({ status: z.enum(["created", "updated", "exists"]), id: z.string().uuid() });

export async function upsertGoogleBinding(input: GoogleGrantInput, mode: UpsertMode, db?: AccountBindingsDb | null): Promise<UpsertResult> {
  const payload = {
    workspaceId: input.workspaceId,
    provider: "google",
    originTenantStableId: input.originTenantStableId,
    ...(input.subject ? { subject: input.subject } : {}),
    // Null stays null: a grant from before scope tracking is "unknown", not "none".
    scopes: input.scopes ?? null,
    refreshTokenCiphertext: encryptForBinding(input.refreshToken),
    accessTokenCiphertext: encryptForBinding(input.accessToken),
    tokenExpiresAt: input.tokenExpiresAt ?? null,
    status: input.status,
    ...(input.lastError ? { lastError: input.lastError.slice(0, 500) } : {}),
  };
  return call("upsert_workspace_account_binding", { p_input: payload, p_mode: mode },
    (data) => upsertResultSchema.parse(data), db ?? accountBindingsDb());
}

export async function readGoogleBindingForTenant(tenantId: string, db?: AccountBindingsDb | null): Promise<AccountBindingWithSecrets | null> {
  const workspaceId = publishingWorkspaceId(tenantId);
  return call(workspaceId ? "read_native_workspace_google_binding" : "read_google_binding_for_tenant", workspaceId ? { p_workspace_id: workspaceId } : { p_tenant_id: tenantId },
    (data) => (data === null || data === undefined ? null : accountBindingWithSecretsSchema.parse(data)), db ?? accountBindingsDb());
}

export async function readBindingTarget(tenantId: string, db?: AccountBindingsDb | null): Promise<BindingTarget | null> {
  return call("read_tenant_binding_target", { p_tenant_id: tenantId },
    (data) => (data === null || data === undefined ? null : bindingTargetSchema.parse(data)), db ?? accountBindingsDb());
}

/** Atomic mutation of the exact grant read before an external operation. */
export async function mutateGoogleBinding(
  bindingId: string, expectedUpdatedAt: string,
  mutation: { accessToken?: string; expiresAt?: string | null; rotatedRefreshToken?: string | null; status?: AccountBindingStatus; error?: string | null; checkedAt?: string | null },
  db?: AccountBindingsDb | null,
): Promise<string> {
  return call("mutate_google_binding_generation", {
    p_binding_id: bindingId, p_expected_updated_at: expectedUpdatedAt,
    p_mutation: {
      ...(mutation.accessToken !== undefined ? { accessTokenCiphertext: encryptForBinding(mutation.accessToken), tokenExpiresAt: mutation.expiresAt ?? null } : {}),
      ...(mutation.rotatedRefreshToken ? { refreshTokenCiphertext: encryptForBinding(mutation.rotatedRefreshToken) } : {}),
      ...(mutation.status ? { status: mutation.status, error: mutation.error?.slice(0,500) ?? null, checkedAt: mutation.checkedAt ?? null } : {}),
    },
  }, data => z.string().parse(data), db ?? accountBindingsDb());
}

export async function updateGoogleBindingTokens(
  bindingId: string, tokens: { accessToken: string; expiresAt: string | null; rotatedRefreshToken?: string | null }, db?: AccountBindingsDb | null,
): Promise<void> {
  await call("update_workspace_account_binding_tokens", {
    p_binding_id: bindingId,
    p_access_ciphertext: encryptForBinding(tokens.accessToken),
    p_expires_at: tokens.expiresAt,
    p_refresh_ciphertext: encryptForBinding(tokens.rotatedRefreshToken ?? null),
  }, () => undefined, db ?? accountBindingsDb());
}

export async function setGoogleBindingStatus(
  bindingId: string, status: AccountBindingStatus, error: string | null, checkedAt: string | null, db?: AccountBindingsDb | null,
): Promise<void> {
  await call("set_workspace_account_binding_status", {
    p_binding_id: bindingId, p_status: status, p_error: error ? error.slice(0, 500) : null, p_checked_at: checkedAt,
  }, () => undefined, db ?? accountBindingsDb());
}

export async function upsertGoogleLocation(
  bindingId: string, location: { accountId: string; locationId: string; title?: string | null }, db?: AccountBindingsDb | null,
): Promise<void> {
  await call("upsert_workspace_google_location", {
    p_binding_id: bindingId, p_account_id: location.accountId, p_location_id: location.locationId, p_title: location.title ?? null,
  }, () => undefined, db ?? accountBindingsDb());
}
