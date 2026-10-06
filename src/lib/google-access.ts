/**
 * One way to reach a tenant's Google grant (publishing spec, section 6).
 *
 * Read order: the business-level binding in Postgres
 * (`workspace_account_bindings`) first, then Redis `connections:{tenant}:google`
 * as the fallback during the move. Every fallback while the binding store is on
 * is counted in `reb:google-binding:fallback:{yyyy-mm-dd}` so "30 days with zero
 * fallbacks" can be measured before the cut.
 *
 * Write order: a (re)connect writes Redis exactly as before, then the binding
 * (dual-write), so a reconnect during the move can't strand either side. The
 * binding write never fails the connect: Redis stays the working copy.
 *
 * Off by default. With STRELVA_GOOGLE_BINDINGS unset, this module reads and
 * writes Redis only, the same calls the callers made before.
 *
 * Callers: google-token.ts (GSC/GA4 reads), google-resources.ts,
 * gbp-replies.ts, gbp-management.ts, the poll-google-reviews cron and the
 * OAuth callback. gbp-replies' duplicate token refresh is gone; this is the
 * only refresh path.
 */

import { getConnection, saveConnection } from "./connections";
import { decryptSecret } from "@/platform/infra/crypto/secrets";
import { refreshGoogleTokens } from "./google-token";
import { getRedis } from "@/platform/infra/redis";
import type { Connection } from "./types";
import {
  googleBindingsEnabled,
  readBindingTarget,
  readGoogleBindingForTenant,
  setGoogleBindingStatus,
  updateGoogleBindingTokens,
  upsertGoogleBinding,
  upsertGoogleLocation,
  BindingEncryptionRefused,
  AccountBindingStoreError,
} from "@/platform/account-bindings/store";
import type { AccountBindingWithSecrets } from "@/platform/account-bindings/contracts";

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
  tenantId: string;
  status: GoogleGrantStatus;
  /** Undefined: connected before scope tracking. connectionHasWriteScope
   * treats that as "attempt the call". */
  scopes: string[] | undefined;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
  bindingId: string | null;
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

function grantFromBinding(tenantId: string, binding: AccountBindingWithSecrets): GoogleGrant {
  const primary = binding.locations.find((location) => location.isPrimary) ?? binding.locations[0] ?? null;
  return {
    source: "binding", tenantId,
    status: binding.status === "revoked" ? "disconnected" : binding.status,
    scopes: binding.scopes ?? undefined,
    accessToken: decryptSecret(binding.accessTokenCiphertext) ?? null,
    refreshToken: decryptSecret(binding.refreshTokenCiphertext) ?? null,
    expiresAt: binding.tokenExpiresAt, bindingId: binding.id, workspaceId: binding.workspaceId,
    location: primary ? { accountId: primary.accountId, locationId: primary.locationId } : null,
    connection: null,
  };
}

function reasonOf(error: unknown): GoogleFallbackReason {
  if (error instanceof AccountBindingStoreError) {
    if (error.code === "schema_missing") return "schema_missing";
    if (error.code === "unconfigured") return "unconfigured";
  }
  return "error";
}

/** The tenant's Google grant: the binding first, Redis as the fallback. */
export async function getGoogleGrant(tenantId: string): Promise<GoogleGrant | null> {
  if (googleBindingsEnabled()) {
    try {
      const binding = await readGoogleBindingForTenant(tenantId);
      if (binding) {
        try {
          return grantFromBinding(tenantId, binding);
        } catch {
          await noteFallback(tenantId, "decrypt_failed");
        }
      } else {
        await noteFallback(tenantId, "no_binding");
      }
    } catch (error) {
      await noteFallback(tenantId, reasonOf(error));
    }
  }
  const connection = await getConnection(tenantId, "google");
  return connection ? grantFromConnection(connection) : null;
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
  if (grant?.location) return grant.location;
  if (grant?.source === "binding") await noteFallback(tenantId, "no_location");
  const redis = getRedis();
  if (!redis) return null;
  const meta = await redis.get<{ accountId?: unknown; locationId?: unknown }>(`google-meta:${tenantId}`);
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
  if (grant.accessToken && (!grant.expiresAt || now + EXPIRY_BUFFER_MS < new Date(grant.expiresAt).getTime())) {
    return grant.accessToken;
  }
  if (!grant.refreshToken) return null;
  const outcome = await refreshGoogleTokens(grant.refreshToken);
  if (!outcome.ok) {
    if (outcome.reason === "invalid_grant" && grant.bindingId) {
      await setGoogleBindingStatus(grant.bindingId, "needs_reauth", "Google refused the refresh token.", new Date(now).toISOString()).catch(() => {});
    }
    return null;
  }
  const { accessToken, expiresIn, refreshToken: rotated } = outcome.tokens;
  const expiresAt = new Date(now + (expiresIn ?? 3600) * 1000).toISOString();
  grant.accessToken = accessToken;
  grant.expiresAt = expiresAt;
  if (rotated) grant.refreshToken = rotated;
  if (grant.source === "binding" && grant.bindingId) {
    await updateGoogleBindingTokens(grant.bindingId, { accessToken, expiresAt, rotatedRefreshToken: rotated }).catch((error) => {
      console.warn(`[google-access] could not store the refreshed token for ${grant.tenantId}: ${error instanceof Error ? error.message : "error"}`);
    });
  }
  // Redis keeps working during the move: a rotated refresh token reaches it
  // too, and a Redis-sourced grant gets its fresh access token back.
  const connection = grant.connection ?? (rotated ? await getConnection(grant.tenantId, "google").catch(() => null) : null);
  if (connection && (grant.source === "redis" || rotated)) {
    await saveConnection({
      ...connection,
      ...(grant.source === "redis" ? { accessToken, expiresAt } : {}),
      ...(rotated ? { refreshToken: rotated } : {}),
    }).catch(() => {});
  }
  return accessToken;
}

/** A dead grant: the owner must reconnect. Marks every store that holds it. */
export async function markGoogleGrantNeedsReauth(grant: GoogleGrant, reason: string): Promise<void> {
  if (grant.bindingId) {
    await setGoogleBindingStatus(grant.bindingId, "needs_reauth", reason, new Date().toISOString()).catch(() => {});
  }
  const connection = grant.connection ?? await getConnection(grant.tenantId, "google").catch(() => null);
  if (connection && connection.status === "connected") {
    await saveConnection({ ...connection, status: "needs_reauth" });
  }
}

/** A good read from Google: the listing's health counts from here. */
export async function noteGoogleReadSucceeded(grant: GoogleGrant, now = Date.now()): Promise<void> {
  if (!grant.bindingId) return;
  await setGoogleBindingStatus(grant.bindingId, "connected", null, new Date(now).toISOString()).catch(() => {});
}

export type BindingWriteOutcome = "written" | "disabled" | "unlinked" | "refused_plaintext" | "failed";

async function writeBinding(
  tenantId: string,
  write: (target: { workspaceId: string; tenantStableId: string }) => Promise<void>,
): Promise<BindingWriteOutcome> {
  if (!googleBindingsEnabled()) return "disabled";
  try {
    const target = await readBindingTarget(tenantId);
    if (!target) return "unlinked";
    await write(target);
    return "written";
  } catch (error) {
    if (error instanceof BindingEncryptionRefused) {
      console.error(`[google-access] binding write refused for ${tenantId}: SECRETS_ENC_KEY is not set`);
      return "refused_plaintext";
    }
    console.error(`[google-access] binding write failed for ${tenantId}: ${error instanceof Error ? error.message : "error"}`);
    return "failed";
  }
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
 * Record a (re)connect. Redis first, exactly as the callback always wrote it
 * (a Redis failure still fails the connect), then the binding beside it.
 */
export async function recordGoogleConnection(input: GoogleConnectInput, now = Date.now()): Promise<{ binding: BindingWriteOutcome }> {
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
    const redis = getRedis();
    if (redis) {
      await redis.set(`google-meta:${input.tenantId}`, { accountId: input.accountId, locationId: input.locationId }, { ex: META_TTL_SECONDS });
    }
  }
  const binding = await writeBinding(input.tenantId, async (target) => {
    const result = await upsertGoogleBinding({
      workspaceId: target.workspaceId,
      originTenantStableId: target.tenantStableId,
      scopes: input.scopes ?? null,
      refreshToken: input.refreshToken ?? null,
      accessToken: input.accessToken,
      tokenExpiresAt: input.expiresAt,
      status: "connected",
    }, "oauth");
    if (input.accountId && input.locationId) {
      await upsertGoogleLocation(result.id, { accountId: input.accountId, locationId: input.locationId, title: input.locationTitle ?? null });
    }
  });
  return { binding };
}

/** The owner picked a different Google location. Redis as before, then the binding. */
export async function recordGoogleLocationSelection(tenantId: string, location: GoogleLocationRef & { title?: string | null }): Promise<{ binding: BindingWriteOutcome }> {
  const redis = getRedis();
  if (!redis) throw new Error("persistence_unavailable");
  await redis.set(`google-meta:${tenantId}`, { accountId: location.accountId, locationId: location.locationId }, { ex: META_TTL_SECONDS });
  const binding = await writeBinding(tenantId, async () => {
    const existing = await readGoogleBindingForTenant(tenantId);
    if (!existing) throw new Error("no binding to attach the location to");
    await upsertGoogleLocation(existing.id, location);
  });
  return { binding };
}
