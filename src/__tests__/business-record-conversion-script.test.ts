import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  isLocalDatabaseUrl, parseConversionArgs, runTenantConversion, runTenantRollback,
  type ConversionDeps, type ConversionSources, type RollbackDeps,
} from "../../scripts/tenant-conversion";
import { planTenantUnlink, type TenantUnlinkPreview, type TenantUnlinkReceipt } from "@/platform/business-record";
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

const linkedPreview: TenantUnlinkPreview = {
  tenantId: "gldf", tenantStableId: fixture.tenant.stableId,
  plan: {
    linkId: "77777777-7777-4777-8777-777777777777", tenantStableId: fixture.tenant.stableId,
    workspaceId: receipt.workspaceId, workspaceName: "Great Lakes Dried Fruit", linkedAt: "2026-10-02T12:00:00Z", importSequence: 1,
    deleteWorkspace: false, workspaceKeptBecause: ["other_members", "record_has_other_data"],
    entities: { removed: 14, restored: 0, kept: 1, alreadyReverted: 0 },
    kept: [{ entity: "fact", id: "phone", reason: "changed_after_import" }],
    leadsDetached: 3, systemsAdoptedFromTenant: 0,
  },
  lastUnlink: null,
};
const unlinkReceipt: TenantUnlinkReceipt = {
  kind: "tenant_unlink", version: 1, tenantId: "gldf", tenantStableId: fixture.tenant.stableId,
  workspaceId: receipt.workspaceId, workspaceName: "Great Lakes Dried Fruit", linkId: linkedPreview.plan!.linkId,
  linkedAt: "2026-10-02T12:00:00Z", importSequence: 1, operatorId: receipt.operatorId,
  workspaceDeleted: false, workspaceKeptBecause: ["other_members", "record_has_other_data"],
  entities: { removed: 14, restored: 0, kept: 1, alreadyReverted: 0 }, kept: linkedPreview.plan!.kept,
  leadsDetached: 3, systemsAdoptedFromTenant: 0, sequence: 3, revision: 3, conversionReceipt: { ...receipt },
  unlinkedAt: "2026-10-05T12:00:00Z", replayed: false, alreadyUnlinked: false,
};

function rollbackDeps(overrides: Partial<RollbackDeps> = {}) {
  const lines: string[] = [];
  const preview = vi.fn(async () => linkedPreview);
  const unlink = vi.fn(async () => unlinkReceipt);
  const base: RollbackDeps = { preview, unlink, log: (line) => lines.push(line), ...overrides };
  return { deps: base, preview: base.preview as typeof preview, unlink: base.unlink as typeof unlink, lines };
}

describe("tenant conversion rollback", () => {
  it("parses --rollback and defaults it to a dry run", () => {
    const options = parseConversionArgs(["gldf", "--rollback", "--operator-email=operator@strelva.example.test"]);
    expect(options).toMatchObject({ slug: "gldf", rollback: true, apply: false });
    expect(parseConversionArgs(["gldf"]).rollback).toBe(false);
  });

  it("previews without writing and prints what it would remove, keep and detach", async () => {
    const { deps: d, preview, unlink, lines } = rollbackDeps();
    const options = parseConversionArgs(["gldf", "--rollback", "--operator-email=operator@strelva.example.test"]);
    const outcome = await runTenantRollback({ ...options, databaseUrl: "https://abcdefghijklmnopqrst.supabase.co" }, d);
    expect(outcome.mode).toBe("dry-run");
    expect(outcome.receipt).toBeNull();
    expect(preview).toHaveBeenCalledWith("operator@strelva.example.test", "gldf");
    expect(unlink).not.toHaveBeenCalled();
    const text = lines.join("\n");
    expect(text).toContain("would remove 14 imported item(s)");
    expect(text).toContain("keep fact phone: changed_after_import");
    expect(text).toContain("would detach 3 lead(s)");
    expect(text).toContain("keep it (other_members, record_has_other_data)");
    expect(text).toContain("database: NOT local");
    expect(lines.at(-1)).toBe("Dry run: nothing was written.");
  });

  it("refuses --apply against a non-local database and needs an operator and a database", async () => {
    const { deps: d, preview, unlink } = rollbackDeps();
    const apply = parseConversionArgs(["gldf", "--rollback", "--apply", "--operator-email=operator@strelva.example.test"]);
    await expect(runTenantRollback({ ...apply, databaseUrl: "https://abcdefghijklmnopqrst.supabase.co" }, d)).rejects.toThrow(/Jacob's yes/);
    await expect(runTenantRollback({ ...apply, databaseUrl: undefined }, d)).rejects.toThrow(/Jacob's yes/);
    await expect(runTenantRollback({ ...parseConversionArgs(["gldf", "--rollback"]), databaseUrl: "http://127.0.0.1:54321" }, d)).rejects.toThrow(/operator-email/);
    await expect(runTenantRollback({ ...apply, databaseUrl: "http://127.0.0.1:54321" }, { ...d, preview: null })).rejects.toThrow(/needs a database/);
    expect(preview).not.toHaveBeenCalled();
    expect(unlink).not.toHaveBeenCalled();
  });

  it("applies once against a loopback database with the command bound to the previewed link", async () => {
    const { deps: d, unlink, lines } = rollbackDeps();
    const options = parseConversionArgs(["gldf", "--rollback", "--apply", "--operator-email=operator@strelva.example.test"]);
    const outcome = await runTenantRollback({ ...options, databaseUrl: "http://127.0.0.1:54321" }, d);
    const expected = planTenantUnlink({ tenantId: "gldf", tenantStableId: fixture.tenant.stableId, workspaceId: receipt.workspaceId, linkedAt: "2026-10-02T12:00:00Z" });
    expect(unlink).toHaveBeenCalledTimes(1);
    expect(unlink.mock.calls[0]).toEqual(["operator@strelva.example.test", expected]);
    expect(outcome.receipt?.workspaceDeleted).toBe(false);
    expect(lines.at(-1)).toContain("Unlinked: business 44444444-4444-4444-8444-444444444444 kept (other_members, record_has_other_data)");

    const again = await runTenantRollback({ ...options, databaseUrl: "http://127.0.0.1:54321" }, d);
    expect(unlink.mock.calls[1]).toEqual(unlink.mock.calls[0]);
    expect(again.command).toEqual(outcome.command);
  });

  it("does nothing for a tenant that is not linked", async () => {
    const { deps: d, unlink, lines } = rollbackDeps({
      preview: async () => ({ tenantId: "gldf", tenantStableId: fixture.tenant.stableId, plan: null, lastUnlink: unlinkReceipt }),
    });
    const options = parseConversionArgs(["gldf", "--rollback", "--apply", "--operator-email=operator@strelva.example.test"]);
    const outcome = await runTenantRollback({ ...options, databaseUrl: "http://localhost:54321" }, d);
    expect(outcome.receipt).toBeNull();
    expect(outcome.command).toBeNull();
    expect(unlink).not.toHaveBeenCalled();
    expect(lines.join("\n")).toContain(`last unlinked from ${receipt.workspaceId}`);
    expect(lines.at(-1)).toBe("Nothing to roll back. Nothing was written.");
  });
});
