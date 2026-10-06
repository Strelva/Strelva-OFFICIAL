import { describe, expect, it, vi } from "vitest";
import { isLocalDatabaseUrl, parseBackfillArgs, runLeadBackfill, type BackfillDeps } from "../../scripts/tenant-lead-backfill";
import type { LeadRecord } from "@/lib/leads";

const NOW = Date.parse("2026-10-05T12:00:00.000Z");
const lead = (id: string, daysAgo: number): LeadRecord => ({
  id,
  name: `Person ${id}`,
  message: "Hello",
  createdAt: new Date(NOW - daysAgo * 86_400_000).toISOString(),
});

function deps(overrides: Partial<BackfillDeps> = {}) {
  const write = vi.fn<BackfillDeps["write"]>(async () => ({ status: "recorded", id: "row", workspaceId: null }));
  const clearPending = vi.fn<BackfillDeps["clearPending"]>(async () => undefined);
  const lines: string[] = [];
  const value: BackfillDeps = {
    tenants: async () => [{ id: "gldf", siteName: "Great Lakes Dried Fruit" }, { id: "mclears-cottage", siteName: "McClear's Cottage" }],
    leads: async (tenant) => (tenant === "gldf" ? [lead("lead_new", 1), lead("lead_old", 80)] : [lead("lead_m", 3)]),
    existing: async (tenant) => new Set(tenant === "gldf" ? ["lead_new"] : []),
    write,
    clearPending,
    log: (line) => lines.push(line),
    now: () => NOW,
    ...overrides,
  };
  return { value, write, clearPending, lines };
}

describe("client lead backfill", () => {
  it("dry run is the default and writes nothing", async () => {
    const options = parseBackfillArgs([]);
    expect(options.apply).toBe(false);
    const d = deps();
    const outcome = await runLeadBackfill({ ...options, databaseUrl: "https://abc.supabase.co" }, d.value);
    expect(d.write).not.toHaveBeenCalled();
    expect(d.clearPending).not.toHaveBeenCalled();
    expect(outcome.totals).toMatchObject({ inRedis: 3, toCopy: 2 });
    expect(outcome.tenants[0]).toMatchObject({ tenantId: "gldf", alreadyInPostgres: 1, toCopy: 1, expiringIn14Days: 1 });
    expect(d.lines.join("\n")).toContain("Dry run only");
  });

  it("--apply refuses a non-local database without Jacob's yes, and with no database at all", async () => {
    const d = deps();
    await expect(runLeadBackfill({ apply: true, jacobsYes: false, databaseUrl: "https://abc.supabase.co" }, d.value)).rejects.toThrow(/Jacob's yes/);
    await expect(runLeadBackfill({ apply: true, jacobsYes: false }, d.value)).rejects.toThrow(/no database/);
    expect(d.write).not.toHaveBeenCalled();
  });

  it("--apply on a local database copies only missing leads, oldest first, and clears them from pending", async () => {
    const d = deps();
    d.write.mockImplementation(async (_tenant, l) =>
      l.id === "lead_m" ? { status: "failed", reason: "unknown_tenant" } : { status: "recorded", id: "row", workspaceId: null });
    const outcome = await runLeadBackfill({ apply: true, jacobsYes: false, databaseUrl: "http://127.0.0.1:54321" }, d.value);
    expect(d.write.mock.calls.map(([tenant, l]) => [tenant, l.id])).toEqual([["gldf", "lead_old"], ["mclears-cottage", "lead_m"]]);
    expect(d.clearPending).toHaveBeenCalledWith("gldf", "lead_old");
    expect(d.clearPending).not.toHaveBeenCalledWith("mclears-cottage", "lead_m");
    expect(outcome.totals).toMatchObject({ recorded: 1, failed: 1 });
    expect(outcome.tenants[1]!.failed).toEqual([{ leadId: "lead_m", reason: "unknown_tenant" }]);
  });

  it("is safe to rerun: leads Postgres already has are not written again", async () => {
    const d = deps({ existing: async () => new Set(["lead_new", "lead_old", "lead_m"]) });
    const outcome = await runLeadBackfill({ apply: true, jacobsYes: false, databaseUrl: "http://localhost:54321" }, d.value);
    expect(d.write).not.toHaveBeenCalled();
    expect(outcome.totals.toCopy).toBe(0);
  });

  it("one tenant, and argument checks", async () => {
    const d = deps();
    const outcome = await runLeadBackfill({ ...parseBackfillArgs(["gldf"]), databaseUrl: undefined }, d.value);
    expect(outcome.tenants.map((t) => t.tenantId)).toEqual(["gldf"]);
    await expect(runLeadBackfill({ ...parseBackfillArgs(["nope"]) }, d.value)).rejects.toThrow(/No tenant/);
    expect(() => parseBackfillArgs(["--apply", "--dry-run"])).toThrow();
    expect(() => parseBackfillArgs(["--force"])).toThrow(/Unknown flag/);
    expect(() => parseBackfillArgs(["../etc"])).toThrow(/not a tenant slug/);
    expect(parseBackfillArgs(["--apply", "--i-have-jacobs-yes"])).toMatchObject({ apply: true, jacobsYes: true });
  });
});

describe("isLocalDatabaseUrl", () => {
  it("accepts only loopback hosts", () => {
    expect(isLocalDatabaseUrl("http://127.0.0.1:54321")).toBe(true);
    expect(isLocalDatabaseUrl("http://[::1]:54321")).toBe(true);
    expect(isLocalDatabaseUrl("http://db.localhost:54321")).toBe(true);
    expect(isLocalDatabaseUrl("https://abc.supabase.co")).toBe(false);
    expect(isLocalDatabaseUrl("https://localhost.example.com")).toBe(false);
    expect(isLocalDatabaseUrl("not a url")).toBe(false);
    expect(isLocalDatabaseUrl(undefined)).toBe(false);
  });
});
