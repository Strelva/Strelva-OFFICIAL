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
 * Dry run by default: lists which tenant ids and connection keys hold plaintext
 * secrets (column and field names only, never a value) and writes nothing.
 * `--apply` writes. Any SUPABASE_URL or UPSTASH_REDIS_REST_URL that isn't
 * loopback or `*.localhost` is production: the script refuses it, dry run
 * included, without `--i-have-jacobs-yes`.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/backfill-secret-encryption.ts                 # dry run
 *   npx tsx --env-file=.env.local scripts/backfill-secret-encryption.ts --apply         # local apply
 *   npx tsx --env-file=<prod env> scripts/backfill-secret-encryption.ts --i-have-jacobs-yes
 *   npx tsx --env-file=<prod env> scripts/backfill-secret-encryption.ts --apply --i-have-jacobs-yes
 */

import { isLocalDatabaseUrl } from "./tenant-conversion";
import type { Connection } from "../src/lib/types";

export const TENANT_SECRET_COLUMNS = [
  "slack_webhook_url",
  "google_search_console_key",
  "instagram_access_token",
  "revalidation_secret",
] as const;
export const CONNECTION_SECRET_FIELDS = ["accessToken", "refreshToken", "apiKey"] as const;

type SecretColumn = (typeof TENANT_SECRET_COLUMNS)[number];
export type TenantSecretRow = { id: string } & Record<SecretColumn, string | null>;

export interface BackfillOptions { apply: boolean; jacobsYes: boolean }

export interface BackfillDeps {
  encryptSecret(value: string | null): string | null;
  /** Null when Postgres isn't configured. */
  tenants: null | {
    list(): Promise<TenantSecretRow[]>;
    update(id: string, patch: Partial<Record<SecretColumn, string | null>>): Promise<void>;
  };
  /** Null when Redis isn't configured. */
  connections: null | {
    keys(): AsyncIterable<string>;
    readRaw(key: string): Promise<Connection | null>;
    save(connection: Connection): Promise<void>;
  };
  log(line: string): void;
}

export interface BackfillOutcome {
  mode: "dry-run" | "apply";
  tenants: { total: number; needsWork: number; updated: number };
  connections: { scanned: number; needsWork: number; updated: number };
}

export function parseBackfillArgs(argv: string[]): BackfillOptions {
  const unknown = argv.filter((arg) => !/^--(?:apply|dry-run|i-have-jacobs-yes)$/.test(arg));
  if (unknown.length) throw new Error(`Unknown argument(s): ${unknown.join(", ")}. Usage: backfill-secret-encryption [--apply] [--i-have-jacobs-yes]`);
  const apply = argv.includes("--apply");
  if (apply && argv.includes("--dry-run")) throw new Error("Choose --dry-run or --apply, not both.");
  return { apply, jacobsYes: argv.includes("--i-have-jacobs-yes") };
}

/**
 * Every configured target must be local unless Jacob said yes. Checked before
 * anything is read, because a dry run still reads production secrets.
 */
export function assertBackfillTargetsAllowed(
  env: { SUPABASE_URL?: string; UPSTASH_REDIS_REST_URL?: string; SECRETS_ENC_KEY?: string },
  options: BackfillOptions,
): void {
  if (!env.SECRETS_ENC_KEY) {
    throw new Error("Refusing: SECRETS_ENC_KEY is not set. Set it first (the encryption layer is inert without it).");
  }
  const remote = [
    env.SUPABASE_URL && !isLocalDatabaseUrl(env.SUPABASE_URL) ? "SUPABASE_URL" : null,
    env.UPSTASH_REDIS_REST_URL && !isLocalDatabaseUrl(env.UPSTASH_REDIS_REST_URL) ? "UPSTASH_REDIS_REST_URL" : null,
  ].filter(Boolean);
  if (remote.length && !options.jacobsYes) {
    throw new Error(`Refusing: ${remote.join(" and ")} ${remote.length > 1 ? "are" : "is"} not a local loopback host. Reading or rewriting production secrets needs Jacob's yes (--i-have-jacobs-yes).`);
  }
}

const isPrefixed = (value: string | null | undefined) => !!value && value.startsWith("enc:v1:");
const plaintext = (value: string | null | undefined) => !!value && !isPrefixed(value);

export async function runSecretBackfill(options: BackfillOptions, deps: BackfillDeps): Promise<BackfillOutcome> {
  const mode = options.apply ? "apply" : "dry-run";
  const verb = options.apply ? "[enc] " : "[would encrypt]";
  const outcome: BackfillOutcome = {
    mode,
    tenants: { total: 0, needsWork: 0, updated: 0 },
    connections: { scanned: 0, needsWork: 0, updated: 0 },
  };

  if (!deps.tenants) deps.log("  Postgres: no Supabase client (SUPABASE_URL / SERVICE_ROLE_KEY unset) — skipping tenants.");
  else {
    const rows = await deps.tenants.list();
    outcome.tenants.total = rows.length;
    for (const row of rows) {
      const columns = TENANT_SECRET_COLUMNS.filter((c) => plaintext(row[c]));
      if (!columns.length) continue;
      outcome.tenants.needsWork++;
      if (options.apply) {
        const patch: Partial<Record<SecretColumn, string | null>> = {};
        for (const c of columns) patch[c] = deps.encryptSecret(row[c]);
        await deps.tenants.update(row.id, patch);
        outcome.tenants.updated++;
      }
      deps.log(`  ${verb} ${row.id} — ${columns.join(", ")}`);
    }
    deps.log(`  Postgres tenants: ${outcome.tenants.needsWork} with plaintext secrets of ${rows.length}; ${outcome.tenants.updated} updated.`);
  }

  if (!deps.connections) deps.log("  Redis: not configured (UPSTASH_REDIS_* unset) — skipping connections.");
  else {
    for await (const key of deps.connections.keys()) {
      outcome.connections.scanned++;
      const raw = await deps.connections.readRaw(key);
      if (!raw) continue;
      const fields = CONNECTION_SECRET_FIELDS.filter((f) => plaintext(raw[f]));
      if (!fields.length) continue;
      outcome.connections.needsWork++;
      if (options.apply) {
        // saveConnection re-encodes (encryptSecret is idempotent) and writes the same key.
        await deps.connections.save(raw);
        outcome.connections.updated++;
      }
      deps.log(`  ${verb} ${key} — ${fields.join(", ")}`);
    }
    deps.log(`  Redis connections: ${outcome.connections.needsWork} with plaintext secrets of ${outcome.connections.scanned} scanned; ${outcome.connections.updated} updated.`);
  }

  if (!options.apply) deps.log("\nDry run: nothing was written. Re-run with --apply to encrypt.");
  return outcome;
}

async function main(): Promise<void> {
  const options = parseBackfillArgs(process.argv.slice(2));
  assertBackfillTargetsAllowed({
    SUPABASE_URL: process.env.SUPABASE_URL,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    SECRETS_ENC_KEY: process.env.SECRETS_ENC_KEY,
  }, options);
  const [{ getSupabase }, { getRedis }, { encryptSecret }, { saveConnection }] = await Promise.all([
    import("../src/platform/infra/db/client"),
    import("../src/platform/infra/redis"),
    import("../src/platform/infra/crypto/secrets"),
    import("../src/lib/connections"),
  ]);
  const db = getSupabase();
  const redis = getRedis();

  console.log(`Backfilling at-rest secret encryption (enc:v1:, AES-256-GCM), ${options.apply ? "APPLY" : "dry run"}…\n`);
  await runSecretBackfill(options, {
    encryptSecret: (value) => encryptSecret(value) ?? null,
    log: (line) => console.log(line),
    tenants: db ? {
      async list() {
        const { data, error } = await db.from("tenants").select(["id", ...TENANT_SECRET_COLUMNS].join(", "));
        if (error) throw new Error(`select tenants: ${error.message}`);
        return (data ?? []) as unknown as TenantSecretRow[];
      },
      async update(id, patch) {
        const { error } = await db.from("tenants").update(patch).eq("id", id);
        if (error) throw new Error(`update ${id}: ${error.message}`);
      },
    } : null,
    connections: redis ? {
      async *keys() {
        let cursor = "0";
        do {
          const [next, keys] = await redis.scan(cursor, { match: "connections:*", count: 250 });
          cursor = String(next);
          yield* keys;
        } while (cursor !== "0");
      },
      // The RAW stored object (not getConnection, which would decode it).
      readRaw: (key) => redis.get<Connection>(key),
      save: (connection) => saveConnection(connection),
    } : null,
  });
  if (options.apply) console.log("\nDone. Re-running is safe (idempotent — already-encrypted values are skipped).");
}

if (process.argv[1]?.endsWith("backfill-secret-encryption.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
