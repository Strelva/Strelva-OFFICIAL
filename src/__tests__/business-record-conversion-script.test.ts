import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { isLocalDatabaseUrl, parseConversionArgs, runTenantConversion, type ConversionDeps, type ConversionSources } from "../../scripts/tenant-conversion";
import type { TenantConfig } from "@/lib/types";

const fixture = JSON.parse(readFileSync(join(process.cwd(), "tests/fixtures/business-record-tenant-source.json"), "utf8"));
const receipt = {
  kind: "tenant_conversion", version: 1, tenantId: "gldf", tenantStableId: fixture.tenant.stableId, tenantActive: true,
  workspaceId: "44444444-4444-4444-8444-444444444444", workspaceName: "Great Lakes Dried Fruit", joinedExistingWorkspace: false,
  operatorId: "55555555-5555-4555-8555-555555555555", operatorRole: "admin", billing: null, account: null, sequence: 1, revision: 1, changeCount: 14,
  counts: { facts: 9, services: 2, people: 1, contacts: 3, contactsCreated: 3, contactsMerged: 2, contactsUnchanged: 0 },
  convertedAt: "2026-10-02T12:00:00Z", replayed: false, alreadyConverted: false,
} as const;

function sources(overrides: Partial<ConversionSources> = {}): ConversionSources {
  return {
    tenant: { ...fixture.tenant, active: true, industry: "food", createdAt: "2026-01-01T00:00:00Z", template: "food-brand", subdomain: "gldf" } as TenantConfig,
    contact: fixture.contact, settings: fixture.settings, footer: fixture.footer, services: fixture.services,
    bookingConfig: { timezone: "America/New_York", customised: false, overrides: 0 },
    leads: fixture.leads, bookings: fixture.bookings, billing: fixture.billing, account: null,
    ...overrides,
  };
}

function deps(overrides: Partial<ConversionDeps> = {}) {
  const lines: string[] = [];
  const convert = vi.fn(async () => receipt);
  const base: ConversionDeps = { read: async () => sources(), readLink: null, convert, log: (line) => lines.push(line), ...overrides };
  return { deps: base, convert: base.convert as typeof convert, lines };
}

describe("tenant conversion script", () => {
  it("defaults to a dry run that prints the plan and writes nothing", async () => {
    const { deps: d, convert, lines } = deps();
    const options = parseConversionArgs(["gldf"]);
    const outcome = await runTenantConversion({ ...options, databaseUrl: "https://abcdefghijklmnopqrst.supabase.co" }, d);
    expect(options.apply).toBe(false);
    expect(outcome.mode).toBe("dry-run");
    expect(outcome.receipt).toBeNull();
    expect(convert).not.toHaveBeenCalled();
    expect(lines.join("\n")).toContain("phone: \"716-555-0199\"");
    expect(lines.join("\n")).toContain("GRANDFATHERED");
    expect(lines.at(-1)).toBe("Dry run: nothing was written.");
  });

  it("refuses --apply against a non-local database without Jacob's yes", async () => {
    const { deps: d, convert } = deps();
    const options = parseConversionArgs(["gldf", "--apply", "--operator-email=operator@strelva.example.test"]);
    await expect(runTenantConversion({ ...options, databaseUrl: "https://abcdefghijklmnopqrst.supabase.co" }, d)).rejects.toThrow(/Jacob's yes/);
    await expect(runTenantConversion({ ...options, databaseUrl: undefined }, d)).rejects.toThrow(/Jacob's yes/);
    await expect(runTenantConversion({ ...parseConversionArgs(["gldf", "--apply"]), databaseUrl: "http://127.0.0.1:54321" }, d)).rejects.toThrow(/operator-email/);
    expect(convert).not.toHaveBeenCalled();
  });

  it("applies once against a loopback database with the exact planned command", async () => {
    const { deps: d, convert } = deps();
    const options = parseConversionArgs(["gldf", "--apply", "--operator-email=operator@strelva.example.test"]);
    const outcome = await runTenantConversion({ ...options, databaseUrl: "http://127.0.0.1:54321" }, d);
    expect(convert).toHaveBeenCalledTimes(1);
    const committed = JSON.parse(readFileSync(join(process.cwd(), "tests/fixtures/business-record-tenant-import.json"), "utf8"));
    expect(convert.mock.calls[0]).toEqual(["operator@strelva.example.test", committed.payload, { commandId: committed.commandId, digest: committed.digest }]);
    expect(outcome.receipt?.workspaceId).toBe(receipt.workspaceId);
  });

  it("points a multi-site account's next site at the business its sibling already joined", async () => {
    const readLink = vi.fn(async (_email: string, tenantId: string) => ({
      tenantId, tenantStableId: fixture.tenant.stableId, siteName: tenantId,
      link: tenantId === "sister-site" ? { workspaceId: "66666666-6666-4666-8666-666666666666", linkedBy: receipt.operatorId, linkedAt: "2026-10-02T12:00:00Z", receipt: {} } : null,
    }));
    const { deps: d, lines } = deps({
      read: async () => sources({ account: { id: "acct-1", name: "Twin Trees", tenantIds: ["gldf", "sister-site"], multiSite: true } }),
      readLink,
    });
    const outcome = await runTenantConversion({ ...parseConversionArgs(["gldf", "--operator-email=operator@strelva.example.test"]), databaseUrl: "http://localhost:54321" }, d);
    expect(outcome.targetWorkspaceId).toBe("66666666-6666-4666-8666-666666666666");
    expect(outcome.plan.payload.targetWorkspaceId).toBe("66666666-6666-4666-8666-666666666666");
    expect(lines.join("\n")).toContain("MULTI-SITE");
  });

  it("recognizes only loopback hosts as local and rejects unknown flags", () => {
    expect(isLocalDatabaseUrl("http://127.0.0.1:54321")).toBe(true);
    expect(isLocalDatabaseUrl("http://localhost:54321")).toBe(true);
    expect(isLocalDatabaseUrl("http://[::1]:54321")).toBe(true);
    expect(isLocalDatabaseUrl("https://abcdefghijklmnopqrst.supabase.co")).toBe(false);
    expect(isLocalDatabaseUrl("http://127.0.0.1.attacker.example")).toBe(false);
    expect(isLocalDatabaseUrl(undefined)).toBe(false);
    expect(() => parseConversionArgs(["gldf", "--yes"])).toThrow(/Unknown flag/);
    expect(() => parseConversionArgs(["gldf", "--apply", "--dry-run"])).toThrow();
  });
});
