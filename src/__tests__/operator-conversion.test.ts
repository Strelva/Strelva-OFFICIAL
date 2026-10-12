import { readFileSync } from "node:fs";
import { describe, expect, it, vi, afterEach } from "vitest";
import { conversionSelectionSchema, admitConversion, applyReviewedConversion, applyReviewedRollback, conversionReleaseEnabled, conversionProductionApproved, conversionReviewDigest, previewConversion, previewRollback, rollbackReviewDigest, type ConversionAdmission } from "@/server/tenant-conversion/review";
import type { ConversionDeps, ConversionSources, RollbackDeps } from "@/server/tenant-conversion/engine";
import type { ConversionReceipt, TenantUnlinkPreview, TenantUnlinkReceipt } from "@/platform/business-record";
const fixture = JSON.parse(readFileSync("tests/fixtures/business-record-tenant-source.json", "utf8"));
const actor = { userId: "55555555-5555-4555-8555-555555555555", email: "operator@example.test" };
const selection = conversionSelectionSchema.parse({ slug: "gldf", agencyWorkspaceId: "77777777-7777-4777-8777-777777777777", agencyStaffEmails: ["staff@agency.example.test"], agencySelectionBasis: "owner_choice", separateBusiness: false });
function admission(overrides: Partial<ConversionAdmission> = {}): ConversionAdmission {
  return { enabled: () => true, identity: async () => actor, databaseUrl: () => "http://localhost:54321", productionApproved: () => false, ...overrides };
}
function sources(): ConversionSources {
  return { tenant: { ...fixture.tenant, active: true, industry: "food", createdAt: "2026-01-01T00:00:00Z", template: "food-brand", subdomain: "gldf" }, contact: fixture.contact, settings: fixture.settings, footer: fixture.footer, services: fixture.services, bookingConfig: { timezone: "America/New_York", customised: false, overrides: 0 }, leads: fixture.leads, bookings: fixture.bookings, billing: fixture.billing, account: null };
}
function dependencies(): ConversionDeps {
  return { read: vi.fn(async () => sources()), readLink: vi.fn(async () => ({ tenantId: "gldf", tenantStableId: fixture.tenant.stableId, siteName: fixture.tenant.siteName, link: null })), convert: vi.fn(async () => ({ kind: "tenant_conversion" } as ConversionReceipt)), log: vi.fn() };
}
afterEach(() => vi.unstubAllEnvs());
describe("operator conversion review", () => {
  it("keeps both conversion and production approval gates off by default", () => {
    vi.stubEnv("STRELVA_TENANT_CONVERSION", ""); vi.stubEnv("STRELVA_TENANT_CONVERSION_PRODUCTION_APPROVED", "");
    expect(conversionReleaseEnabled()).toBe(false); expect(conversionProductionApproved()).toBe(false);
  });
  it("requires explicit agency, ordinary member emails and recorded selection basis", () => {
    for (const value of [{ ...selection, agencyWorkspaceId: "" }, { ...selection, agencyStaffEmails: [] }, { ...selection, agencySelectionBasis: undefined }, { ...selection, agencyStaffEmails: ["STAFF@agency.example.test", "staff@agency.example.test"] }]) expect(conversionSelectionSchema.safeParse(value).success).toBe(false);
  });
  it("denies disabled release and missing verified operator before reading records", async () => {
    const deps = dependencies();
    await expect(previewConversion(selection, admission({ enabled: () => false }), deps)).rejects.toThrow("not enabled");
    await expect(previewConversion(selection, admission({ identity: async () => null }), deps)).rejects.toThrow("verified super-admin");
    expect(deps.read).not.toHaveBeenCalled(); expect(deps.convert).not.toHaveBeenCalled();
  });
  it("permits a remote dry run but refuses a remote mutation without production approval", async () => {
    const deps = dependencies(); const access = admission({ databaseUrl: () => "https://remote.supabase.co" });
    const { outcome } = await previewConversion(selection, access, deps);
    expect(deps.convert).not.toHaveBeenCalled();
    await expect(applyReviewedConversion(selection, { actorId: actor.userId, digest: conversionReviewDigest(outcome) }, access, deps)).rejects.toThrow("Jacob");
    expect(deps.convert).not.toHaveBeenCalled();
  });
  it("reauthenticates mutations and rejects a different operator or a revoked session", async () => {
    const deps = dependencies(); const { outcome } = await previewConversion(selection, admission(), deps);
    const reviewed = { actorId: actor.userId, digest: conversionReviewDigest(outcome) };
    await expect(applyReviewedConversion(selection, reviewed, admission({ identity: async () => null }), deps)).rejects.toThrow("super-admin");
    await expect(applyReviewedConversion(selection, reviewed, admission({ identity: async () => ({ ...actor, userId: "different" }) }), deps)).rejects.toThrow("operator changed");
    expect(deps.convert).not.toHaveBeenCalled();
  });
  it("rejects changed source records and agency/staff selection without writing", async () => {
    const deps = dependencies(); const { outcome } = await previewConversion(selection, admission(), deps);
    const reviewed = { actorId: actor.userId, digest: conversionReviewDigest(outcome) };
    await expect(applyReviewedConversion({ ...selection, agencyStaffEmails: ["other@agency.example.test"] }, reviewed, admission(), deps)).rejects.toThrow("changed");
    deps.read = async () => ({ ...sources(), contact: { ...fixture.contact, phone: "716-555-9999" } });
    await expect(applyReviewedConversion(selection, reviewed, admission(), deps)).rejects.toThrow("changed");
    expect(deps.convert).not.toHaveBeenCalled();
  });
  it("refuses an unavailable source instead of writing an empty plan", async () => {
    const deps = dependencies(); const { outcome } = await previewConversion(selection, admission(), deps);
    deps.read = async () => { throw new Error("unavailable"); };
    await expect(applyReviewedConversion(selection, { actorId: actor.userId, digest: conversionReviewDigest(outcome) }, admission(), deps)).rejects.toThrow("unavailable");
    expect(deps.convert).not.toHaveBeenCalled();
  });
  it("writes the exact reviewed provider-seat payload once through the existing atomic RPC", async () => {
    const deps = dependencies(); const { outcome } = await previewConversion(selection, admission(), deps);
    await applyReviewedConversion(selection, { actorId: actor.userId, digest: conversionReviewDigest(outcome) }, admission(), deps);
    expect(deps.convert).toHaveBeenCalledOnce();
    expect(deps.convert).toHaveBeenCalledWith(actor.email, outcome.plan.payload, { commandId: outcome.plan.commandId, digest: outcome.plan.digest });
    expect(outcome.plan.payload.agencyWorkspaceId).toBe(selection.agencyWorkspaceId);
    expect(outcome.plan.payload.agencyStaffEmails).toEqual(selection.agencyStaffEmails);
  });
  it("rechecks operator access after the source read and before committing", async () => {
    const deps = dependencies(); const { outcome } = await previewConversion(selection, admission(), deps);
    const identity = vi.fn().mockResolvedValueOnce(actor).mockResolvedValueOnce(null);
    await expect(applyReviewedConversion(selection, { actorId: actor.userId, digest: conversionReviewDigest(outcome) }, admission({ identity }), deps)).rejects.toThrow("super-admin");
    expect(deps.convert).not.toHaveBeenCalled();
  });
  it("fails closed when a sibling link read is unavailable", async () => {
    const deps = dependencies();
    deps.read = async () => ({ ...sources(), account: { id: "account", name: "Multi-site business", tenantIds: ["gldf", "sibling"], multiSite: true } });
    deps.readLink = async (_email, slug) => {
      if (slug === "sibling") throw new Error("Sibling unavailable");
      return { tenantId: "gldf", tenantStableId: fixture.tenant.stableId, siteName: fixture.tenant.siteName, link: null };
    };
    await expect(previewConversion(selection, admission(), deps)).rejects.toThrow("Sibling unavailable");
    expect(deps.convert).not.toHaveBeenCalled();
  });
  it("requires approval for remote rollback too", async () => {
    await expect(admitConversion(admission({ databaseUrl: () => "https://remote.supabase.co" }), true)).rejects.toThrow("approval");
  });
});
const unlinkPlan = {
  linkId: "11111111-1111-4111-8111-111111111111", tenantStableId: "22222222-2222-4222-8222-222222222222", workspaceId: "44444444-4444-4444-8444-444444444444", workspaceName: "Fictional business", linkedAt: "2026-10-02T12:00:00Z", importSequence: 1,
  deleteWorkspace: false, workspaceKeptBecause: ["record_has_other_data"], entities: { removed: 3, restored: 1, kept: 2, alreadyReverted: 0 }, kept: [], leadsDetached: 2, systemsAdoptedFromTenant: 1,
};
function rollbackDeps(): RollbackDeps {
  return { preview: vi.fn(async () => ({ tenantId: "gldf", tenantStableId: unlinkPlan.tenantStableId, plan: unlinkPlan, lastUnlink: null } as TenantUnlinkPreview)), unlink: vi.fn(async () => ({ kind: "tenant_unlink" } as TenantUnlinkReceipt)), log: vi.fn() };
}
describe("reviewed conversion undo", () => {
  it("previews without writing, exposes retained records, then executes the reviewed command", async () => {
    const deps = rollbackDeps(); const { outcome } = await previewRollback("gldf", admission(), deps);
    expect(deps.unlink).not.toHaveBeenCalled(); expect(outcome.preview.plan?.entities.kept).toBe(2);
    await applyReviewedRollback("gldf", { actorId: actor.userId, digest: rollbackReviewDigest(outcome) }, admission(), deps);
    expect(deps.unlink).toHaveBeenCalledWith(actor.email, outcome.command);
  });
  it("requires a new review when changed records alter rollback eligibility", async () => {
    const deps = rollbackDeps(); const { outcome } = await previewRollback("gldf", admission(), deps);
    deps.preview = async () => ({ ...outcome.preview, plan: { ...outcome.preview.plan!, entities: { ...outcome.preview.plan!.entities, kept: 4 } } });
    await expect(applyReviewedRollback("gldf", { actorId: actor.userId, digest: rollbackReviewDigest(outcome) }, admission(), deps)).rejects.toThrow("eligibility changed");
    expect(deps.unlink).not.toHaveBeenCalled();
  });
  it("refuses an unlinked site", async () => {
    const deps = rollbackDeps(); deps.preview = async () => ({ tenantId: "gldf", tenantStableId: unlinkPlan.tenantStableId, plan: null, lastUnlink: null });
    const { outcome } = await previewRollback("gldf", admission(), deps);
    await expect(applyReviewedRollback("gldf", { actorId: actor.userId, digest: rollbackReviewDigest(outcome) }, admission(), deps)).rejects.toThrow("no conversion");
    expect(deps.unlink).not.toHaveBeenCalled();
  });
});

describe("shared legacy conversion source capture", () => {
  it("rejects a missing Redis source rather than choosing a runtime fallback", async () => {
    const { captureLegacyRedisConversionSettings } = await import("@/tenant-conversion-sources");
    await expect(captureLegacyRedisConversionSettings("gldf", null)).rejects.toThrow("not configured");
  });
  it("propagates outages and validates the captured legacy source", async () => {
    const { captureLegacyRedisConversionSettings } = await import("@/tenant-conversion-sources");
    const missing = { get: vi.fn(async () => null) };
    const defaults = await captureLegacyRedisConversionSettings("gldf", missing);
    expect(defaults.config.timezone).toBeTruthy(); expect(defaults.account).toBeNull();
    await expect(captureLegacyRedisConversionSettings("gldf", { get: vi.fn(async () => { throw new Error("Redis unavailable"); }) })).rejects.toThrow("Redis unavailable");
    await expect(captureLegacyRedisConversionSettings("gldf", { get: vi.fn().mockResolvedValueOnce({ timezone: "invalid-zone" }).mockResolvedValueOnce(null).mockResolvedValueOnce(null) })).rejects.toThrow("timezone");
  });
});
