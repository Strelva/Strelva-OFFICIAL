/**
 * Read-only production readiness snapshot for Strelva 1.0.0. Logic only; the
 * CLI is scripts/production-readiness-snapshot.ts and the release packet is
 * docs/operations/release-1.0-packet.md.
 *
 * It answers the open production facts the 1.0.0 specs list (workspaces,
 * memberships, applied migrations, email gates, Redis stores, tenant
 * features, Google and analytics state, unified_events recency) with counts
 * and flags only.
 *
 * Read-only by construction: the dependencies below expose reads only
 * (Postgres head counts and column selects, Redis SCAN, TYPE, cardinality and
 * one fixed-key client-email enum read per active tenant).
 * Nothing here can insert, update, delete, call an RPC, read an arbitrary Redis value or
 * set a key. The report holds no secret values and no customer data: env
 * secrets are reported as present/absent, tenant slugs and sending domains are
 * business identifiers, and assertNoSensitiveOutput() refuses to print anything
 * that looks like an email address or a token.
 */

import { silentRolloutEnvStops } from "./silent-rollout";

export const JACOBS_YES = "--i-have-jacobs-yes";

/* ------------------------------------------------------------------ deps -- */

export type DbFilter =
  | { column: string; op: "eq"; value: string | number | boolean }
  | { column: string; op: "not_null" }
  | { column: string; op: "is_null" }
  | { column: string; op: "gte"; value: string };

export type DbCount = { ok: true; count: number } | { ok: false; missing: boolean; reason: string };
export type DbRows<T> = { ok: true; rows: T[] } | { ok: false; missing: boolean; reason: string };

export const missingTable = (error: { message?: string; code?: string }) =>
  error.code === "42P01" || error.code === "PGRST205" || /does not exist|could not find the table/i.test(error.message ?? "");

export type CountResponse = { count: number | null; error: { message?: string; code?: string } | null; status?: number };

/**
 * A head-only count carries no response body, so a missing table can come back
 * with no error at all: status 404 and a null count. Only a real count is
 * "present"; a 404 or a null count never is.
 */
export function countResult({ count, error, status }: CountResponse): DbCount {
  if (status === 404) return { ok: false, missing: true, reason: error?.message || "404: table not found" };
  if (error) return { ok: false, missing: missingTable(error), reason: error.message || error.code || "unknown" };
  if (count === null || count === undefined) return { ok: false, missing: false, reason: `no count returned (status ${status ?? "unknown"})` };
  return { ok: true, count };
}


/** Postgres, read side only. Implemented with head counts and selects. */
export interface ReadOnlyDb {
  count(table: string, filters?: DbFilter[]): Promise<DbCount>;
  rows<T extends Record<string, unknown>>(
    table: string,
    columns: string,
    options?: { filters?: DbFilter[]; orderBy?: { column: string; ascending: boolean }; limit?: number },
  ): Promise<DbRows<T>>;
}

/** Redis reads only. The fixed-key email policy read returns an enum, never a raw value. */
export interface ReadOnlyRedis {
  clientEmailOverride(tenantId: string): Promise<"on" | "off" | "absent" | "unknown">;
  scan(cursor: string, options: { match: string; count: number }): Promise<[string, string[]]>;
  type(key: string): Promise<string>;
  /** ZCARD / LLEN / SCARD / HLEN by type; a number, never a value. */
  cardinality(key: string, type: string): Promise<number | null>;
}

export interface AuthUserSummary {
  total: number;
  emailConfirmed: number;
  signedInLast30Days: number;
}

export interface SnapshotDeps {
  db: ReadOnlyDb | null;
  redis: ReadOnlyRedis | null;
  /** Auth user counts. Null when not configured. Never returns identities. */
  authUsers: (() => Promise<AuthUserSummary | null>) | null;
  /** Versions in supabase_migrations.schema_migrations; null when no read-only SQL connection was given. */
  appliedVersions: (() => Promise<string[] | null>) | null;
  /** `<version>_<name>` for every migration file in the repository. */
  repoMigrations: string[];
  env: Record<string, string | undefined>;
  now?: () => number;
  log(line: string): void;
}

/* ------------------------------------------------------------- constants -- */

/** Last migration the Sept 30 record says production had (plus 20260930120000). */
export const SEPT30_LAST_APPLIED = "20260921220000";
export const SEPT30_EXTRA_APPLIED = ["20260930120000"];

/**
 * One table per unapplied migration that creates a table, so the snapshot can
 * tell applied from not applied without SQL access. A migration with only
 * functions or columns has no sentinel and needs schema_migrations.
 *
 * `20260729180000` (the July org layer) is recorded as applied on 2026-07-30.
 * Its sentinel confirms that, because batch 4 (`20261007180000`) alters
 * `accounts`. "missing" there is a stop.
 */
export const MIGRATION_SENTINELS: Record<string, string> = {
  "20261010140000": "google_listing_controls",
  "20261010142000": "workspace_newsletter_issues",
  "20261010143000": "publishing_google_outages",
  "20260729180000": "accounts",
  "20260928130000": "business_effort_entries",
  "20261001120000": "website_documents",
  "20261002120000": "business_records",
  "20261004120000": "systems",
  "20261005090000": "tenant_leads",
  "20261007110000": "workspace_providers",
  "20261007120000": "owner_decisions",
  "20261007130000": "workspace_release_flags",
  "20261007140000": "model_call_log",
  "20261007150000": "system_versions",
  "20261007150200": "platform_workspaces",
  "20261007160000": "operator_queue_marks",
  "20261007170000": "workspace_account_bindings",
  "20261007181000": "tenant_client_records",
  "20261007182000": "workspace_export_builds",
  "20261007190000": "document_revisions",
  "20261007190100": "onboarding_revisions",
  "20261007190200": "application_candidate_versions",
  "20261007192100": "internal_tool_notices",
  "20261007194000": "tenant_report_state",
  "20261008110000": "ask_conversations",
  "20261008111000": "website_change_receipts",
  "20261008124000": "decision_policy_tenant_imports",
  "20261008130000": "system_possibilities",
  "20261008141000": "business_bookings",
  "20261008150000": "website_linked_publications",
  "20261008150100": "website_domain_approvals",
  "20261008151000": "connected_sites",
  "20261009100000": "strelva_service_actions",
  "20261009110000": "business_booking_messages",
  "20261009113000": "inquiry_events",
  "20261010110000": "website_cutover_undos",
  "20261010113000": "website_rebuild_origins",
  "20261010114000": "website_domain_requests",
  "20261010115000": "website_model_allowances",
  "20261010115700": "website_native_fact_reviews",
  "20261010131000": "business_booking_access",
  "20261010132000": "business_booking_update_epoch",
  "20261010133000": "business_booking_calendar_mirrors",
  "20261010134000": "booking_inquiry_offers",
  "20261010135000": "booking_instant_policies",
  "20261010135920": "booking_service_policies",
  "20261010135950": "booking_calendar_health_actions",
  "20261010150300": "internal_tool_contact_conflicts",
  "20261010152000": "catalog_report_receipts",
  "20261010153000": "newsletter_contact_sync",
  "20261011100000": "workspace_newsletter_batches",
  "20261011120000": "business_policies",
  "20261011133700": "business_record_confirmed",
  "20261013120000": "business_owner_recipient_trust",
};

/** Env names reported. Secrets: presence only. Flags: normalized value. */
export const SECRET_ENV = [
  "SECRETS_ENC_KEY",
  "RESEND_API_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_CALENDAR_CLIENT_ID",
  "GOOGLE_CALENDAR_CLIENT_SECRET",
  "GOOGLE_SEARCH_CONSOLE_KEY",
  "OAUTH_STATE_SECRET",
  "INTERNAL_API_SECRET",
  "SCAFFOLD_PREVIEW_SIGNING_SECRET",
  "VERCEL_API_TOKEN",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "CRON_SECRET",
  "ANTHROPIC_API_KEY",
] as const;

/** Flag names from src at 30dcba1b (release packet section 2). Values are printed when short and plain. */
export const FLAG_ENV = [
  "EMAIL_SENDING_ENABLED",
  "CUSTOMER_EMAIL_ENABLED",
  "OPERATOR_EMAILS_ENABLED",
  "PROSPECT_EMAILS_ENABLED",
  "DUAL_WRITE_PG",
  "GOVERNED_WORK_DUAL_WRITE",
  "GOVERNED_WORK_READ_PG",
  "STRELVA_WORKSPACE_RELEASE",
  "STRELVA_INQUIRIES_RELEASE",
  "STRELVA_BACKGROUND_WORK_RELEASE",
  "STRELVA_PLANNING_ENABLED",
  "STRELVA_PRODUCT_LEARNING_RELEASE",
  "STRELVA_CUSTOMERS_RELEASE",
  "STRELVA_WEBSITE_REBUILD_RELEASE",
  "STRELVA_OWNER_ENTRY",
  "STRELVA_SYSTEMS_RELEASE",
  "STRELVA_INTERNAL_TOOL_NOTICES_RELEASE",
  "STRELVA_CATALOG_REPORTS_RELEASE",
  "STRELVA_NEWSLETTER_CONTACTS_RELEASE",
  "STRELVA_DOCUMENT_HISTORY_RELEASE",
  "STRELVA_ASK_RELEASE",
  "STRELVA_NEEDS_YOU_RELEASE",
  "STRELVA_PUBLISHING_RELEASE",
  "STRELVA_GOOGLE_BINDINGS",
  "STRELVA_BUSINESS_BILLING",
  "STRELVA_CLIENT_RECORDS_DUAL_WRITE",
  "STRELVA_CLIENT_RECORDS_READ",
  "STRELVA_EXPORT_SCHEMA_3",
  "STRELVA_LEADS_READ",
  "STRELVA_LEADS_AUTHORITY",
  "STRELVA_INQUIRY_RECORDS",
  "STRELVA_BOOKING_STORE_WRITE",
  "STRELVA_BOOKING_STORE_READ",
  "STRELVA_BOOKING_OWNER_NOTICE",
  "STRELVA_BOOKING_REMINDERS",
  "STRELVA_BOOKING_MANAGE_PAGE",
  "STRELVA_BOOKING_CALENDAR_BUSY",
  "STRELVA_BOOKING_AGENTS",
  "STRELVA_BOOKING_MESSAGES",
  "STRELVA_BOOKING_INQUIRY_OFFERS",
  "STRELVA_BOOKING_SETTINGS",
  "STRELVA_BOOKING_CALENDAR_MIRROR",
  "STRELVA_BOOKING_CALENDAR_SCOPES",
  "STRELVA_BOOKING_CALENDAR_REVOKE",
  "STRELVA_BOOKING_RECORD_FALLBACK",
  "STRELVA_BOOKING_MANUAL",
  "STRELVA_MAKE_REAL_LIVE",
  "STRELVA_CONNECTED_SITES_RELEASE",
  "STRELVA_WEBSITE_DOMAIN_EMAIL_ENABLED",
  "STRELVA_WEBSITE_MODEL_CALLS_ENABLED",
  "STRELVA_WEBSITE_BUSINESS_FACTS_ENABLED",
  "STRELVA_WEBSITE_NATIVE_FACTS_ENABLED",
  "STRELVA_MAKE_REAL_OWNER_LINK_RELEASE",
  "REB_DEV_UNGATED_ACCESS",
] as const;

/** Redis key families counted by SCAN. `tenantAt` is the key segment holding the tenant slug. */
export const REDIS_FAMILIES = [
  { name: "client email overrides", match: "reb:client-email:*", tenantAt: 2, cardinality: false },
  { name: "orders", match: "orders:*", tenantAt: 1, cardinality: true },
  { name: "order records", match: "order:*", tenantAt: 1, cardinality: false },
  { name: "rewards", match: "reb:rewards:*", tenantAt: 2, cardinality: false },
  { name: "leads", match: "leads:*", tenantAt: 1, cardinality: true },
  { name: "spam pit", match: "reb:spam-pit:*", tenantAt: 2, cardinality: false },
  { name: "google connections", match: "connections:*:google", tenantAt: 1, cardinality: false },
  { name: "all provider connections", match: "connections:*", tenantAt: 1, cardinality: false },
  { name: "google meta", match: "google-meta:*", tenantAt: 1, cardinality: false },
  { name: "analytics config", match: "analytics:cfg:*", tenantAt: 2, cardinality: false },
  { name: "report cadence", match: "reb:report-cadence:*", tenantAt: 2, cardinality: false },
  { name: "google binding fallback days", match: "reb:google-binding:fallback:*", tenantAt: null, cardinality: false },
  { name: "lead mirror pending", match: "reb:lead-mirror:pending*", tenantAt: null, cardinality: true },
  { name: "events", match: "events:*", tenantAt: 1, cardinality: true },
  { name: "accounts", match: "account:*", tenantAt: null, cardinality: false },
  { name: "booking config", match: "reb:booking:config:*", tenantAt: 3, cardinality: false },
  { name: "booking date overrides", match: "reb:booking:overrides:*", tenantAt: 3, cardinality: false },
  { name: "booking slot locks", match: "reb:booking:slot:*", tenantAt: 3, cardinality: false },
  { name: "booking store pending", match: "reb:booking-store:pending*", tenantAt: null, cardinality: true },
] as const;

const SCAN_PAGE = 500;
const SCAN_KEY_LIMIT = 200_000;

/* ---------------------------------------------------------------- report -- */

/** on/off for boolean-like values, the value itself when short and plain (e.g. "workspace"), else "set". */
export type Tri = string;

export interface SnapshotReport {
  version: 1;
  observedAt: string;
  sources: { postgres: boolean; redis: boolean; auth: boolean; schemaMigrations: boolean };
  env: { secrets: Record<string, "present" | "absent">; flags: Record<string, Tri> };
  migrations: {
    repoCount: number;
    pendingBySept30Record: string[];
    applied: string[] | null;
    unappliedInRepo: string[] | null;
    appliedNotInRepo: string[] | null;
    sentinels: Record<string, "present" | "missing" | "unknown">;
  };
  postgres: {
    tenants: { total: number | null; active: number | null };
    activeTenants: { id: string; features: string[]; resendDomain: string | null; hasSearchConsoleKey: boolean }[];
    workspaces: { total: number | null; byKind: Record<string, number | null> };
    workspaceMemberships: number | null;
    tenantMemberships: number | null;
    openTenantInvites: number | null;
    pendingWorkspaceInvitations: number | null;
    workspaceTenantLinks: number | null;
    governedWork: { proposals: number | null; latestProposalAt: string | null };
    unifiedEvents: { total: number | null; last24h: number | null; last7d: number | null; latestAt: string | null };
    tenantLeads: number | null;
    workspaceAccountBindings: number | null;
    /** Legacy `bookings` rows (the booking-store backfill's size) and public website booking receipts. */
    bookings: { legacyTotal: number | null; legacyByActiveTenant: Record<string, number | null>; publicWebsiteReceipts: number | null };
  };
  auth: AuthUserSummary | null;
  redis: {
    families: { name: string; match: string; keys: number; truncated: boolean; types: Record<string, number>; byTenant: Record<string, number>; entriesByTenant?: Record<string, number> }[];
    activeTenantsWithAnalyticsConfig: string[];
    activeTenantsWithGoogleConnection: string[];
    activeTenantsWithClientEmailOverride: string[];
    clientEmailOverrides: Record<string, "on" | "off" | "absent" | "unknown">;
  } | null;
  silentRollout: { safe: boolean; stopConditions: string[] };
  notes: string[];
}

/* ----------------------------------------------------------------- guard -- */

export function parseSnapshotArgs(argv: string[]): { jacobsYes: boolean; json: boolean } {
  const unknown = argv.filter((arg) => !/^--(?:json|i-have-jacobs-yes)$/.test(arg));
  if (unknown.length) throw new Error(`Unknown argument(s): ${unknown.join(", ")}`);
  return { jacobsYes: argv.includes(JACOBS_YES), json: argv.includes("--json") };
}

export function requireJacobsYes(options: { jacobsYes: boolean }): void {
  if (!options.jacobsYes) {
    throw new Error(
      "Refusing to run: this reads production. It is read-only, but it still needs Jacob's yes (--i-have-jacobs-yes). " +
        "See docs/operations/release-1.0-packet.md, step 0.",
    );
  }
}

const EMAIL = /[^\s"'@]+@[^\s"'@]+\.[a-z]{2,}/i;
const TOKENISH = /\b(?:sk_(?:live|test)_|rk_(?:live|test)_|whsec_|eyJ)[A-Za-z0-9_\-.]{8,}|\b[A-Za-z0-9+/_-]{40,}={0,2}/;

/** Throws if the text would print an email address or something token-shaped. */
export function assertNoSensitiveOutput(text: string): void {
  if (EMAIL.test(text)) throw new Error("Refusing to print: the snapshot output contains an email address.");
  if (TOKENISH.test(text)) throw new Error("Refusing to print: the snapshot output contains a token-shaped value.");
}

/* ------------------------------------------------------------------ core -- */

function flagState(value: string | undefined): Tri {
  if (value === undefined || value === "") return "absent";
  const v = value.trim().toLowerCase();
  if (["1", "true", "on", "yes"].includes(v)) return "on";
  if (["0", "false", "off", "no"].includes(v)) return "off";
  return /^[a-z0-9_,-]{1,64}$/i.test(v) ? `value: ${v}` : "set (value hidden)";
}

function versionOf(migration: string): string {
  return migration.slice(0, 14);
}

const countOrNull = (result: DbCount): number | null => (result.ok ? result.count : null);

async function scanFamily(redis: ReadOnlyRedis, family: (typeof REDIS_FAMILIES)[number]) {
  const keys: string[] = [];
  let cursor = "0";
  let truncated = false;
  do {
    const [next, page] = await redis.scan(cursor, { match: family.match, count: SCAN_PAGE });
    keys.push(...page);
    cursor = String(next);
    if (keys.length >= SCAN_KEY_LIMIT) {
      truncated = true;
      break;
    }
  } while (cursor !== "0");
  const unique = [...new Set(keys)];
  const types: Record<string, number> = {};
  const byTenant: Record<string, number> = {};
  const entriesByTenant: Record<string, number> = {};
  // TYPE is sampled for at most 50 keys; byTenant counts every key.
  for (const [index, key] of unique.entries()) {
    const tenant = family.tenantAt === null ? null : key.split(":")[family.tenantAt] ?? null;
    if (tenant) byTenant[tenant] = (byTenant[tenant] ?? 0) + 1;
    if (index < 50 || family.cardinality) {
      const type = await redis.type(key);
      if (index < 50) types[type] = (types[type] ?? 0) + 1;
      if (family.cardinality) {
        const n = await redis.cardinality(key, type);
        const bucket = tenant ?? "all";
        if (n !== null) entriesByTenant[bucket] = (entriesByTenant[bucket] ?? 0) + n;
      }
    }
  }
  return {
    name: family.name,
    match: family.match,
    keys: unique.length,
    truncated,
    types,
    byTenant,
    ...(family.cardinality ? { entriesByTenant } : {}),
  };
}

export async function runReadinessSnapshot(options: { jacobsYes: boolean }, deps: SnapshotDeps): Promise<SnapshotReport> {
  requireJacobsYes(options);
  const now = (deps.now ?? Date.now)();
  const iso = (ms: number) => new Date(ms).toISOString();
  const notes: string[] = [];
  const { db, redis } = deps;
  if (!db) notes.push("Postgres not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY): every Postgres fact is null.");
  if (!redis) notes.push("Redis not configured (UPSTASH_REDIS_REST_URL / _TOKEN): every Redis fact is null.");

  /* env */
  const secrets = Object.fromEntries(SECRET_ENV.map((name) => [name, deps.env[name] ? "present" : "absent"])) as Record<string, "present" | "absent">;
  const flags = Object.fromEntries(FLAG_ENV.map((name) => [name, flagState(deps.env[name])])) as Record<string, Tri>;

  /* migrations */
  const repoVersions = deps.repoMigrations.map(versionOf).sort();
  const pendingBySept30Record = deps.repoMigrations
    .filter((m) => versionOf(m) > SEPT30_LAST_APPLIED && !SEPT30_EXTRA_APPLIED.includes(versionOf(m)))
    .sort();
  const applied = deps.appliedVersions ? await deps.appliedVersions() : null;
  if (!applied) notes.push("schema_migrations not read (no read-only SQL connection). Migration state comes from table sentinels only; run `supabase migration list --linked` for the full list.");
  const appliedSet = applied ? new Set(applied) : null;
  const sentinels: Record<string, "present" | "missing" | "unknown"> = {};
  for (const [version, table] of Object.entries(MIGRATION_SENTINELS)) {
    if (!db) {
      sentinels[version] = "unknown";
      continue;
    }
    const probe = await db.count(table);
    sentinels[version] = probe.ok ? "present" : probe.missing ? "missing" : "unknown";
    if (appliedSet && (probe.ok ? !appliedSet.has(version) : probe.missing && appliedSet.has(version))) {
      notes.push(`Migration ${version}: schema_migrations and the ${table} sentinel disagree. Investigate before any push.`);
    }
  }

  let activeTenantReadComplete = false;
  /* postgres */
  const pg: SnapshotReport["postgres"] = {
    tenants: { total: null, active: null },
    activeTenants: [],
    workspaces: { total: null, byKind: {} },
    workspaceMemberships: null,
    tenantMemberships: null,
    openTenantInvites: null,
    pendingWorkspaceInvitations: null,
    workspaceTenantLinks: null,
    governedWork: { proposals: null, latestProposalAt: null },
    unifiedEvents: { total: null, last24h: null, last7d: null, latestAt: null },
    tenantLeads: null,
    workspaceAccountBindings: null,
    bookings: { legacyTotal: null, legacyByActiveTenant: {}, publicWebsiteReceipts: null },
  };
  if (db) {
    pg.tenants.total = countOrNull(await db.count("tenants"));
    pg.tenants.active = countOrNull(await db.count("tenants", [{ column: "active", op: "eq", value: true }]));
    const active = await db.rows<{ id: string; features: string[] | null; resend_domain: string | null }>(
      "tenants", "id, features, resend_domain",
      { filters: [{ column: "active", op: "eq", value: true }], orderBy: { column: "id", ascending: true } },
    );
    // Presence of the Search Console key without ever selecting it.
    const gsc = await db.rows<{ id: string }>("tenants", "id", {
      filters: [{ column: "active", op: "eq", value: true }, { column: "google_search_console_key", op: "not_null" }],
    });
    const gscIds = new Set(gsc.ok ? gsc.rows.map((r) => r.id) : []);
    if (active.ok) {
      activeTenantReadComplete = pg.tenants.active !== null && active.rows.length === pg.tenants.active;
      pg.activeTenants = active.rows.map((row) => ({
        id: row.id,
        features: Array.isArray(row.features) ? [...row.features].sort() : [],
        resendDomain: row.resend_domain ?? null,
        hasSearchConsoleKey: gscIds.has(row.id),
      }));
    } else notes.push(`Active tenant read failed: ${active.reason}`);

    pg.workspaces.total = countOrNull(await db.count("workspaces"));
    for (const kind of ["personal", "customer", "agency"]) {
      pg.workspaces.byKind[kind] = countOrNull(await db.count("workspaces", [{ column: "kind", op: "eq", value: kind }]));
    }
    pg.workspaceMemberships = countOrNull(await db.count("workspace_memberships"));
    pg.tenantMemberships = countOrNull(await db.count("memberships"));
    pg.openTenantInvites = countOrNull(await db.count("invites", [{ column: "claimed_at", op: "is_null" }]));
    pg.pendingWorkspaceInvitations = countOrNull(await db.count("workspace_invitations", [{ column: "status", op: "eq", value: "pending" }]));
    pg.workspaceTenantLinks = countOrNull(await db.count("tenant_workspace_links"));
    pg.tenantLeads = countOrNull(await db.count("tenant_leads"));
    pg.workspaceAccountBindings = countOrNull(await db.count("workspace_account_bindings"));
    pg.bookings.legacyTotal = countOrNull(await db.count("bookings"));
    for (const tenant of pg.activeTenants) {
      pg.bookings.legacyByActiveTenant[tenant.id] = countOrNull(await db.count("bookings", [{ column: "tenant_id", op: "eq", value: tenant.id }]));
    }
    pg.bookings.publicWebsiteReceipts = countOrNull(await db.count("public_website_bookings"));

    pg.governedWork.proposals = countOrNull(await db.count("proposals"));
    const latestProposal = await db.rows<{ created_at: string }>("proposals", "created_at", { orderBy: { column: "created_at", ascending: false }, limit: 1 });
    pg.governedWork.latestProposalAt = latestProposal.ok ? latestProposal.rows[0]?.created_at ?? null : null;

    pg.unifiedEvents.total = countOrNull(await db.count("unified_events"));
    pg.unifiedEvents.last24h = countOrNull(await db.count("unified_events", [{ column: "created_at", op: "gte", value: iso(now - 86_400_000) }]));
    pg.unifiedEvents.last7d = countOrNull(await db.count("unified_events", [{ column: "created_at", op: "gte", value: iso(now - 7 * 86_400_000) }]));
    const latestEvent = await db.rows<{ created_at: string }>("unified_events", "created_at", { orderBy: { column: "created_at", ascending: false }, limit: 1 });
    pg.unifiedEvents.latestAt = latestEvent.ok ? latestEvent.rows[0]?.created_at ?? null : null;
  }

  /* auth */
  const auth = deps.authUsers ? await deps.authUsers() : null;

  /* redis */
  let redisReport: SnapshotReport["redis"] = null;
  if (redis) {
    const families: NonNullable<SnapshotReport["redis"]>["families"] = [];
    for (const family of REDIS_FAMILIES) families.push(await scanFamily(redis, family));
    const activeIds = pg.activeTenants.map((t) => t.id);
    const tenantsIn = (name: string) => {
      const family = families.find((f) => f.name === name);
      const present = new Set(Object.keys(family?.byTenant ?? {}));
      return activeIds.length ? activeIds.filter((id) => present.has(id)) : [...present].sort();
    };
    const clientEmailOverrides: NonNullable<SnapshotReport["redis"]>["clientEmailOverrides"] = {};
    for (const id of activeIds) {
      try { clientEmailOverrides[id] = await redis.clientEmailOverride(id); }
      catch { clientEmailOverrides[id] = "unknown"; }
    }
    redisReport = {
      families,
      clientEmailOverrides,
      activeTenantsWithAnalyticsConfig: tenantsIn("analytics config"),
      activeTenantsWithGoogleConnection: tenantsIn("google connections"),
      activeTenantsWithClientEmailOverride: tenantsIn("client email overrides"),
    };
    if (families.some((f) => f.truncated)) notes.push(`A Redis family hit the ${SCAN_KEY_LIMIT}-key scan limit; its count is a floor.`);
  }

  notes.push("Out of scope: gldf's own Supabase project (paused on Sept 30), Stripe, Vercel logs, Google.");

  const stopConditions = silentRolloutEnvStops(deps.env);
  if (!activeTenantReadComplete) stopConditions.push("Active tenant inventory is incomplete; silent rollout cannot be verified.");
  if (!redisReport) stopConditions.push("Redis email overrides are unavailable; silent rollout cannot be verified.");
  for (const [id, state] of Object.entries(redisReport?.clientEmailOverrides ?? {})) {
    if (state === "on") stopConditions.push(`Active tenant ${id} has reb:client-email override on.`);
    if (state === "unknown") stopConditions.push(`Active tenant ${id} email override is unknown; silent rollout cannot be verified.`);
  }

  const report: SnapshotReport = {
    silentRollout: { safe: stopConditions.length === 0, stopConditions },
    version: 1,
    observedAt: iso(now),
    sources: { postgres: Boolean(db), redis: Boolean(redis), auth: Boolean(auth), schemaMigrations: Boolean(applied) },
    env: { secrets, flags },
    migrations: {
      repoCount: repoVersions.length,
      pendingBySept30Record,
      applied,
      unappliedInRepo: appliedSet ? deps.repoMigrations.filter((m) => !appliedSet.has(versionOf(m))).sort() : null,
      appliedNotInRepo: applied ? applied.filter((v) => !repoVersions.includes(v)).sort() : null,
      sentinels,
    },
    postgres: pg,
    auth,
    redis: redisReport,
    notes,
  };
  return report;
}

/** Human-readable lines; also passed through assertNoSensitiveOutput by the CLI. */
export function formatReport(report: SnapshotReport): string[] {
  const lines: string[] = [];
  const n = (v: number | null) => (v === null ? "unknown" : String(v));
  lines.push(`Strelva production readiness snapshot, ${report.observedAt} (read-only)`);
  lines.push(`Sources: postgres=${report.sources.postgres} redis=${report.sources.redis} auth=${report.sources.auth} schema_migrations=${report.sources.schemaMigrations}`);
  lines.push("");
  lines.push(`Silent rollout: ${report.silentRollout.safe ? "safe" : "STOP"}`);
  for (const stop of report.silentRollout.stopConditions) lines.push(`  STOP: ${stop}`);
  lines.push("");
  lines.push("Env (names only; secrets as present/absent):");
  for (const [name, state] of Object.entries(report.env.secrets)) lines.push(`  ${name}: ${state}`);
  for (const [name, state] of Object.entries(report.env.flags)) lines.push(`  ${name}: ${state}`);
  lines.push("");
  lines.push(`Migrations: ${report.migrations.repoCount} in repo; ${report.migrations.pendingBySept30Record.length} pending by the Sept 30 record.`);
  if (report.migrations.unappliedInRepo) lines.push(`  Unapplied per schema_migrations: ${report.migrations.unappliedInRepo.length ? report.migrations.unappliedInRepo.join(", ") : "none"}`);
  if (report.migrations.appliedNotInRepo?.length) lines.push(`  Applied but not in this repo: ${report.migrations.appliedNotInRepo.join(", ")}`);
  for (const [version, state] of Object.entries(report.migrations.sentinels)) lines.push(`  ${version} sentinel ${MIGRATION_SENTINELS[version]}: ${state}`);
  lines.push("");
  const pg = report.postgres;
  lines.push(`Tenants: ${n(pg.tenants.total)} total, ${n(pg.tenants.active)} active`);
  for (const t of pg.activeTenants) {
    lines.push(`  ${t.id}: features [${t.features.join(", ")}], resend_domain ${t.resendDomain ?? "none"}, search console key ${t.hasSearchConsoleKey ? "yes" : "no"}`);
  }
  lines.push(`Workspaces: ${n(pg.workspaces.total)} (${Object.entries(pg.workspaces.byKind).map(([k, v]) => `${k} ${n(v)}`).join(", ")})`);
  lines.push(`Workspace memberships: ${n(pg.workspaceMemberships)}; tenant memberships: ${n(pg.tenantMemberships)}`);
  lines.push(`Open tenant invites: ${n(pg.openTenantInvites)}; pending workspace invitations: ${n(pg.pendingWorkspaceInvitations)}`);
  lines.push(`Workspace-tenant links: ${n(pg.workspaceTenantLinks)}; tenant_leads rows: ${n(pg.tenantLeads)}; account bindings: ${n(pg.workspaceAccountBindings)}`);
  const bookingsByTenant = Object.entries(pg.bookings.legacyByActiveTenant).map(([t, c]) => `${t} ${n(c)}`).join(", ");
  lines.push(`Legacy bookings: ${n(pg.bookings.legacyTotal)}${bookingsByTenant ? ` (active: ${bookingsByTenant})` : ""}; public website booking receipts: ${n(pg.bookings.publicWebsiteReceipts)}`);
  lines.push(`Governed work proposals: ${n(pg.governedWork.proposals)}, latest ${pg.governedWork.latestProposalAt ?? "none"}`);
  lines.push(`unified_events: ${n(pg.unifiedEvents.total)} total, ${n(pg.unifiedEvents.last24h)} in 24h, ${n(pg.unifiedEvents.last7d)} in 7d, latest ${pg.unifiedEvents.latestAt ?? "none"}`);
  if (report.auth) lines.push(`Auth users: ${report.auth.total}, ${report.auth.emailConfirmed} email-confirmed, ${report.auth.signedInLast30Days} signed in within 30 days`);
  lines.push("");
  if (report.redis) {
    lines.push("Redis (SCAN/TYPE/cardinality and fixed-key email policy enums only):");
    for (const f of report.redis.families) {
      const tenants = Object.entries(f.byTenant).sort(([a], [b]) => a.localeCompare(b)).map(([t, c]) => `${t} ${c}${f.entriesByTenant?.[t] !== undefined ? `/${f.entriesByTenant[t]} entries` : ""}`);
      lines.push(`  ${f.match}: ${f.keys} keys${f.truncated ? " (truncated)" : ""}${tenants.length ? `; ${tenants.join(", ")}` : ""}`);
    }
    lines.push(`  Active tenants with analytics config: ${report.redis.activeTenantsWithAnalyticsConfig.join(", ") || "none"}`);
    lines.push(`  Active tenants with a Google connection: ${report.redis.activeTenantsWithGoogleConnection.join(", ") || "none"}`);
    lines.push(`  Active tenants with a client email override: ${report.redis.activeTenantsWithClientEmailOverride.join(", ") || "none"}`);
  }
  lines.push("");
  for (const note of report.notes) lines.push(`Note: ${note}`);
  return lines;
}
