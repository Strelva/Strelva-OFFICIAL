import { describe, expect, it, vi } from "vitest";
import type { PayLinkConfig } from "@/platform/infra/pay-links";
import { parseBackfillArgs, planBackfill, runBackfill, type BackfillDeps } from "../../scripts/pay-links-backfill-plan";

const agency = "11111111-1111-4111-8111-111111111111";
const base: PayLinkConfig = { slug: "old-link", clientName: "Old Client", door: "build", amountCents: 50000, leadSlug: "old-link", createdAt: "2026-07-01T00:00:00.000Z" };
const owned: PayLinkConfig = { ...base, slug: "owned", agencyWorkspaceId: agency, agencyDisplayName: "North Studio" };
function deps(records: PayLinkConfig[], over: Partial<BackfillDeps> = {}): BackfillDeps & { write: ReturnType<typeof vi.fn> } {
  const write = vi.fn(async () => "inserted" as const);
  return { list: async () => records, write, stored: async () => [], log: () => undefined, ...over } as BackfillDeps & { write: ReturnType<typeof vi.fn> };
}

describe("argument parsing", () => {
  it("reads every flag", () => {
    expect(parseBackfillArgs(["--apply", "--i-have-jacobs-yes", "--json", `--legacy-agency=${agency}`])).toEqual({ apply: true, jacobsYes: true, json: true, verify: false, legacyAgency: agency });
    expect(parseBackfillArgs([])).toMatchObject({ apply: false, verify: false });
  });
  it("rejects unknown flags, a bad agency id and verify with apply", () => {
    expect(() => parseBackfillArgs(["--force"])).toThrow(/Unknown option/);
    expect(() => parseBackfillArgs(["--legacy-agency=nope"])).toThrow(/uuid/);
    expect(() => parseBackfillArgs(["--apply", "--verify"])).toThrow(/cannot be combined/);
  });
});

describe("planning", () => {
  it("hashes the same record the same way whatever its key order", () => {
    const reordered = Object.fromEntries(Object.entries(base).reverse()) as unknown as PayLinkConfig;
    expect(planBackfill([base]).rows[0]!.sourceHash).toBe(planBackfill([reordered]).rows[0]!.sourceHash);
  });
  it("reports and skips invalid records and counts ownerless ones", () => {
    const plan = planBackfill([base, owned, { ...base, slug: "rohlax" }, { ...base, slug: "no-door", door: undefined } as unknown as PayLinkConfig, { ...base, slug: "both", minCents: 5000, maxCents: 10000 }, { ...base, slug: "none", amountCents: undefined }]);
    expect(plan.total).toBe(6); expect(plan.rows).toHaveLength(2); expect(plan.ownerless).toBe(1);
    expect(plan.invalid.map(item => item.slug)).toEqual(["rohlax", "no-door", "both", "none"]);
  });
});

describe("running", () => {
  it("writes nothing in a dry run", async () => {
    const d = deps([base]);
    const result = await runBackfill({ apply: false, jacobsYes: false, json: false, verify: false, databaseUrl: "https://prod.example.supabase.co" }, d);
    expect(d.write).not.toHaveBeenCalled(); expect(result.mode).toBe("dry run");
  });
  it("refuses --apply with no database", async () => {
    await expect(runBackfill({ apply: true, jacobsYes: true, json: false, verify: false }, deps([owned]))).rejects.toThrow(/no database/);
  });
  it("refuses a non-local --apply without Jacob's yes", async () => {
    const d = deps([owned]);
    await expect(runBackfill({ apply: true, jacobsYes: false, json: false, verify: false, databaseUrl: "https://prod.example.supabase.co" }, d)).rejects.toThrow(/Jacob's yes/);
    expect(d.write).not.toHaveBeenCalled();
  });
  it("refuses ownerless records without a named agency", async () => {
    const d = deps([base]);
    await expect(runBackfill({ apply: true, jacobsYes: false, json: false, verify: false, databaseUrl: "http://127.0.0.1:54321" }, d)).rejects.toThrow(/1 legacy links have no owning agency/);
    expect(d.write).not.toHaveBeenCalled();
  });
  it("writes to a local database and reports a rerun as unchanged", async () => {
    const write = vi.fn().mockResolvedValueOnce("inserted").mockResolvedValueOnce("unchanged");
    const d = deps([base, owned], { write });
    const first = await runBackfill({ apply: true, jacobsYes: false, json: false, verify: false, legacyAgency: agency, databaseUrl: "http://127.0.0.1:54321" }, d);
    expect(first).toMatchObject({ inserted: 1, unchanged: 1 });
    expect(write).toHaveBeenCalledWith(base, expect.stringMatching(/^[0-9a-f]{64}$/), agency);
  });
  it("verifies without writing and names what is missing or different", async () => {
    const d = deps([base, owned, { ...owned, slug: "other" }], { stored: async () => [{ ...owned, createdAt: "2026-07-01T00:00:00+00:00", clientName: "Old Client" }, { ...owned, slug: "other", clientName: "Changed" }] });
    const result = await runBackfill({ apply: false, jacobsYes: false, json: false, verify: true, legacyAgency: agency }, d);
    expect(d.write).not.toHaveBeenCalled();
    expect(result.missing).toEqual(["old-link"]); expect(result.different).toEqual(["other"]);
  });
  it("treats an ownerless record as the named agency's when verifying", async () => {
    const d = deps([base], { stored: async () => [{ ...base, agencyWorkspaceId: agency }] });
    const result = await runBackfill({ apply: false, jacobsYes: false, json: false, verify: true, legacyAgency: agency }, d);
    expect(result.missing).toEqual([]); expect(result.different).toEqual([]);
  });
});
