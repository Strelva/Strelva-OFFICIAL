import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertNoSensitiveOutput,
  countResult,
  formatReport,
  MIGRATION_SENTINELS,
  parseSnapshotArgs,
  runReadinessSnapshot,
  type DbFilter,
  type ReadOnlyDb,
  type ReadOnlyRedis,
  type SnapshotDeps,
} from "../../scripts/readiness-snapshot";

const NOW = Date.parse("2026-10-06T12:00:00.000Z");

type Row = Record<string, unknown>;

/** In-memory Postgres fake: tables that exist hold rows; others are "missing". */
function fakeDb(tables: Record<string, Row[]>) {
  const calls: string[] = [];
  const match = (row: Row, filters: DbFilter[] = []) =>
    filters.every((f) =>
      f.op === "eq" ? row[f.column] === f.value
        : f.op === "not_null" ? row[f.column] !== null && row[f.column] !== undefined
          : f.op === "is_null" ? row[f.column] === null || row[f.column] === undefined
            : String(row[f.column]) >= f.value);
  const db: ReadOnlyDb = {
    async count(table, filters) {
      calls.push(`count ${table}`);
      const rows = tables[table];
      if (!rows) return { ok: false, missing: true, reason: `relation "${table}" does not exist` };
      return { ok: true, count: rows.filter((r) => match(r, filters)).length };
    },
    async rows<T extends Row>(table: string, columns: string, options?: { filters?: DbFilter[]; orderBy?: { column: string; ascending: boolean }; limit?: number }) {
      calls.push(`rows ${table} ${columns}`);
      const rows = tables[table];
      if (!rows) return { ok: false as const, missing: true, reason: "missing" };
      let out = rows.filter((r) => match(r, options?.filters));
      if (options?.orderBy) {
        const { column, ascending } = options.orderBy;
        out = [...out].sort((a, b) => (String(a[column]) < String(b[column]) ? -1 : 1) * (ascending ? 1 : -1));
      }
      if (options?.limit) out = out.slice(0, options.limit);
      const cols = columns.split(",").map((c) => c.trim());
      return { ok: true as const, rows: out.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])) as T) };
    },
  };
  return { db, calls };
}

/** Redis fake that only implements the read interface; values are never exposed. */
function fakeRedis(keys: Record<string, { type: string; card?: number; override?: "on" | "off" | "absent" | "unknown" }>) {
  const calls: string[] = [];
  const redis: ReadOnlyRedis = {
    async clientEmailOverride(id) { calls.push(`policy ${id}`); return keys[`reb:client-email:${id}`]?.override ?? "absent"; },
    async scan(cursor, { match }) {
      calls.push(`scan ${match}`);
      const re = new RegExp(`^${match.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
      const all = Object.keys(keys).filter((k) => re.test(k)).sort();
      // Two pages, to prove the cursor loop.
      if (cursor === "0" && all.length > 1) return ["7", all.slice(0, 1)];
      return ["0", cursor === "0" ? all : all.slice(1)];
    },
    async type(key) {
      calls.push(`type ${key}`);
      return keys[key]?.type ?? "none";
    },
    async cardinality(key) {
      calls.push(`card ${key}`);
      return keys[key]?.card ?? null;
    },
  };
  return { redis, calls };
}

const tables: Record<string, Row[]> = {
  tenants: [
    { id: "gldf", active: true, features: ["rewards", "commerce"], resend_domain: "mail.strelva.com", google_search_console_key: "enc:v1:abc", owner_email: "owner@gldf.example" },
    { id: "rohlax", active: true, features: null, resend_domain: null, google_search_console_key: null, owner_email: "x@rohlax.example" },
    { id: "old-client", active: false, features: [], resend_domain: null, google_search_console_key: null },
  ],
  workspaces: [{ kind: "personal" }, { kind: "agency" }],
  workspace_memberships: [{}, {}],
  memberships: [],
  invites: [{ claimed_at: null }, { claimed_at: "2026-09-01" }],
  workspace_invitations: [{ status: "pending" }, { status: "accepted" }],
  proposals: [{ created_at: "2026-10-01T00:00:00.000Z" }],
  unified_events: [
    { created_at: "2026-10-06T06:00:00.000Z" },
    { created_at: "2026-10-02T00:00:00.000Z" },
    { created_at: "2026-08-01T00:00:00.000Z" },
  ],
  tenant_leads: [{}, {}, {}],
  bookings: [{ tenant_id: "gldf" }, { tenant_id: "gldf" }, { tenant_id: "old-client" }],
  public_website_bookings: [{}],
  // 20261005090000 applied; nothing else from the pending set.
};

const redisKeys = {
  "reb:client-email:gldf": { type: "string", override: "on" },
  "orders:gldf": { type: "zset", card: 12 },
  "order:gldf:o1": { type: "string" },
  "reb:rewards:gldf:members": { type: "set" },
  "reb:rewards:gldf:member:a": { type: "hash" },
  "leads:gldf": { type: "zset", card: 40 },
  "leads:rohlax": { type: "zset", card: 2 },
  "connections:gldf:google": { type: "string" },
  "reb:lead-mirror:pending": { type: "zset", card: 3 },
  "connections:rohlax:yelp": { type: "string" },
  "analytics:cfg:rohlax": { type: "string" },
  "analytics:cfg:old-client": { type: "string" },
  "reb:booking:config:gldf": { type: "string" },
  "reb:booking:slot:gldf:2026-10-09:14:00": { type: "string" },
  "reb:booking-store:pending": { type: "zset", card: 2 },
};

function deps(overrides: Partial<SnapshotDeps> = {}) {
  const pg = fakeDb(tables);
  const r = fakeRedis(redisKeys);
  const value: SnapshotDeps = {
    db: pg.db,
    redis: r.redis,
    authUsers: async () => ({ total: 16, emailConfirmed: 4, signedInLast30Days: 1 }),
    appliedVersions: null,
    repoMigrations: [
      "20260921220000_customer_business_entry",
      "20260928130000_business_effort_minutes",
      "20260930120000_revoke_public_execute_internal_functions",
      "20261005090000_tenant_leads",
      "20261007130000_workspace_release_flags",
    ],
    env: {
      EMAIL_SENDING_ENABLED: "true",
      STRELVA_WORKSPACE_RELEASE: "1",
      STRELVA_OWNER_ENTRY: "operators",
      STRELVA_CLIENT_RECORDS_READ: "spam_held booking_config",
      SECRETS_ENC_KEY: "c2VjcmV0LWtleS1tYXRlcmlhbC10aGF0LW11c3QtbmV2ZXItcHJpbnQ=",
    },
    now: () => NOW,
    log: () => undefined,
    ...overrides,
  };
  return { value, pgCalls: pg.calls, redisCalls: r.calls };
}

describe("production readiness snapshot", () => {
  it("refuses to run without Jacob's yes and reads nothing", async () => {
    const d = deps();
    await expect(runReadinessSnapshot({ jacobsYes: false }, d.value)).rejects.toThrow(/Jacob's yes/);
    expect(d.pgCalls).toEqual([]);
    expect(d.redisCalls).toEqual([]);
    expect(parseSnapshotArgs([])).toEqual({ jacobsYes: false, json: false });
    expect(parseSnapshotArgs(["--i-have-jacobs-yes", "--json"])).toEqual({ jacobsYes: true, json: true });
    expect(() => parseSnapshotArgs(["--apply"])).toThrow(/Unknown/);
  });

  it("answers the open production facts with counts and flags", async () => {
    const d = deps();
    const report = await runReadinessSnapshot({ jacobsYes: true }, d.value);

    expect(report.env.flags.EMAIL_SENDING_ENABLED).toBe("on");
    expect(report.env.flags.CUSTOMER_EMAIL_ENABLED).toBe("absent");
    expect(report.env.flags.STRELVA_OWNER_ENTRY).toBe("value: operators");
    expect(report.env.flags.STRELVA_CLIENT_RECORDS_READ).toBe("set (value hidden)");
    expect(report.env.flags.DUAL_WRITE_PG).toBe("absent");
    expect(report.env.secrets.SECRETS_ENC_KEY).toBe("present");
    expect(report.env.secrets.GOOGLE_CLIENT_SECRET).toBe("absent");

    expect(report.postgres.tenants).toEqual({ total: 3, active: 2 });
    expect(report.postgres.activeTenants).toEqual([
      { id: "gldf", features: ["commerce", "rewards"], resendDomain: "mail.strelva.com", hasSearchConsoleKey: true },
      { id: "rohlax", features: [], resendDomain: null, hasSearchConsoleKey: false },
    ]);
    expect(report.postgres.workspaces).toEqual({ total: 2, byKind: { personal: 1, customer: 0, agency: 1 } });
    expect(report.postgres.workspaceMemberships).toBe(2);
    expect(report.postgres.tenantMemberships).toBe(0);
    expect(report.postgres.openTenantInvites).toBe(1);
    expect(report.postgres.pendingWorkspaceInvitations).toBe(1);
    expect(report.postgres.workspaceTenantLinks).toBeNull(); // table not there yet
    expect(report.postgres.tenantLeads).toBe(3);
    expect(report.postgres.bookings).toEqual({ legacyTotal: 3, legacyByActiveTenant: { gldf: 2, rohlax: 0 }, publicWebsiteReceipts: 1 });
    expect(report.env.flags.STRELVA_BOOKING_STORE_WRITE).toBe("absent");
    expect(report.env.flags.STRELVA_MAKE_REAL_LIVE).toBe("absent");
    expect(report.postgres.unifiedEvents).toEqual({ total: 3, last24h: 1, last7d: 2, latestAt: "2026-10-06T06:00:00.000Z" });
    expect(report.postgres.governedWork).toEqual({ proposals: 1, latestProposalAt: "2026-10-01T00:00:00.000Z" });
    expect(report.auth).toEqual({ total: 16, emailConfirmed: 4, signedInLast30Days: 1 });

    const family = (name: string) => report.redis!.families.find((f) => f.name === name)!;
    expect(family("client email overrides")).toMatchObject({ keys: 1, byTenant: { gldf: 1 } });
    expect(family("orders")).toMatchObject({ keys: 1, byTenant: { gldf: 1 }, entriesByTenant: { gldf: 12 } });
    expect(family("rewards")).toMatchObject({ keys: 2, byTenant: { gldf: 2 } });
    expect(family("leads")).toMatchObject({ keys: 2, entriesByTenant: { gldf: 40, rohlax: 2 } });
    expect(family("google connections")).toMatchObject({ keys: 1, byTenant: { gldf: 1 } });
    expect(family("lead mirror pending")).toMatchObject({ keys: 1, entriesByTenant: { all: 3 } });
    expect(family("booking config")).toMatchObject({ keys: 1, byTenant: { gldf: 1 } });
    expect(family("booking slot locks")).toMatchObject({ keys: 1, byTenant: { gldf: 1 } });
    expect(family("booking store pending")).toMatchObject({ keys: 1, entriesByTenant: { all: 2 } });
    expect(report.redis!.activeTenantsWithAnalyticsConfig).toEqual(["rohlax"]); // inactive tenant left out
    expect(report.redis!.activeTenantsWithGoogleConnection).toEqual(["gldf"]);
    expect(report.redis!.activeTenantsWithClientEmailOverride).toEqual(["gldf"]);
  });

  it("works out migration state from the Sept 30 record, sentinels and schema_migrations", async () => {
    const withoutSql = await runReadinessSnapshot({ jacobsYes: true }, deps().value);
    expect(withoutSql.migrations.pendingBySept30Record).toEqual([
      "20260928130000_business_effort_minutes",
      "20261005090000_tenant_leads",
      "20261007130000_workspace_release_flags",
    ]);
    expect(withoutSql.migrations.applied).toBeNull();
    expect(withoutSql.migrations.sentinels["20261005090000"]).toBe("present");
    expect(withoutSql.migrations.sentinels["20261007130000"]).toBe("missing");
    expect(withoutSql.notes.join("\n")).toMatch(/schema_migrations not read/);

    const withSql = await runReadinessSnapshot({ jacobsYes: true }, deps({
      appliedVersions: async () => ["20260921220000", "20260930120000", "20261007130000", "20991231000000"],
    }).value);
    expect(withSql.migrations.unappliedInRepo).toEqual([
      "20260928130000_business_effort_minutes",
      "20261005090000_tenant_leads",
    ]);
    expect(withSql.migrations.appliedNotInRepo).toEqual(["20991231000000"]);
    // Sentinel says tenant_leads exists but schema_migrations does not list it, and the reverse for release flags.
    expect(withSql.notes.filter((n) => /disagree/.test(n))).toHaveLength(2);
  });

  it("degrades to unknown, not zero, when Postgres or Redis is not configured", async () => {
    const report = await runReadinessSnapshot({ jacobsYes: true }, deps({ db: null, redis: null, authUsers: null }).value);
    expect(report.postgres.tenants).toEqual({ total: null, active: null });
    expect(report.postgres.unifiedEvents.total).toBeNull();
    expect(report.redis).toBeNull();
    expect(Object.values(report.migrations.sentinels).every((s) => s === "unknown")).toBe(true);
    expect(report.notes.join("\n")).toMatch(/Postgres not configured/);
    expect(formatReport(report).join("\n")).toContain("Tenants: unknown total, unknown active");
  });

  it("never prints secrets or customer data", async () => {
    const report = await runReadinessSnapshot({ jacobsYes: true }, deps().value);
    const text = formatReport(report).join("\n") + JSON.stringify(report);
    expect(text).not.toContain("c2VjcmV0");
    expect(text).not.toContain("enc:v1");
    expect(text).not.toMatch(/@/);
    expect(() => assertNoSensitiveOutput(text)).not.toThrow();
    expect(() => assertNoSensitiveOutput("owner owner@gldf.example")).toThrow(/email/);
    expect(() => assertNoSensitiveOutput("key sk_live_abcdefghijklmnop")).toThrow(/token/);
    expect(() => assertNoSensitiveOutput("c2VjcmV0LWtleS1tYXRlcmlhbC10aGF0LW11c3QtbmV2ZXItcHJpbnQ=")).toThrow(/token/);
  });

  it("only ever reads: no column with secrets or PII is selected and only the fixed-key email policy enum is fetched", async () => {
    const d = deps();
    await runReadinessSnapshot({ jacobsYes: true }, d.value);
    for (const call of d.pgCalls.filter((c) => c.startsWith("rows "))) {
      expect(call).not.toMatch(/owner_email|owner_name|owner_phone|google_search_console_key|email/);
    }
    expect(d.redisCalls.every((c) => /^(scan|type|card|policy) /.test(c))).toBe(true);
    expect(d.redisCalls.some((c) => c.startsWith("scan "))).toBe(true);
  });

  it("the CLI and the logic contain no write call", () => {
    for (const file of ["scripts/readiness-snapshot.ts", "scripts/production-readiness-snapshot.ts"]) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source, file).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/);
      expect(source, file).not.toMatch(/redis\.(set|del|hset|zadd|expire|rename|unlink|incr|lpush|rpush|sadd|eval)\(/i);
    }
  });

  it("stops silent rollout for active tenant overrides and either email gate", async () => {
    const d = deps();
    const report = await runReadinessSnapshot({ jacobsYes: true }, d.value);
    expect(report.silentRollout.safe).toBe(false);
    expect(report.silentRollout.stopConditions.join(" ")).toContain("EMAIL_SENDING_ENABLED");
    expect(report.silentRollout.stopConditions.join(" ")).toContain("Active tenant gldf");
    expect(formatReport(report).join("\n")).toContain("Silent rollout: STOP");
    expect(d.redisCalls.filter((c) => c.startsWith("policy "))).toEqual(["policy gldf", "policy rohlax"]);
    const customer = await runReadinessSnapshot({ jacobsYes: true }, deps({ env: { CUSTOMER_EMAIL_ENABLED: "true" } }).value);
    expect(customer.silentRollout.stopConditions.join(" ")).toContain("CUSTOMER_EMAIL_ENABLED");
  });

  it("allows off overrides, ignores inactive tenants, and fails closed on unknown policy reads", async () => {
    const r = fakeRedis({
      "reb:client-email:gldf": { type: "string", override: "off" },
      "reb:client-email:old-client": { type: "string", override: "on" },
    });
    const options = deps({ env: {}, redis: r.redis }).value;
    const safe = await runReadinessSnapshot({ jacobsYes: true }, options);
    expect(safe.silentRollout).toEqual({ safe: true, stopConditions: [] });
    expect(safe.redis?.clientEmailOverrides).toEqual({ gldf: "off", rohlax: "absent" });
    r.redis.clientEmailOverride = async () => { throw new Error("secret response must not print"); };
    const failed = await runReadinessSnapshot({ jacobsYes: true }, options);
    expect(failed.silentRollout.safe).toBe(false);
    expect(JSON.stringify(failed)).not.toContain("secret response");
    expect(failed.silentRollout.stopConditions.join(" ")).toContain("unknown");
    const missing = await runReadinessSnapshot({ jacobsYes: true }, deps({ env: {}, db: null, redis: null }).value);
    expect(missing.silentRollout.safe).toBe(false);
  });

  it("does not infer safety from an empty or incomplete active tenant listing", async () => {
    const db = fakeDb(tables).db;
    db.rows = async () => ({ ok: true, rows: [] });
    const report = await runReadinessSnapshot({ jacobsYes: true }, deps({ env: {}, db }).value);
    expect(report.silentRollout.stopConditions.join(" ")).toContain("inventory is incomplete");
  });

  it("has a sentinel table for every unapplied migration that creates a table", () => {
    const dir = join(process.cwd(), "supabase", "migrations");
    for (const [version, table] of Object.entries(MIGRATION_SENTINELS)) {
      const file = readdirSync(dir).find((f) => f.startsWith(version));
      expect(file, version).toBeTruthy();
      expect(readFileSync(join(dir, file!), "utf8"), `${version} creates ${table}`).toMatch(new RegExp(`create table (if not exists )?public\\.${table}\\b`, "i"));
    }
    // And the reverse: every migration after the Sept 30 record that creates a table has one.
    const pending = readdirSync(dir).filter((f) => /^\d{14}_.+\.sql$/.test(f) && f.slice(0, 14) > "20260921220000" && f.slice(0, 14) !== "20260930120000");
    for (const file of pending) {
      if (!/create table (if not exists )?public\./i.test(readFileSync(join(dir, file), "utf8"))) continue;
      expect(MIGRATION_SENTINELS[file.slice(0, 14)], `${file} needs a sentinel`).toBeTruthy();
    }
  });
});


describe("countResult", () => {
  it("never reads a head-only 404 as a present table", () => {
    expect(countResult({ count: null, error: null, status: 404 })).toEqual({ ok: false, missing: true, reason: "404: table not found" });
  });

  it("treats a missing count as unknown, not as zero rows", () => {
    expect(countResult({ count: null, error: null, status: 200 })).toMatchObject({ ok: false, missing: false });
  });

  it("reads a head-only 404 with an empty error as missing", () => {
    expect(countResult({ count: null, error: { message: "" }, status: 404 })).toMatchObject({ ok: false, missing: true });
  });

  it("reads PostgREST's missing-table error as missing", () => {
    expect(countResult({ count: null, error: { code: "PGRST205", message: "Could not find the table" }, status: 404 })).toMatchObject({ ok: false, missing: true });
  });

  it("returns a real count, including zero", () => {
    expect(countResult({ count: 0, error: null, status: 200 })).toEqual({ ok: true, count: 0 });
    expect(countResult({ count: 12, error: null, status: 206 })).toEqual({ ok: true, count: 12 });
  });
});
