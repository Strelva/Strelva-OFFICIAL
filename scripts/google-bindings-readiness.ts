#!/usr/bin/env npx tsx
/**
 * Is STRELVA_GOOGLE_BINDINGS safe to flip? Read only.
 *
 *   npx tsx scripts/google-bindings-readiness.ts                         # local database, or prerequisites only
 *   npx tsx scripts/google-bindings-readiness.ts --i-have-jacobs-yes     # a non-local database, Jacob's call
 *   npx tsx scripts/google-bindings-readiness.ts --json
 *
 * Prints which prerequisites are present or absent (names only), the last 30
 * days of Redis fallbacks, and a dry run of the grant copy. It writes nothing
 * and never prints a token. Logic: scripts/google-bindings-readiness-core.ts.
 */
import "../src/register-workspace-ports"; // workspace ports src/lib declares (Strelva Reborn section 7)
import { getSupabase } from "../src/platform/infra/db/client";
import { getConnection } from "../src/lib/connections";
import { getRedis } from "../src/platform/infra/redis";
import { readGoogleBindingFallbacks } from "../src/lib/google-access";
import { bindingEncryptionReady, readBindingTarget, readGoogleBindingForTenant } from "../src/platform/account-bindings/store";
import { runGoogleBindingCopy } from "./google-binding-copy";
import { parseReadinessArgs, runGoogleBindingsReadiness } from "./google-bindings-readiness-core";

async function main() {
  const options = parseReadinessArgs(process.argv.slice(2));
  const databaseUrl = process.env.SUPABASE_URL;
  const report = await runGoogleBindingsReadiness({ ...options, databaseUrl }, {
    env: process.env,
    fallbacks: days => readGoogleBindingFallbacks(days),
    copyDryRun: () => runGoogleBindingCopy({ apply: false, verifyGoogle: false, jacobsYes: options.jacobsYes, databaseUrl }, {
      tenants: async () => {
        const db = getSupabase();
        if (!db) throw new Error("Supabase is not configured (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).");
        const { data, error } = await db.from("tenants").select("id, stable_id").order("id");
        if (error) throw new Error(`Tenant read failed: ${error.message}`);
        return (data ?? []).map(row => ({ id: row.id, stableId: row.stable_id as string }));
      },
      redisGrant: async tenantId => {
        const connection = await getConnection(tenantId, "google");
        return connection ? { status: connection.status, scopes: connection.scopes, refreshToken: connection.refreshToken } : null;
      },
      redisMeta: async tenantId => {
        const redis = getRedis();
        if (!redis) throw new Error("Redis is not configured.");
        return redis.get<{ accountId?: string; locationId?: string }>(`google-meta:${tenantId}`);
      },
      target: tenantId => readBindingTarget(tenantId),
      existing: async tenantId => (await readGoogleBindingForTenant(tenantId)) !== null,
      encryptionReady: bindingEncryptionReady,
      write: async () => { throw new Error("The readiness check never writes."); },
      writeLocation: async () => { throw new Error("The readiness check never writes."); },
      verify: async () => { throw new Error("The readiness check never calls Google."); },
      log: () => undefined,
    }),
    log: line => console.log(line),
  });
  if (options.json) console.log(JSON.stringify(report, null, 2));
  if (!report.flipReady) process.exitCode = 2;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
