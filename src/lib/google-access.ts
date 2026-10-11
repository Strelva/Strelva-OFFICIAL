/**
 * One way to reach a tenant's Google grant (publishing spec, section 6).
 *
 * Read order: the business-level binding in Postgres
 * (`workspace_account_bindings`) first, then Redis `connections:{tenant}:google`
 * as the fallback during the move. Every fallback while the binding store is on
 * is counted in `reb:google-binding:fallback:{yyyy-mm-dd}` so "30 days with zero
 * fallbacks" can be measured before the cut.
 *
 * Qualified reconnects commit credentials, metadata and binding atomically.
 * Redis-only compatibility remains when bindings and both durable stores are
 * off; qualified reconnects omit optional caches rather than reorder grants.
 *
 * Off by default. Redis-only writes require both durable stores to remain
 * unselected as well as STRELVA_GOOGLE_BINDINGS being off.
 *
 * Callers: google-token.ts (GSC/GA4 reads), google-resources.ts,
 * gbp-replies.ts, gbp-management.ts, the poll-google-reviews cron and the
 * OAuth callback. gbp-replies' duplicate token refresh is gone; this is the
 * only refresh path.
 */

import { getConnection, saveConnection, saveConnectionMutation } from "./connections";
import { publishingWorkspaceId } from "@/platform/infra/publishing-scope";
import { decryptSecret } from "@/platform/infra/crypto/secrets";
import { refreshGoogleTokens } from "./google-token";
import { durableRecordAuthority, writeDurableRecord, mirrorRecord, readProviderMetadata } from "./client-records";
import { getRedis } from "@/platform/infra/redis";
import { z } from "zod";
import type { Connection } from "./types";
// The business-level binding store (src/platform/account-bindings) through
// the port src/lib declares (Strelva Reborn section 7).
import { workspacePorts, type GoogleBindingWithSecrets, type GoogleBindingsPort, type LegacyGoogleOperationPin, type LegacyGoogleOperationInput } from "./workspace-ports";

const bindingStore = (): Promise<GoogleBindingsPort> => workspacePorts().googleBindings();

const EXPIRY_BUFFER_MS = 5 * 60 * 1000;
const META_TTL_SECONDS = 60 * 60 * 24 * 365;
export const GOOGLE_BINDING_FALLBACK_PREFIX = "reb:google-binding:fallback:";
const FALLBACK_TTL_SECONDS = 60 * 60 * 24 * 45;

export type GoogleGrantStatus = Connection["status"];

export interface GoogleLocationRef {
  accountId: string;
  locationId: string;
}

export interface GoogleGrant {
  source: "binding" | "redis";
  /** Captured before reading authority, never after an external await. */
  mutationStartedAt?: string;
  tenantId: string;
  status: GoogleGrantStatus;
  /** Undefined: connected before scope tracking. connectionHasWriteScope
   * treats that as "attempt the call". */
  scopes: string[] | undefined;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
  bindingId: string | null;
  bindingUpdatedAt?: string;
  workspaceId: string | null;
  /** From the binding; null means "read Redis google-meta". */
  location: GoogleLocationRef | null;
  /** The Redis record, kept so a refresh can write it back whole. */
  connection: Connection | null;
}

export type GoogleFallbackReason = "no_binding" | "decrypt_failed" | "schema_missing" | "unconfigured" | "error" | "no_location";

async function noteFallback(tenantId: string, reason: GoogleFallbackReason): Promise<void> {
  console.warn(`[google-access] binding fallback to Redis for ${tenantId}: ${reason}`);
  const redis = getRedis();
  if (!redis) return;
  try {
    const key = `${GOOGLE_BINDING_FALLBACK_PREFIX}${new Date().toISOString().slice(0, 10)}`;
    await redis.hincrby(key, reason, 1);
    await redis.expire(key, FALLBACK_TTL_SECONDS);
  } catch {
    // Counting is evidence, never a reason to fail a Google read.
  }
}

/** Fallback counts for the last `days` days, newest first. */
export async function readGoogleBindingFallbacks(days = 30, now = Date.now()): Promise<Array<{ date: string; counts: Record<string, number> }>> {
  const redis = getRedis();
  if (!redis) return [];
  const out: Array<{ date: string; counts: Record<string, number> }> = [];
  for (let i = 0; i < days; i += 1) {
    const date = new Date(now - i * 86_400_000).toISOString().slice(0, 10);
    const raw = await redis.hgetall<Record<string, number | string>>(`${GOOGLE_BINDING_FALLBACK_PREFIX}${date}`).catch(() => null);
    const counts: Record<string, number> = {};
    for (const [key, value] of Object.entries(raw ?? {})) counts[key] = Number(value) || 0;
    out.push({ date, counts });
  }
  return out;
}

function grantFromConnection(connection: Connection): GoogleGrant {
  return {
    source: "redis", tenantId: connection.tenantId, status: connection.status, scopes: connection.scopes,
    accessToken: connection.accessToken || null, refreshToken: connection.refreshToken ?? null,
    expiresAt: connection.expiresAt ?? null, bindingId: null, workspaceId: null, location: null, connection,
  };
}

function grantFromBinding(tenantId: string, binding: GoogleBindingWithSecrets): GoogleGrant {
  const primary = binding.locations.find((location) => location.isPrimary) ?? binding.locations[0] ?? null;
  return {
    source: "binding", tenantId,
    status: binding.status === "revoked" ? "disconnected" : binding.status,
    scopes: binding.scopes ?? undefined,
    accessToken: decryptSecret(binding.accessTokenCiphertext) ?? null,
    refreshToken: decryptSecret(binding.refreshTokenCiphertext) ?? null,
    bindingUpdatedAt: binding.updatedAt, expiresAt: binding.tokenExpiresAt, bindingId: binding.id, workspaceId: binding.workspaceId,
    location: primary ? { accountId: primary.accountId, locationId: primary.locationId } : null,
    connection: null,
  };
}

function reasonOf(error: unknown, store: GoogleBindingsPort): GoogleFallbackReason {
  if (error instanceof store.AccountBindingStoreError) {
    if (error.code === "schema_missing") return "schema_missing";
    if (error.code === "unconfigured") return "unconfigured";
  }
  return "error";
}

/** The tenant's Google grant: the binding first, Redis as the fallback. */
export async function getGoogleGrant(tenantId: string): Promise<GoogleGrant | null> {
  const mutationStartedAt = new Date().toISOString();
  const nativeWorkspace = publishingWorkspaceId(tenantId);
  const store = await bindingStore();
  if (store.googleBindingsEnabled()) {
    try {
      const binding = await store.readGoogleBindingForTenant(tenantId);
      if (binding) {
        try {
          return { ...grantFromBinding(tenantId, binding), mutationStartedAt };
        } catch {
          if (!nativeWorkspace) await noteFallback(tenantId, "decrypt_failed");
        }
      } else {
        if (!nativeWorkspace) await noteFallback(tenantId, "no_binding");
      }
    } catch (error) {
      if (!nativeWorkspace) await noteFallback(tenantId, reasonOf(error, store));
    }
  }
  if (nativeWorkspace) return null;
  const connection = await getConnection(tenantId, "google");
  return connection ? { ...grantFromConnection(connection), mutationStartedAt } : null;
}

/** The location id in a Google resource name. Business Information v1 returns
 * "locations/456"; older responses carry "accounts/123/locations/456". */
export function googleLocationIdFromName(name: string | undefined | null): string | undefined {
  if (!name) return undefined;
  const id = name.includes("/locations/") ? name.split("/locations/")[1] : name.replace(/^locations\//, "");
  return id && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : undefined;
}

/** The managed location: the binding's primary, else Redis google-meta. */
export async function getGoogleLocation(tenantId: string, grant?: GoogleGrant | null): Promise<GoogleLocationRef | null> {
  const nativeWorkspace = publishingWorkspaceId(tenantId);
  if (nativeWorkspace) return grant?.source === "binding" && grant.tenantId === tenantId && grant.workspaceId === nativeWorkspace && grant.bindingId ? grant.location : null;
  if (grant?.location) return grant.location;
  if (grant?.source === "binding") await noteFallback(tenantId, "no_location");
  const meta = await readProviderMetadata<{ accountId?: unknown; locationId?: unknown }>(tenantId, "google", async () => {
    const redis = getRedis();
    return redis ? redis.get(`google-meta:${tenantId}`) : null;
  });
  if (typeof meta?.accountId !== "string" || typeof meta.locationId !== "string" || !meta.accountId || !meta.locationId) return null;
  return { accountId: meta.accountId, locationId: meta.locationId };
}

/**
 * A usable access token: the stored one while it has more than five minutes
 * left (or no expiry was recorded), otherwise a fresh one from the refresh
 * token, written back to the store it came from. A rotated refresh token is
 * kept. A dead refresh token marks the binding needs_reauth; the Redis record
 * is left for its caller to mark, as before.
 */
export async function getValidGoogleAccessToken(grant: GoogleGrant, now = Date.now()): Promise<string | null> {
  if (grant.status !== "connected") return null;
  const mutationStartedAt = grant.mutationStartedAt ?? new Date(now).toISOString();
  if (grant.accessToken && (!grant.expiresAt || now + EXPIRY_BUFFER_MS < new Date(grant.expiresAt).getTime())) {
    return grant.accessToken;
  }
  if (!grant.refreshToken) return null;
  const connection = grant.connection ?? (!publishingWorkspaceId(grant.tenantId) ? await getConnection(grant.tenantId, "google").catch(() => null) : null);
  const outcome = await refreshGoogleTokens(grant.refreshToken);
  if (!outcome.ok) {
    if (outcome.reason === "invalid_grant" && grant.bindingId) {
      await mutateGrantBinding(grant, { status: "needs_reauth", error: "Google refused the refresh token.", checkedAt: new Date(now).toISOString() }).catch(() => {});
    }
    return null;
  }
  const { accessToken, expiresIn, refreshToken: rotated } = outcome.tokens;
  const expiresAt = new Date(now + (expiresIn ?? 3600) * 1000).toISOString();
  if (grant.source === "binding" && grant.bindingId) {
    try { await mutateGrantBinding(grant, { accessToken, expiresAt, rotatedRefreshToken: rotated }); }
    catch { return null; }
  }
  // Redis keeps working during the move: a rotated refresh token reaches it
  // too, and a Redis-sourced grant gets its fresh access token back.
  if (connection && (grant.source === "redis" || rotated)) {
    try {
      await saveConnectionMutation(connection, {
        ...(grant.source === "redis" ? { accessToken, expiresAt } : {}),
        ...(rotated ? { refreshToken: rotated } : {}),
      }, mutationStartedAt);
    } catch { return null; } // Never return refreshed authority after revocation.

  }
  grant.accessToken = accessToken;
  grant.expiresAt = expiresAt;
  if (rotated) grant.refreshToken = rotated;
  return accessToken;
}

async function mutateGrantBinding(grant: GoogleGrant, mutation: Parameters<GoogleBindingsPort["mutateGoogleBinding"]>[2]): Promise<void> {
  if (!grant.bindingId || !grant.bindingUpdatedAt) throw new Error("Google grant generation is unavailable.");
  grant.bindingUpdatedAt = await (await bindingStore()).mutateGoogleBinding(grant.bindingId, grant.bindingUpdatedAt, mutation);
}

/** A dead grant: the owner must reconnect. Marks every store that holds it. */
export async function markGoogleGrantNeedsReauth(grant: GoogleGrant, reason: string): Promise<void> {
  if (grant.bindingId) {
    await mutateGrantBinding(grant, { status: "needs_reauth", error: reason, checkedAt: new Date().toISOString() });
  }
  const connection = grant.connection ?? (publishingWorkspaceId(grant.tenantId) ? null : await getConnection(grant.tenantId, "google").catch(() => null));
  if (connection && connection.status === "connected") {
    await saveConnectionMutation(connection, { status: "needs_reauth" }, grant.mutationStartedAt ?? new Date().toISOString());
  }
}

/** A good read from Google: the listing's health counts from here. */
export async function noteGoogleReadSucceeded(grant: GoogleGrant, now = Date.now()): Promise<void> {
  if (!grant.bindingId) return;
  await mutateGrantBinding(grant, { status: "connected", error: null, checkedAt: new Date(now).toISOString() });
}

export type BindingWriteOutcome = "written" | "disabled" | "unlinked" | "refused_plaintext" | "failed";

type CapturedBinding = { store: GoogleBindingsPort; pin: LegacyGoogleOperationPin } | BindingWriteOutcome;
async function captureBindingOperation(tenantId: string, startedAt: string, expected?: LegacyGoogleOperationPin): Promise<CapturedBinding> {
  const store = await bindingStore();
  const [connectionsDurable, metadataDurable] = await Promise.all([
    durableRecordAuthority("provider_connections"), durableRecordAuthority("provider_metadata"),
  ]);
  if (!store.googleBindingsEnabled() && !connectionsDurable && !metadataDurable && !expected) return "disabled";
  if (!store.googleBindingsEnabled() || !connectionsDurable || !metadataDurable) return "failed";
  if (expected && (expected.tenantId !== tenantId || expected.startedAt !== startedAt)) return "failed";
  try {
    const pin = expected ?? await store.readLegacyGoogleOperation(tenantId, startedAt);
    return { store, pin };
  } catch { return "failed"; }
}
async function commitCapturedBinding(captured: CapturedBinding, input: LegacyGoogleOperationInput): Promise<BindingWriteOutcome> {
  if (typeof captured === "string") return captured;
  try { const result = await captured.store.commitLegacyGoogleBindingOperation(captured.pin, input); return result.bindingId ? "written" : "unlinked"; }
  catch (error) { return error instanceof captured.store.BindingEncryptionRefused ? "refused_plaintext" : "failed"; }
}

/** A governed reconnect captures exact current authority before token exchange.
 * The original start also fences a newer completed operation before capture. */
export async function beginGoogleReconnectOperation(tenantId: string, startedAt: number): Promise<LegacyGoogleOperationPin> {
  if (publishingWorkspaceId(tenantId) || process.env.STRELVA_NATIVE_GOOGLE_ONLY === "1") throw new Error("Native Google reconnect requires the workspace binding lifecycle.");
  const captured = await captureBindingOperation(tenantId, new Date(startedAt).toISOString());
  if (typeof captured === "string") throw new Error("Google reconnect persistence is unavailable.");
  return captured.pin;
}

/** Legacy tenant metadata follows its selected read authority; native scopes
 * use only their verified workspace binding and dedicated OAuth lifecycle. */
async function recordGoogleMetadata(tenantId: string, value: { accountId?: string; locationId?: string }, capturedAt: string, requireRedis: boolean): Promise<void> {
  if (publishingWorkspaceId(tenantId)) throw new Error("Native Google metadata requires the workspace binding lifecycle.");
  const durable = await durableRecordAuthority("provider_metadata");
  const redis = getRedis();
  if (durable) {
    const status = await writeDurableRecord("provider_metadata", tenantId, "google", { value }, capturedAt);
    if (status === "kept") throw new Error("Google location metadata was superseded by a newer change.");
    if (redis) await redis.set(`google-meta:${tenantId}`, value, { ex: META_TTL_SECONDS }).catch(() => {});
    return;
  }
  if (!redis) {
    if (requireRedis) throw new Error("persistence_unavailable");
    return;
  }
  await redis.set(`google-meta:${tenantId}`, value, { ex: META_TTL_SECONDS });
  await mirrorRecord("provider_metadata", tenantId, "google", { value }, capturedAt);
}

export interface GoogleConnectInput {
  tenantId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
  /** Undefined when Google returned no scope list. Never coerced to []. */
  scopes?: string[];
  accountId?: string;
  locationId?: string;
  locationTitle?: string;
}

/**
 * Qualified trusted reconnects admit and write every authoritative record in
 * one transaction. No legacy producer or optional cache precedes admission.
 */
export async function recordGoogleConnection(input: GoogleConnectInput, now = Date.now(), expected?: LegacyGoogleOperationPin): Promise<{ binding: BindingWriteOutcome }> {
  if (publishingWorkspaceId(input.tenantId) || process.env.STRELVA_NATIVE_GOOGLE_ONLY === "1") throw new Error("Native Google reconnect requires the workspace binding lifecycle.");
  const capturedAt = new Date(now).toISOString();
  const captured = await captureBindingOperation(input.tenantId, capturedAt, expected);
  if (typeof captured !== "string") {
    const binding = await commitCapturedBinding(captured, {
      grant: { workspaceId: captured.pin.workspaceId ?? "", originTenantStableId: captured.pin.tenantStableId,
        scopes: input.scopes ?? null, refreshToken: input.refreshToken ?? null, accessToken: input.accessToken,
        tokenExpiresAt: input.expiresAt, status: "connected" },
      ...(input.accountId && input.locationId ? { location: { accountId: input.accountId, locationId: input.locationId, title: input.locationTitle ?? null } } : {}),
    });
    return { binding };
  }
  if (captured !== "disabled") return { binding: captured };
  await saveConnection({
    provider: "google",
    tenantId: input.tenantId,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    expiresAt: input.expiresAt,
    status: "connected",
    lastSyncedAt: new Date(now).toISOString(),
    scopes: input.scopes,
  });
  if (input.accountId || input.locationId) {
    await recordGoogleMetadata(input.tenantId, { accountId: input.accountId, locationId: input.locationId }, capturedAt, false);
  }
  return { binding: "disabled" };
}

/** Qualified legacy selection uses the trusted atomic metadata transaction;
 * Redis compatibility remains only before both stores and bindings cut over. */
export async function recordGoogleLocationSelection(tenantId: string, location: GoogleLocationRef & { title?: string | null }): Promise<{ binding: BindingWriteOutcome }> {
  if (process.env.STRELVA_NATIVE_GOOGLE_ONLY === "1") throw new Error("Legacy Google location writes are disabled in native-only admission mode.");
  if (publishingWorkspaceId(tenantId)) throw new Error("Native Google metadata requires the workspace binding lifecycle.");
  const capturedAt = new Date().toISOString();
  const captured = await captureBindingOperation(tenantId, capturedAt);
  if (typeof captured !== "string") return { binding: await commitCapturedBinding(captured, { location }) };
  if (captured !== "disabled") return { binding: captured };
  await recordGoogleMetadata(tenantId, { accountId: location.accountId, locationId: location.locationId }, capturedAt, true);
  return { binding: "disabled" };
}


export type GoogleTenantOperation = LegacyGoogleOperationPin;
export interface GoogleOperationActor { userId: string; verifiedEmail: string }
const operationActorSchema = z.object({ userId: z.string().uuid(), verifiedEmail: z.string().email() });
/** Interactive legacy settings operations require selected durable authority;
 * Redis cannot hold a database permission lock across a later cache mutation. */
export async function beginGoogleTenantOperation(tenantId: string, actor: GoogleOperationActor): Promise<GoogleTenantOperation> {
  const startedAt = new Date().toISOString();
  operationActorSchema.parse(actor);
  if (publishingWorkspaceId(tenantId) || process.env.STRELVA_NATIVE_GOOGLE_ONLY === "1") throw new Error("Native Google settings require the workspace lifecycle.");
  const store = await bindingStore();
  if (!store.googleBindingsEnabled() || !await durableRecordAuthority("provider_connections") || !await durableRecordAuthority("provider_metadata")) throw new Error("persistence_unavailable");
  return store.readLegacyGoogleOperation(tenantId, startedAt);
}
async function applyAuthorizedGoogle(actor: GoogleOperationActor, pin: GoogleTenantOperation, kind: "oauth" | "location", input: LegacyGoogleOperationInput) {
  operationActorSchema.parse(actor);
  if (publishingWorkspaceId(pin.tenantId) || process.env.STRELVA_NATIVE_GOOGLE_ONLY === "1") throw new Error("Native Google settings require the workspace lifecycle.");
  const store = await bindingStore();
  if (!store.googleBindingsEnabled() || !await durableRecordAuthority("provider_connections") || !await durableRecordAuthority("provider_metadata")) throw new Error("persistence_unavailable");
  try { return await store.applyLegacyGoogleOperation(actor, pin, kind, input); }
  catch (error) {
    if (error instanceof store.AccountBindingStoreError) {
      if (error.code === "legacy_google_operation_superseded") throw new Error("google_operation_superseded");
      if (error.code === "google_settings_permission_denied") throw new Error("google_settings_permission_denied");
    }
    throw new Error("Google settings could not be committed with current authority.");
  }
}
export async function recordAuthorizedGoogleConnection(input: GoogleConnectInput, actor: GoogleOperationActor, pin: GoogleTenantOperation): Promise<{ binding: BindingWriteOutcome }> {
  if (input.tenantId !== pin.tenantId) throw new Error("Google operation tenant changed.");
  const grant = { workspaceId: pin.workspaceId ?? "", originTenantStableId: pin.tenantStableId, scopes: input.scopes ?? null,
    refreshToken: input.refreshToken ?? null, accessToken: input.accessToken, tokenExpiresAt: input.expiresAt, status: "connected" as const };
  const location = input.accountId && input.locationId ? { accountId: input.accountId, locationId: input.locationId, title: input.locationTitle ?? null } : undefined;
  const result = await applyAuthorizedGoogle(actor, pin, "oauth", { grant, ...(location ? { location } : {}) });
  // Selected durable readers already own this state. Reconstructing a cache
  // from the response would lose a retained refresh token or reorder grants.
  return { binding: result.bindingId ? "written" : "unlinked" };
}
export async function recordAuthorizedGoogleLocationSelection(tenantId: string, location: GoogleLocationRef & { title?: string | null }, actor: GoogleOperationActor, pin: GoogleTenantOperation): Promise<{ binding: BindingWriteOutcome }> {
  if (tenantId !== pin.tenantId) throw new Error("Google operation tenant changed.");
  const result = await applyAuthorizedGoogle(actor, pin, "location", { location });
  return { binding: result.bindingId ? "written" : "unlinked" };
}
