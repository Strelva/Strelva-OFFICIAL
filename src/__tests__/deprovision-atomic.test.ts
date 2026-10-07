import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Audit finding 1 (2026-10-05): deprovision deleted each tenant table in its
 * own request, then failed on the tenant row when a workspace website still
 * published to or reserved it, leaving the tenant partially erased.
 */
const db = vi.hoisted(() => ({
  deletes: [] as string[],
  rpcs: [] as Array<{ name: string; args: Record<string, unknown> }>,
  counts: {} as Record<string, number>,
  blockers: { publications: 0, reservations: 0 },
  teardownError: null as null | { message: string },
  pauseError: null as null | { message: string },
}));
const redis = vi.hoisted(() => ({ del: vi.fn(async () => 1), exists: vi.fn(async () => 0), scan: vi.fn(async () => ["0", []]), get: vi.fn(async () => null), zrange: vi.fn(async () => []) }));
const vercel = vi.hoisted(() => ({ deleteVercelProject: vi.fn(async () => ({ ok: true })), isVercelConfigured: vi.fn(() => true) }));

vi.mock("@/platform/infra/db/client", () => ({
  getSupabase: () => ({
    from: (table: string) => ({
      select: () => ({ eq: async () => ({ count: db.counts[table] ?? 0, error: null }) }),
      delete: () => ({ eq: async () => { db.deletes.push(table); return { error: null }; } }),
    }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      db.rpcs.push({ name, args });
      if (name === "tenant_teardown_blockers") return { data: [db.blockers], error: null };
      if (name === "assert_tenant_inquiry_export") return db.teardownError ? { data: null, error: db.teardownError } : { data: null, error: null };
      if (name === "deprovision_tenant_rows" || name === "deprovision_tenant_rows_after_inquiry_export" || name === "deprovision_tenant_rows_retained" || name === "deprovision_tenant_rows_retained_after_inquiry_export") return db.teardownError ? { data: null, error: db.teardownError } : { data: { memberships: 1, tenants: 1 }, error: null };
      if (name === "pause_tenant_systems") return db.pauseError ? { data: null, error: db.pauseError } : { data: 2, error: null };
      return { data: null, error: { message: `unexpected rpc ${name}` } };
    },
  }),
}));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => redis }));
vi.mock("@/lib/domains", () => ({ clearTenantDomainClaims: vi.fn(async () => []) }));
vi.mock("@/lib/vercel", () => vercel);

import { runDeprovision, TENANT_SCOPED_TABLES } from "@/lib/deprovision";

beforeEach(() => {
  vi.stubEnv("STRELVA_TENANT_RECEIPT_RETENTION", "0");
  db.deletes.length = 0; db.rpcs.length = 0; db.counts = { memberships: 1, tenants: 1 };
  db.blockers = { publications: 0, reservations: 0 }; db.teardownError = null; db.pauseError = null;
  redis.del.mockClear(); vercel.deleteVercelProject.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

afterEach(() => vi.unstubAllEnvs());
describe("atomic hosted-tenant deprovision", () => {
  it("Postgres authority refuses a missing export before pausing Systems or purging anything", async () => {
    vi.stubEnv("DUAL_WRITE_PG", "1"); vi.stubEnv("STRELVA_LEADS_AUTHORITY", "postgres");
    db.teardownError = { message: "inquiry_export_required_before_teardown" };
    await expect(runDeprovision({ tenantId: "fictional-free", tenant: null, dryRun: false })).rejects.toThrow("inquiry_export_required_before_teardown");
    expect(db.rpcs.map(row => row.name)).not.toContain("pause_tenant_systems");
    expect(redis.del).not.toHaveBeenCalled(); expect(vercel.deleteVercelProject).not.toHaveBeenCalled();
  });
  it("authority uses the atomic export-checked wrapper; flags off retain the original RPC", async () => {
    vi.stubEnv("DUAL_WRITE_PG", "1"); vi.stubEnv("STRELVA_LEADS_AUTHORITY", "postgres");
    await runDeprovision({ tenantId: "fictional-free", tenant: null, dryRun: false });
    expect(db.rpcs.map(row => row.name)).toContain("deprovision_tenant_rows_after_inquiry_export");
    expect(db.rpcs.map(row => row.name)).not.toContain("deprovision_tenant_rows");
  });
  it("authority plus retention uses the one combined export-checked, receipt-retaining wrapper", async () => {
    vi.stubEnv("DUAL_WRITE_PG", "1"); vi.stubEnv("STRELVA_LEADS_AUTHORITY", "postgres"); vi.stubEnv("STRELVA_TENANT_RECEIPT_RETENTION", "1");
    await runDeprovision({ tenantId: "fictional-free", tenant: null, dryRun: false });
    expect(db.rpcs.filter(call => call.name.startsWith("deprovision_"))).toEqual([{ name: "deprovision_tenant_rows_retained_after_inquiry_export", args: { p_tenant_id: "fictional-free" } }]);
  });
  it("retention off uses the exact legacy teardown and does not add receipt summaries", async () => {
    const result = await runDeprovision({ tenantId: "fictional-free", tenant: null, dryRun: false });
    expect(db.rpcs.filter(call => call.name.startsWith("deprovision_"))).toEqual([{ name: "deprovision_tenant_rows", args: { p_tenant_id: "fictional-free" } }]);
    expect(result.summary.postgres!.some(row => row.target === "report_snapshots")).toBe(false);
  });

  it("retention on reports kept rows and calls only the atomic retention adapter", async () => {
    vi.stubEnv("STRELVA_TENANT_RECEIPT_RETENTION", "1");
    db.counts.report_snapshots = 4;
    const result = await runDeprovision({ tenantId: "fictional-free", tenant: null, dryRun: false });
    expect(db.rpcs.filter(call => call.name.startsWith("deprovision_"))).toEqual([{ name: "deprovision_tenant_rows_retained", args: { p_tenant_id: "fictional-free" } }]);
    expect(result.summary.postgres).toEqual(expect.arrayContaining([expect.objectContaining({ target: "report_snapshots", found: 4, deleted: false })]));
    db.rpcs.length = 0;
    await runDeprovision({ tenantId: "fictional-free", tenant: null, dryRun: true });
    expect(db.rpcs.some(call => call.name.startsWith("deprovision_"))).toBe(false);
  });

  it("failed retention teardown leaves Redis and Vercel untouched", async () => {
    vi.stubEnv("STRELVA_TENANT_RECEIPT_RETENTION", "1");
    db.teardownError = { message: "retention receipt insert failed" };
    await expect(runDeprovision({ tenantId: "fictional-free", tenant: null, dryRun: false })).rejects.toThrow("retention receipt insert failed");
    expect(redis.del).not.toHaveBeenCalled();
    expect(vercel.deleteVercelProject).not.toHaveBeenCalled();
  });
  it("refuses a tenant a workspace website still holds before deleting anything", async () => {
    db.blockers = { publications: 1, reservations: 1 };
    const result = await runDeprovision({ tenantId: "fictional-hosted", tenant: null, dryRun: false });
    expect(result).toMatchObject({ ok: false, refusalReason: "workspace_website", executed: false });
    expect(db.deletes).toEqual([]);
    expect(db.rpcs.map((call) => call.name)).not.toContain("deprovision_tenant_rows");
    expect(redis.del).not.toHaveBeenCalled();
    expect(vercel.deleteVercelProject).not.toHaveBeenCalled();
  });

  it("reports the same refusal on a dry run", async () => {
    db.blockers = { publications: 0, reservations: 1 };
    const result = await runDeprovision({ tenantId: "fictional-hosted", tenant: null, dryRun: true });
    expect(result).toMatchObject({ ok: false, refusalReason: "workspace_website" });
  });

  it("purges Postgres in one atomic call instead of table-by-table deletes", async () => {
    const result = await runDeprovision({ tenantId: "fictional-free", tenant: null, dryRun: false });
    expect(result.ok).toBe(true);
    expect(db.deletes).toEqual([]);
    expect(db.rpcs.filter((call) => call.name === "deprovision_tenant_rows")).toEqual([{ name: "deprovision_tenant_rows", args: { p_tenant_id: "fictional-free" } }]);
    expect(result.summary.postgres).toEqual(expect.arrayContaining([expect.objectContaining({ target: "memberships", deleted: true }), expect.objectContaining({ target: "tenants", deleted: true })]));
  });

  it("pauses the converted business's stored Systems before the purge, and never deletes them", async () => {
    const result = await runDeprovision({ tenantId: "fictional-converted", tenant: null, dryRun: false });
    const names = db.rpcs.map((call) => call.name);
    expect(names.indexOf("pause_tenant_systems")).toBeGreaterThan(-1);
    expect(names.indexOf("pause_tenant_systems")).toBeLessThan(names.indexOf("deprovision_tenant_rows"));
    expect(result.summary.postgres).toEqual(expect.arrayContaining([{ target: "systems", found: 2, deleted: false, detail: "stored Systems paused; records kept" }]));
  });

  it("reports a failed pause without blocking the deprovision, and only says it would on a dry run", async () => {
    db.pauseError = { message: "function pause_tenant_systems does not exist" };
    const result = await runDeprovision({ tenantId: "fictional-converted", tenant: null, dryRun: false });
    expect(result.ok).toBe(true);
    expect(result.summary.postgres).toEqual(expect.arrayContaining([expect.objectContaining({ target: "systems", found: "?", detail: expect.stringMatching(/not paused/) })]));
    db.rpcs.length = 0;
    const dry = await runDeprovision({ tenantId: "fictional-converted", tenant: null, dryRun: true });
    expect(db.rpcs.map((call) => call.name)).not.toContain("pause_tenant_systems");
    expect(dry.summary.postgres).toEqual(expect.arrayContaining([expect.objectContaining({ target: "systems", detail: expect.stringMatching(/dry run/) })]));
  });

  it("stops before Redis and Vercel when the atomic purge fails", async () => {
    db.teardownError = { message: "tenant_teardown_blocked_by_workspace_website" };
    await expect(runDeprovision({ tenantId: "fictional-race", tenant: null, dryRun: false })).rejects.toThrow(/tenant_teardown_blocked_by_workspace_website/);
    expect(db.deletes).toEqual([]);
    expect(redis.del).not.toHaveBeenCalled();
    expect(vercel.deleteVercelProject).not.toHaveBeenCalled();
  });

  it("keeps the SQL teardown list identical to TENANT_SCOPED_TABLES", () => {
    const migration = readFileSync(join(process.cwd(), "supabase/migrations/20261007100000_atomic_tenant_teardown.sql"), "utf8");
    const list = migration.slice(migration.indexOf("select array["), migration.indexOf("]::text[]"));
    const sqlTables = [...list.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
    expect(sqlTables).toEqual([...TENANT_SCOPED_TABLES]);
  });
});
