import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { prepareReportAnalyticsCopyOptions, parseCopyArgs, runReportAnalyticsCopy, type CopyDeps } from "../../scripts/report-analytics-copy";

const LOCAL = { databaseUrl: "http://127.0.0.1:54321", redisUrl: "http://127.0.0.1:8079" };
const SENT = Date.parse("2026-10-01T15:00:00.000Z");
const config = { gscProperty: "sc-domain:gldf.example.test", ga4PropertyId: "123", updatedAt: "2026-09-01T00:00:00.000Z" };

function deps(overrides: Partial<CopyDeps> = {}) {
  const setCadence = vi.fn<CopyDeps["setCadence"]>(async () => ({ ok: true }));
  const markSent = vi.fn<CopyDeps["markSent"]>(async () => ({ ok: true }));
  const writeConfig = vi.fn<CopyDeps["writeConfig"]>(async () => ({ ok: true }));
  const lines: string[] = [];
  const value: CopyDeps = {
    tenants: async () => [{ id: "gldf", siteName: "Great Lakes Dried Fruit" }, { id: "rohlax", siteName: "Rohlax Wellness" }],
    redis: async (tenant) => (tenant === "gldf"
      ? { cadence: "weekly", lastSentAt: SENT, config }
      : { cadence: null, lastSentAt: null, config: null }),
    postgres: async () => ({ cadence: null, lastSentAt: null, hasConfig: false }),
    setCadence,
    markSent,
    writeConfig,
    log: (line) => lines.push(line),
    ...overrides,
  };
  return { value, setCadence, markSent, writeConfig, lines };
}

describe("report and analytics state copy", () => {
  it("dry run is the default and writes nothing", async () => {
    const options = parseCopyArgs([]);
    expect(options.apply).toBe(false);
    const d = deps();
    const outcome = await runReportAnalyticsCopy({ ...options, ...LOCAL }, d.value);
    expect(d.setCadence).not.toHaveBeenCalled();
    expect(d.markSent).not.toHaveBeenCalled();
    expect(d.writeConfig).not.toHaveBeenCalled();
    expect(outcome.totals).toMatchObject({ cadence: 1, lastSent: 1, config: 1, copied: 0 });
    expect(d.lines.join("\n")).toContain("Dry run only");
  });

  it("refuses --apply against a non-local database without Jacob's yes", async () => {
    const d = deps();
    await expect(runReportAnalyticsCopy({ ...LOCAL, apply: true, jacobsYes: false, databaseUrl: "https://abc.supabase.co" }, d.value))
      .rejects.toThrow("needs Jacob's yes");
    await expect(runReportAnalyticsCopy({ apply: true, jacobsYes: false }, d.value)).rejects.toThrow("not configured");
    expect(d.setCadence).not.toHaveBeenCalled();
  });

  it("applies locally, copying only what Postgres is missing", async () => {
    const d = deps({ postgres: async () => ({ cadence: "monthly", lastSentAt: SENT - 1000, hasConfig: true }) });
    const outcome = await runReportAnalyticsCopy({ ...LOCAL, apply: true, jacobsYes: false }, d.value);
    expect(d.setCadence).not.toHaveBeenCalled();
    expect(d.writeConfig).not.toHaveBeenCalled();
    expect(d.markSent).toHaveBeenCalledWith("gldf", "2026-10-01T15:00:00.000Z");
    expect(outcome.tenants[0]?.copied).toEqual(["lastSent"]);
  });

  it("applies everything with Jacob's yes and reports failures", async () => {
    const d = deps({ writeConfig: async () => ({ ok: false, reason: "error: boom" }) });
    const outcome = await runReportAnalyticsCopy({ ...LOCAL, apply: true, jacobsYes: true, databaseUrl: "https://abc.supabase.co" }, d.value);
    expect(d.setCadence).toHaveBeenCalledWith("gldf", "weekly");
    expect(outcome.tenants[0]?.copied).toEqual(["cadence", "lastSent"]);
    expect(outcome.tenants[0]?.failed).toEqual([{ item: "config", reason: "error: boom" }]);
    expect(outcome.totals.failed).toBe(1);
  });

  it("filters to one tenant and rejects unknown ones", async () => {
    const d = deps();
    const outcome = await runReportAnalyticsCopy({ ...LOCAL, tenant: "rohlax", apply: false, jacobsYes: false }, d.value);
    expect(outcome.tenants.map((t) => t.tenantId)).toEqual(["rohlax"]);
    await expect(runReportAnalyticsCopy({ ...LOCAL, tenant: "nobody", apply: false, jacobsYes: false }, d.value)).rejects.toThrow("No tenant");
  });

  it.each([false, true])("refuses remote Redis before any dependency in apply=%s", async (apply) => {
    const calls = { tenants: vi.fn(async () => []), redis: vi.fn(), postgres: vi.fn(), log: vi.fn() };
    const d = deps(calls);
    await expect(runReportAnalyticsCopy({ ...LOCAL, apply, jacobsYes: false, redisUrl: "https://remote.upstash.io" }, d.value))
      .rejects.toThrow(/UPSTASH_REDIS_REST_URL.*Jacob's yes/);
    for (const call of Object.values(calls)) expect(call).not.toHaveBeenCalled();
    expect(d.setCadence).not.toHaveBeenCalled();
    expect(d.markSent).not.toHaveBeenCalled();
    expect(d.writeConfig).not.toHaveBeenCalled();
  });

  it("refuses remote database dry run before reading tenants", async () => {
    const tenants = vi.fn(async () => []);
    await expect(runReportAnalyticsCopy({ ...LOCAL, apply: false, jacobsYes: false, databaseUrl: "https://abc.supabase.co" }, deps({ tenants }).value))
      .rejects.toThrow(/SUPABASE_URL.*Jacob's yes/);
    expect(tenants).not.toHaveBeenCalled();
  });

  it.each([
    "http://localhost.remote.test", "http://preview.localhost", "http://127.1", "http://2130706433",
    "http://0x7f000001", "http://%6cocalhost", "http://127.0.0.1.",
  ])("does not treat a host alias as exact loopback: %s", async (databaseUrl) => {
    const tenants = vi.fn(async () => []);
    await expect(runReportAnalyticsCopy({ ...LOCAL, databaseUrl, apply: false, jacobsYes: false }, deps({ tenants }).value))
      .rejects.toThrow(/Jacob's yes/);
    expect(tenants).not.toHaveBeenCalled();
  });

  it.each(["localhost:54321", "file:///tmp/local", "http://user:secret@localhost", "http://localhost/?token=secret", "http://localhost/#fragment", "http://localhost/path", " http://localhost", "http://localhost\n", "http://localhost\r\n", "http://localhost\t", "http://localhost\\remote.test", "http://localhost:99999"])("rejects malformed or ambiguous target even with authorization: %s", async (redisUrl) => {
    const tenants = vi.fn(async () => []);
    await expect(runReportAnalyticsCopy({ ...LOCAL, redisUrl, apply: false, jacobsYes: true }, deps({ tenants }).value))
      .rejects.toThrow(/UPSTASH_REDIS_REST_URL.*HTTP/);
    expect(tenants).not.toHaveBeenCalled();
  });

  it.each(["databaseUrl", "redisUrl"] as const)("requires %s before reading", async (missing) => {
    const tenants = vi.fn(async () => []);
    await expect(runReportAnalyticsCopy({ ...LOCAL, [missing]: undefined, apply: false, jacobsYes: false }, deps({ tenants }).value))
      .rejects.toThrow(/not configured/);
    expect(tenants).not.toHaveBeenCalled();
  });

  it.each(["http://localhost:54321", "https://127.0.0.1", "http://[::1]:54321/"])("allows explicit loopback without authorization: %s", async (databaseUrl) => {
    const d = deps();
    const result = await runReportAnalyticsCopy({ ...LOCAL, databaseUrl, apply: false, jacobsYes: false }, d.value);
    expect(result.mode).toBe("dry-run");
    expect(d.setCadence).not.toHaveBeenCalled();
  });

  it("keeps an authorized remote dry run read-only", async () => {
    const d = deps();
    const outcome = await runReportAnalyticsCopy({ apply: false, jacobsYes: true, databaseUrl: "https://abc.supabase.co", redisUrl: "https://remote.upstash.io" }, d.value);
    expect(outcome.totals.copied).toBe(0);
    expect(d.setCadence).not.toHaveBeenCalled();
    expect(d.markSent).not.toHaveBeenCalled();
    expect(d.writeConfig).not.toHaveBeenCalled();
  });

  it("preserves newer Postgres state during recovery", async () => {
    const d = deps({ postgres: async () => ({ cadence: "monthly", lastSentAt: SENT + 1000, hasConfig: true }) });
    const outcome = await runReportAnalyticsCopy({ ...LOCAL, apply: true, jacobsYes: false }, d.value);
    expect(outcome.totals).toMatchObject({ cadence: 0, lastSent: 0, config: 0, copied: 0 });
    expect(d.setCadence).not.toHaveBeenCalled();
    expect(d.markSent).not.toHaveBeenCalled();
    expect(d.writeConfig).not.toHaveBeenCalled();
  });

  it("prepares both CLI targets and refuses remote Redis dry run", () => {
    const env = { SUPABASE_URL: LOCAL.databaseUrl, UPSTASH_REDIS_REST_URL: "https://remote.upstash.io" };
    expect(() => prepareReportAnalyticsCopyOptions([], env)).toThrow(/UPSTASH_REDIS_REST_URL.*Jacob's yes/);
    expect(prepareReportAnalyticsCopyOptions(["--i-have-jacobs-yes", "--json"], env)).toMatchObject({
      databaseUrl: LOCAL.databaseUrl, redisUrl: env.UPSTASH_REDIS_REST_URL, apply: false, jacobsYes: true, json: true,
    });
  });

  it("the direct CLI refuses remote Redis before selecting data clients", () => {
    // No inherited credentials or store clients: exercise the actual argv/env
    // preparation boundary without a network-capable configured client.
    const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/copy-report-analytics-state.ts", "--json"], {
      cwd: process.cwd(), encoding: "utf8", timeout: 10_000,
      env: { PATH: process.env.PATH, NODE_ENV: "test", SUPABASE_URL: LOCAL.databaseUrl, UPSTASH_REDIS_REST_URL: "https://remote.upstash.io" },
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("UPSTASH_REDIS_REST_URL is not an exact loopback target");
    expect(result.stderr).toContain("needs Jacob's yes");
    expect(result.stdout).toBe("");
  });

  it("the direct CLI refuses a missing Supabase client without tenant-cache fallback", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/copy-report-analytics-state.ts", "--json"], {
      cwd: process.cwd(), encoding: "utf8", timeout: 10_000,
      env: { PATH: process.env.PATH, NODE_ENV: "test", SUPABASE_URL: LOCAL.databaseUrl, UPSTASH_REDIS_REST_URL: LOCAL.redisUrl },
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Supabase client unavailable; refusing tenant-cache fallback.");
    expect(result.stdout).toBe("");
  });

  it("parses flags strictly", () => {
    expect(() => parseCopyArgs(["--force"])).toThrow("Unknown flag");
    expect(() => parseCopyArgs(["--apply", "--dry-run"])).toThrow("not both");
    expect(parseCopyArgs(["gldf", "--apply", "--i-have-jacobs-yes"])).toMatchObject({ tenant: "gldf", apply: true, jacobsYes: true });
  });
});
