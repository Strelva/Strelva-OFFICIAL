import { describe, expect, it, vi } from "vitest";
import { parseCopyArgs, runReportAnalyticsCopy, type CopyDeps } from "../../scripts/report-analytics-copy";

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
    const outcome = await runReportAnalyticsCopy({ ...options, databaseUrl: "https://abc.supabase.co" }, d.value);
    expect(d.setCadence).not.toHaveBeenCalled();
    expect(d.markSent).not.toHaveBeenCalled();
    expect(d.writeConfig).not.toHaveBeenCalled();
    expect(outcome.totals).toMatchObject({ cadence: 1, lastSent: 1, config: 1, copied: 0 });
    expect(d.lines.join("\n")).toContain("Dry run only");
  });

  it("refuses --apply against a non-local database without Jacob's yes", async () => {
    const d = deps();
    await expect(runReportAnalyticsCopy({ apply: true, jacobsYes: false, databaseUrl: "https://abc.supabase.co" }, d.value))
      .rejects.toThrow("needs Jacob's yes");
    await expect(runReportAnalyticsCopy({ apply: true, jacobsYes: false }, d.value)).rejects.toThrow("no database");
    expect(d.setCadence).not.toHaveBeenCalled();
  });

  it("applies locally, copying only what Postgres is missing", async () => {
    const d = deps({ postgres: async () => ({ cadence: "monthly", lastSentAt: SENT - 1000, hasConfig: true }) });
    const outcome = await runReportAnalyticsCopy({ apply: true, jacobsYes: false, databaseUrl: "http://127.0.0.1:54321" }, d.value);
    expect(d.setCadence).not.toHaveBeenCalled();
    expect(d.writeConfig).not.toHaveBeenCalled();
    expect(d.markSent).toHaveBeenCalledWith("gldf", "2026-10-01T15:00:00.000Z");
    expect(outcome.tenants[0]?.copied).toEqual(["lastSent"]);
  });

  it("applies everything with Jacob's yes and reports failures", async () => {
    const d = deps({ writeConfig: async () => ({ ok: false, reason: "error: boom" }) });
    const outcome = await runReportAnalyticsCopy({ apply: true, jacobsYes: true, databaseUrl: "https://abc.supabase.co" }, d.value);
    expect(d.setCadence).toHaveBeenCalledWith("gldf", "weekly");
    expect(outcome.tenants[0]?.copied).toEqual(["cadence", "lastSent"]);
    expect(outcome.tenants[0]?.failed).toEqual([{ item: "config", reason: "error: boom" }]);
    expect(outcome.totals.failed).toBe(1);
  });

  it("filters to one tenant and rejects unknown ones", async () => {
    const d = deps();
    const outcome = await runReportAnalyticsCopy({ tenant: "rohlax", apply: false, jacobsYes: false }, d.value);
    expect(outcome.tenants.map((t) => t.tenantId)).toEqual(["rohlax"]);
    await expect(runReportAnalyticsCopy({ tenant: "nobody", apply: false, jacobsYes: false }, d.value)).rejects.toThrow("No tenant");
  });

  it("parses flags strictly", () => {
    expect(() => parseCopyArgs(["--force"])).toThrow("Unknown flag");
    expect(() => parseCopyArgs(["--apply", "--dry-run"])).toThrow("not both");
    expect(parseCopyArgs(["gldf", "--apply", "--i-have-jacobs-yes"])).toMatchObject({ tenant: "gldf", apply: true, jacobsYes: true });
  });
});
