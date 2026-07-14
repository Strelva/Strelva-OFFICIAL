#!/usr/bin/env npx tsx
/**
 * One-shot backfill: envelope-encrypt existing at-rest provider secrets.
 *
 * Run this ONCE, manually, AFTER `SECRETS_ENC_KEY` is set in the environment.
 * Until the key is set the encryption layer is INERT (new writes stay plaintext),
 * so this script is the deliberate activation step that rewrites the rows/blobs
 * that were written before the key existed.
 *
 * Encrypts:
 *   - Postgres `tenants`: slack_webhook_url, google_search_console_key,
 *     instagram_access_token, revalidation_secret.
 *   - Redis `connections:*`: accessToken, refreshToken, apiKey (via encodeConnection
 *     inside saveConnection).
 *
 * Idempotent — `encryptSecret` no-ops on an already-`enc:v1:`-prefixed value, so
 * running twice never double-encrypts. Reads stay backward compatible throughout
 * (`decryptSecret` passes plaintext through), so a partial run is safe.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/backfill-secret-encryption.ts
 */

import { getSupabase } from "../src/lib/db/client";
import { getRedis } from "../src/lib/redis";
import { encryptSecret } from "../src/lib/crypto/secrets";
import { saveConnection } from "../src/lib/connections";
import type { Connection } from "../src/lib/types";

const TENANT_SECRET_COLUMNS = [
  "slack_webhook_url",
  "google_search_console_key",
  "instagram_access_token",
  "revalidation_secret",
] as const;

type SecretColumn = (typeof TENANT_SECRET_COLUMNS)[number];
type TenantSecretRow = { id: string } & Record<SecretColumn, string | null>;

function isPrefixed(v: string | null): boolean {
  return !!v && v.startsWith("enc:v1:");
}

async function backfillTenants(): Promise<void> {
  const db = getSupabase();
  if (!db) {
    console.log("  Postgres: no Supabase client (SUPABASE_URL / SERVICE_ROLE_KEY unset) — skipping tenants.");
    return;
  }

  const cols = ["id", ...TENANT_SECRET_COLUMNS].join(", ");
  const { data, error } = await db.from("tenants").select(cols);
  if (error) throw new Error(`select tenants: ${error.message}`);

  const rows = (data ?? []) as unknown as TenantSecretRow[];
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    // Nothing to do if every secret is empty or already encrypted.
    const needsWork = TENANT_SECRET_COLUMNS.some(
      (c) => row[c] && row[c] !== "" && !isPrefixed(row[c]),
    );
    if (!needsWork) {
      skipped++;
      console.log(`  [skip] ${row.id} — all secrets empty or already encrypted`);
      continue;
    }

    const patch: Partial<Record<SecretColumn, string | null>> = {};
    const encryptedCols: string[] = [];
    for (const c of TENANT_SECRET_COLUMNS) {
      const enc = encryptSecret(row[c]); // passes null/"" through, no-ops if prefixed
      if (enc !== row[c]) {
        patch[c] = enc;
        encryptedCols.push(c);
      }
    }

    const { error: upErr } = await db.from("tenants").update(patch).eq("id", row.id);
    if (upErr) throw new Error(`update ${row.id}: ${upErr.message}`);
    updated++;
    console.log(`  [enc]  ${row.id} — encrypted ${encryptedCols.join(", ")}`);
  }

  console.log(`  Postgres tenants: ${updated} updated, ${skipped} already-clean of ${rows.length} total.`);
}

async function backfillConnections(): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    console.log("  Redis: not configured (UPSTASH_REDIS_* unset) — skipping connections.");
    return;
  }

  let cursor = "0";
  let updated = 0;
  let scanned = 0;
  do {
    const [next, keys] = await redis.scan(cursor, { match: "connections:*", count: 250 });
    cursor = String(next);
    for (const key of keys) {
      scanned++;
      // Read the RAW stored object (not via getConnection, which would decode it).
      const raw = await redis.get<Connection>(key);
      if (!raw) continue;
      // saveConnection re-encodes (encryptSecret is idempotent on prefixed values)
      // and writes back to the same deterministic key.
      await saveConnection(raw);
      updated++;
      console.log(`  [enc]  ${key}`);
    }
  } while (cursor !== "0");

  console.log(`  Redis connections: ${updated} re-encoded of ${scanned} scanned.`);
}

async function main(): Promise<void> {
  if (!process.env.SECRETS_ENC_KEY) {
    console.error(
      "REFUSED: SECRETS_ENC_KEY is not set. Set it first (the encryption layer is inert without it), " +
        "then re-run: npx tsx --env-file=.env.local scripts/backfill-secret-encryption.ts",
    );
    process.exit(1);
  }

  console.log("Backfilling at-rest secret encryption (enc:v1:, AES-256-GCM)…\n");
  await backfillTenants();
  await backfillConnections();
  console.log("\nDone. Re-running is safe (idempotent — already-encrypted values are skipped).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
