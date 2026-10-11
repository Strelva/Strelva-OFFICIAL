import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { z } from "zod";
import type { GoogleProviderProofScope } from "./google-provider-proof-scope";
const observation = z.object({ identity: z.object({ system: z.string(), database: z.string(), address: z.string(), port: z.number() }).strict(), exactBinding: z.boolean(), otherBindings: z.number().int().nonnegative(), otherCaches: z.number().int().nonnegative(), expiredCaches: z.number().int().nonnegative() }).strict();
export function googleInspectionConnection(scope: Pick<GoogleProviderProofScope, "nativeDatabaseEndpointDigest">, raw: string) {
  try {
    const url = new URL(raw);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !["localhost", "127.0.0.1"].includes(url.hostname) || !url.port || !url.username || url.pathname.length < 2 || url.search || url.hash || createHash("sha256").update(raw).digest("hex") !== scope.nativeDatabaseEndpointDigest) throw new Error();
    return { PGHOST: url.hostname, PGPORT: url.port, PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGSSLMODE: "disable", PGCONNECT_TIMEOUT: "3", PGOPTIONS: "-c default_transaction_read_only=on" };
  } catch { throw new Error("Google native inspection held: exact approved loopback database required."); }
}
/** Fixed aggregate-only query: no caller SQL, row content, account IDs or credentials
 * returned. Native administrator inspection does not widen service_role ACLs. */
export function inspectGoogleNativeIsolation(scope: GoogleProviderProofScope) {
  const uuid = z.string().uuid();
  const workspace = uuid.parse(scope.workspaceId), binding = uuid.parse(scope.plan.grant.bindingId);
  const connection = googleInspectionConnection(scope, process.env.STRELVA_LOCAL_DB_URL || "");
  const sql = `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='3s'; SET LOCAL lock_timeout='1s';
SELECT json_build_object('identity',json_build_object('system',(pg_control_system()).system_identifier::text,'database',current_database(),'address',inet_server_addr()::text,'port',inet_server_port()),
'exactBinding',exists(select 1 from public.workspace_account_bindings where id='${binding}'::uuid and workspace_id='${workspace}'::uuid and provider='google'),
'otherBindings',(select count(*) from public.workspace_account_bindings where id<>'${binding}'::uuid or workspace_id<>'${workspace}'::uuid or provider<>'google'),
'otherCaches',(select count(*) from public.google_listing_receipt_payloads where workspace_id<>'${workspace}'::uuid),
'expiredCaches',(select count(*) from public.google_listing_receipt_payloads where expires_at<=clock_timestamp()));
ROLLBACK;`;
  try {
    const raw = execFileSync("psql", ["-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1"], { env: { NODE_ENV: process.env.NODE_ENV || "test", PATH: process.env.PATH, ...connection }, input: sql, encoding: "utf8", timeout: 5_000, maxBuffer: 4096, stdio: ["pipe", "pipe", "pipe"] });
    const parsed = observation.parse(JSON.parse(raw.trim()));
    const identityDigest = createHash("sha256").update(JSON.stringify([parsed.identity.system,parsed.identity.database,parsed.identity.address,parsed.identity.port])).digest("hex");
    if (identityDigest !== scope.nativeDatabaseIdentityDigest) throw new Error();
    return { exactBinding: parsed.exactBinding, otherBindings: parsed.otherBindings, otherCaches: parsed.otherCaches, expiredCaches: parsed.expiredCaches, identityDigest };
  } catch { throw new Error("Google native inspection held: bounded read-only qualification unavailable (details withheld)."); }
}
export function assertGoogleNativeIsolation(scope: GoogleProviderProofScope) {
  const state = inspectGoogleNativeIsolation(scope);
  if (!state.exactBinding || state.otherBindings !== 0 || state.otherCaches !== 0 || state.expiredCaches === 0) throw new Error("Google proof held: isolated exact grant and naturally expired cache required before any effect.");
  return state;
}
