/**
 * Copy tenant Google grants from Redis into workspace_account_bindings
 * (publishing spec, section 6, steps 1 to 4). Logic only; the CLI is
 * scripts/copy-google-bindings.ts. Readers, writer and verifier are injected so
 * a dry run is provably read-only.
 *
 * Modes:
 *   dry run (default)  reads Redis and Postgres, writes nothing, prints counts.
 *   --apply            copies each linked tenant's grant, re-encrypted, with
 *                      migrated_from = 'redis'. Refuses unless SECRETS_ENC_KEY
 *                      is set (encryptSecret is a pass-through without it), and
 *                      refuses a non-local database without --i-have-jacobs-yes.
 *                      Idempotent: an existing binding is never overwritten.
 *   --verify-google    mints one access token from each Postgres copy and makes
 *                      one read-only Google call. Production Google traffic, so
 *                      it always needs --i-have-jacobs-yes.
 *
 * Never prints or returns a token. Reports hold booleans and counts only.
 */
import { isLocalDatabaseUrl } from "./tenant-conversion";

export interface CopyTenant {
  id: string;
  stableId: string;
}

/** What Redis holds for one tenant, already decrypted by getConnection. */
export interface RedisGrant {
  status: "connected" | "disconnected" | "error" | "needs_reauth";
  /** Undefined: connected before scope tracking. Copied as null, never []. */
  scopes?: string[];
  refreshToken?: string;
  accessToken?: string;
  expiresAt?: string;
}

export interface RedisMeta {
  accountId?: string;
  locationId?: string;
}

export interface CopyDeps {
  tenants(): Promise<CopyTenant[]>;
  redisGrant(tenantId: string): Promise<RedisGrant | null>;
  redisMeta(tenantId: string): Promise<RedisMeta | null>;
  /** The business this tenant is linked to; null when not converted yet. */
  target(tenantId: string): Promise<{ workspaceId: string; tenantStableId: string } | null>;
  /** Whether a binding already exists; null when there is no database to ask. */
  existing: ((tenantId: string) => Promise<boolean>) | null;
  encryptionReady(): boolean;
  write(input: {
    workspaceId: string; tenantStableId: string; grant: RedisGrant;
  }): Promise<{ status: "created" | "updated" | "exists"; id: string }>;
  writeLocation(bindingId: string, meta: { accountId: string; locationId: string }): Promise<void>;
  /** One read-only Google call from the Postgres copy. */
  verify(tenantId: string): Promise<{ ok: boolean; reason: string }>;
  log(line: string): void;
}

export interface CopyOptions {
  tenant?: string;
  apply: boolean;
  verifyGoogle: boolean;
  jacobsYes: boolean;
  databaseUrl?: string;
}

export interface CopyTenantReport {
  tenantId: string;
  hasGoogle: boolean;
  status: RedisGrant["status"] | null;
  scopesRecorded: boolean;
  hasRefreshToken: boolean;
  linked: boolean;
  meta: "account_and_location" | "partial" | "none";
  alreadyCopied: boolean | null;
  result: "copied" | "exists" | "skipped_unlinked" | "skipped_no_refresh_token" | "skipped_no_google" | "would_copy" | "failed" | null;
  verify: { ok: boolean; reason: string } | null;
}

export interface CopyOutcome {
  mode: "dry-run" | "apply" | "verify";
  database: "local" | "not local" | "not configured";
  tenants: CopyTenantReport[];
  totals: {
    tenants: number; withGoogle: number; connected: number; scopesRecorded: number; scopesAbsent: number;
    withMeta: number; linked: number; alreadyCopied: number; toCopy: number; copied: number; failed: number;
    verified: number; verifyFailed: number;
  };
}

export function parseCopyArgs(argv: string[]): CopyOptions & { json: boolean } {
  const unknown = argv.filter((arg) => arg.startsWith("--") && !/^--(?:apply|dry-run|json|verify-google|i-have-jacobs-yes)$/.test(arg));
  if (unknown.length) throw new Error(`Unknown flag(s): ${unknown.join(", ")}`);
  const positional = argv.filter((arg) => !arg.startsWith("--"));
  if (positional.length > 1) throw new Error("Usage: copy-google-bindings [tenant-slug] [--apply] [--verify-google] [--json]");
  const apply = argv.includes("--apply");
  if (apply && argv.includes("--dry-run")) throw new Error("Choose --dry-run or --apply, not both.");
  if (positional[0] && !/^[a-z0-9-]+$/.test(positional[0])) throw new Error(`"${positional[0]}" is not a tenant slug.`);
  return {
    tenant: positional[0], apply, verifyGoogle: argv.includes("--verify-google"),
    jacobsYes: argv.includes("--i-have-jacobs-yes"), json: argv.includes("--json"),
  };
}

/** Refuses before anything is read when the run would act without its guard. */
export function assertCopyAllowed(options: CopyOptions, deps: Pick<CopyDeps, "encryptionReady">): CopyOutcome["database"] {
  const database = options.databaseUrl ? (isLocalDatabaseUrl(options.databaseUrl) ? "local" : "not local") : "not configured";
  if (options.verifyGoogle && !options.jacobsYes) {
    throw new Error("Refusing --verify-google: it calls Google with production grants. It needs Jacob's yes (--i-have-jacobs-yes).");
  }
  if (options.verifyGoogle && database === "not configured") {
    throw new Error("Refusing --verify-google: no database is configured (SUPABASE_URL), so there is no copy to verify.");
  }
  if (options.apply) {
    if (!deps.encryptionReady()) {
      throw new Error("Refusing --apply: SECRETS_ENC_KEY is not set, so tokens would be stored as plaintext.");
    }
    if (database === "not configured") throw new Error("Refusing --apply: no database is configured (SUPABASE_URL).");
    if (database === "not local" && !options.jacobsYes) {
      throw new Error("Refusing --apply: the database is not a local loopback host. A production copy needs Jacob's yes (--i-have-jacobs-yes).");
    }
  }
  return database;
}

function metaShape(meta: RedisMeta | null): CopyTenantReport["meta"] {
  if (meta?.accountId && meta.locationId) return "account_and_location";
  if (meta?.accountId || meta?.locationId) return "partial";
  return "none";
}

export async function runGoogleBindingCopy(options: CopyOptions, deps: CopyDeps): Promise<CopyOutcome> {
  const database = assertCopyAllowed(options, deps);
  const all = await deps.tenants();
  const tenants = options.tenant ? all.filter((tenant) => tenant.id === options.tenant) : all;
  if (options.tenant && tenants.length === 0) throw new Error(`No tenant "${options.tenant}".`);

  const reports: CopyTenantReport[] = [];
  for (const tenant of tenants) {
    const grant = await deps.redisGrant(tenant.id);
    const meta = await deps.redisMeta(tenant.id);
    const target = grant ? await deps.target(tenant.id) : null;
    const alreadyCopied = grant && target && deps.existing ? await deps.existing(tenant.id) : null;
    const report: CopyTenantReport = {
      tenantId: tenant.id, hasGoogle: Boolean(grant), status: grant?.status ?? null,
      scopesRecorded: Array.isArray(grant?.scopes), hasRefreshToken: Boolean(grant?.refreshToken),
      linked: Boolean(target), meta: metaShape(meta), alreadyCopied, result: null, verify: null,
    };
    if (!grant) report.result = "skipped_no_google";
    else if (!target) report.result = "skipped_unlinked";
    else if (!grant.refreshToken) report.result = "skipped_no_refresh_token";
    else if (alreadyCopied) report.result = "exists";
    else if (!options.apply) report.result = "would_copy";
    else {
      try {
        const written = await deps.write({ workspaceId: target.workspaceId, tenantStableId: target.tenantStableId, grant });
        if (meta?.accountId && meta.locationId) {
          await deps.writeLocation(written.id, { accountId: meta.accountId, locationId: meta.locationId });
        }
        report.result = written.status === "exists" ? "exists" : "copied";
      } catch (error) {
        report.result = "failed";
        // The message names a reason code, never a token.
        deps.log(`${tenant.id}: copy failed (${error instanceof Error ? error.message.slice(0, 160) : "error"})`);
      }
    }
    if (options.verifyGoogle && (report.result === "copied" || report.result === "exists")) {
      report.verify = await deps.verify(tenant.id).catch((error: unknown) => ({ ok: false, reason: error instanceof Error ? error.message.slice(0, 120) : "error" }));
    }
    reports.push(report);
  }

  const count = (predicate: (report: CopyTenantReport) => boolean) => reports.filter(predicate).length;
  const outcome: CopyOutcome = {
    mode: options.apply ? "apply" : options.verifyGoogle ? "verify" : "dry-run",
    database,
    tenants: reports,
    totals: {
      tenants: reports.length,
      withGoogle: count((r) => r.hasGoogle),
      connected: count((r) => r.status === "connected"),
      scopesRecorded: count((r) => r.hasGoogle && r.scopesRecorded),
      scopesAbsent: count((r) => r.hasGoogle && !r.scopesRecorded),
      withMeta: count((r) => r.meta === "account_and_location"),
      linked: count((r) => r.hasGoogle && r.linked),
      alreadyCopied: count((r) => r.alreadyCopied === true || r.result === "exists"),
      toCopy: count((r) => r.result === "would_copy" || r.result === "copied" || r.result === "failed"),
      copied: count((r) => r.result === "copied"),
      failed: count((r) => r.result === "failed"),
      verified: count((r) => r.verify?.ok === true),
      verifyFailed: count((r) => r.verify !== null && !r.verify.ok),
    },
  };
  const t = outcome.totals;
  deps.log(`Mode: ${outcome.mode}. Database: ${database}.`);
  deps.log(`Tenants: ${t.tenants}. With Google: ${t.withGoogle} (connected ${t.connected}; scopes recorded ${t.scopesRecorded}, absent ${t.scopesAbsent}).`);
  deps.log(`With account and location: ${t.withMeta}. Linked to a business: ${t.linked}. Already copied: ${t.alreadyCopied}.`);
  deps.log(`To copy: ${t.toCopy}. Copied: ${t.copied}. Failed: ${t.failed}.`);
  if (options.verifyGoogle) deps.log(`Verified against Google (read only): ${t.verified}. Verify failed: ${t.verifyFailed}.`);
  return outcome;
}
