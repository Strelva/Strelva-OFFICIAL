#!/usr/bin/env npx tsx
/**
 * Copy tenant Google grants from Redis into Postgres workspace_account_bindings.
 *
 *   npx tsx scripts/copy-google-bindings.ts                     # dry run, counts only (default)
 *   npx tsx scripts/copy-google-bindings.ts mooney              # dry run, one tenant
 *   npx tsx scripts/copy-google-bindings.ts --apply             # local database only; needs SECRETS_ENC_KEY
 *   npx tsx scripts/copy-google-bindings.ts --apply --i-have-jacobs-yes          # production, Jacob's call
 *   npx tsx scripts/copy-google-bindings.ts --verify-google --i-have-jacobs-yes  # one read-only Google call per copy
 *
 * A dry run reads tenants, each tenant's Redis `connections:{tenant}:google`
 * and `google-meta:{tenant}`, the tenant's business link and whether a binding
 * already exists. It writes nothing anywhere and prints counts, never tokens.
 * Logic and guards: scripts/google-binding-copy.ts.
 */
import { getSupabase } from "../src/platform/infra/db/client";
import { getConnection } from "../src/lib/connections";
import { getRedis } from "../src/platform/infra/redis";
import { refreshGoogleTokens } from "../src/lib/google-token";
import { decryptSecret } from "../src/platform/infra/crypto/secrets";
import {
  bindingEncryptionReady,
  readBindingTarget,
  readGoogleBindingForTenant,
  upsertGoogleBinding,
  upsertGoogleLocation,
} from "../src/platform/account-bindings/store";
import { parseCopyArgs, runGoogleBindingCopy, type CopyTenant } from "./google-binding-copy";

const GBP_ACCOUNTS_URL = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";

async function tenants(): Promise<CopyTenant[]> {
  const db = getSupabase();
  if (!db) throw new Error("Supabase is not configured (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).");
  const { data, error } = await db.from("tenants").select("id, stable_id").order("id");
  if (error) throw new Error(`Tenant read failed: ${error.message}`);
  return (data ?? []).map((row) => ({ id: row.id, stableId: row.stable_id as string }));
}

async function main() {
  const options = parseCopyArgs(process.argv.slice(2));
  const hasDb = Boolean(getSupabase());
  const outcome = await runGoogleBindingCopy({ ...options, databaseUrl: process.env.SUPABASE_URL }, {
    tenants,
    redisGrant: async (tenantId) => {
      const connection = await getConnection(tenantId, "google");
      return connection ? {
        status: connection.status, scopes: connection.scopes, refreshToken: connection.refreshToken,
        accessToken: connection.accessToken, expiresAt: connection.expiresAt,
      } : null;
    },
    redisMeta: async (tenantId) => {
      const redis = getRedis();
      if (!redis) throw new Error("Redis is not configured.");
      return redis.get<{ accountId?: string; locationId?: string }>(`google-meta:${tenantId}`);
    },
    target: (tenantId) => readBindingTarget(tenantId),
    existing: hasDb ? async (tenantId) => (await readGoogleBindingForTenant(tenantId)) !== null : null,
    encryptionReady: bindingEncryptionReady,
    write: ({ workspaceId, tenantStableId, grant }) => upsertGoogleBinding({
      workspaceId, originTenantStableId: tenantStableId,
      scopes: grant.scopes ?? null,
      refreshToken: grant.refreshToken ?? null,
      accessToken: grant.accessToken ?? null,
      tokenExpiresAt: grant.expiresAt ?? null,
      status: grant.status === "disconnected" ? "revoked" : grant.status,
    }, "copy"),
    writeLocation: (bindingId, meta) => upsertGoogleLocation(bindingId, meta),
    verify: async (tenantId) => {
      // Mint from the Postgres copy, not Redis, and make one read. Nothing is written.
      const binding = await readGoogleBindingForTenant(tenantId);
      const refresh = decryptSecret(binding?.refreshTokenCiphertext ?? null);
      if (!refresh) return { ok: false, reason: "no_refresh_token_in_copy" };
      const minted = await refreshGoogleTokens(refresh);
      if (!minted.ok) return { ok: false, reason: minted.reason };
      const res = await fetch(GBP_ACCOUNTS_URL, { headers: { Authorization: `Bearer ${minted.tokens.accessToken}` } });
      return res.ok ? { ok: true, reason: "accounts_listed" } : { ok: false, reason: `google_status_${res.status}` };
    },
    log: options.json ? () => undefined : (line) => console.log(line),
  });
  if (options.json) console.log(JSON.stringify(outcome, null, 2));
  if (outcome.totals.failed > 0 || outcome.totals.verifyFailed > 0) process.exitCode = 2;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
