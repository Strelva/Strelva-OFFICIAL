import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The one owner-recipient rule (Reborn §1). The database rule itself is proven
// in tests/business-ownership-schema.sql; here: the fail-soft wrapper every
// notice uses, and that the report paths ask it instead of tenant.ownerEmail.

const mocks = vi.hoisted(() => ({
  tenants: vi.fn(),
  weekly: vi.fn(),
  businessRecipient: vi.fn(),
  tenantConfig: vi.fn(),
}));

import { resolveOwnerNoticeRecipient, ownerNoticeEmail, releasedOwnerNoticeEmail, setOwnerRecipientResolver } from "@/lib/owner-recipient";

const tenant = { id: "gldf", ownerEmail: "Owner@GLDF.example " };
afterEach(() => {
  setOwnerRecipientResolver(null);
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("resolveOwnerNoticeRecipient", () => {
  it.each([["", ""], ["1", ""], ["", "1"]])("keeps added notices' exact issued recipient with rollout gates %s/%s", async (workspace, reads) => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", workspace);
    vi.stubEnv("STRELVA_BUSINESS_RECORD_READS", reads);
    const resolve = vi.fn().mockResolvedValue({ email: "record@example.test", name: null, from: "record", workspaceId: "w1" });
    setOwnerRecipientResolver(resolve);
    await expect(releasedOwnerNoticeEmail(tenant)).resolves.toBe(tenant.ownerEmail);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("releases added notices through the same resolver and suppresses unavailable trust", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    vi.stubEnv("STRELVA_BUSINESS_RECORD_READS", "1");
    setOwnerRecipientResolver(async () => ({ email: "Record@Example.test ", name: null, from: "record", workspaceId: "w1" }));
    await expect(releasedOwnerNoticeEmail(tenant)).resolves.toBe("record@example.test");
    setOwnerRecipientResolver(async () => { throw new Error("resolver unavailable"); });
    await expect(releasedOwnerNoticeEmail(tenant)).resolves.toBeNull();
  });

  it("uses the business record's owner contact when the rule names one", async () => {
    setOwnerRecipientResolver(async () => ({ email: "pat@gldf.example", name: "Pat", from: "record", workspaceId: "w1", tenantId: "gldf" }));
    await expect(resolveOwnerNoticeRecipient(tenant)).resolves.toEqual({ email: "pat@gldf.example", name: "Pat", from: "record", workspaceId: "w1" });
  });

  it("an unconverted tenant gets exactly its own owner_email", async () => {
    setOwnerRecipientResolver(async () => ({ email: "owner@gldf.example", name: null, from: "tenant", workspaceId: null, tenantId: "gldf" }));
    await expect(ownerNoticeEmail(tenant)).resolves.toBe("owner@gldf.example");
  });

  it("sends nothing when the rule fails, names nobody, or is malformed: never the tenant's own owner_email", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    setOwnerRecipientResolver(async () => { throw new Error("function does not exist"); });
    await expect(resolveOwnerNoticeRecipient(tenant)).resolves.toBeNull();
    // A converted site with nothing trusted: the operator-editable owner_email is not a fallback.
    setOwnerRecipientResolver(async () => null);
    await expect(ownerNoticeEmail(tenant)).resolves.toBeNull();
    setOwnerRecipientResolver(async () => ({ email: "not-an-email", name: null, from: "record", workspaceId: "w1", tenantId: "gldf" }));
    await expect(ownerNoticeEmail(tenant)).resolves.toBeNull();
    expect(warn.mock.calls.map(([line]) => line)).toEqual([
      "[owner-recipient] owner notice not sent for gldf: resolver_error",
      "[owner-recipient] owner notice not sent for gldf: no_owner_recipient",
      "[owner-recipient] owner notice not sent for gldf: malformed_owner_recipient",
    ]);
    warn.mockRestore();
  });

  it("a slow database never holds a notice past 1.5 seconds, and sends nothing", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    setOwnerRecipientResolver(() => new Promise(() => undefined));
    const pending = ownerNoticeEmail(tenant);
    await vi.advanceTimersByTimeAsync(1500);
    await expect(pending).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith("[owner-recipient] owner notice not sent for gldf: resolver_timeout");
    warn.mockRestore();
  });

  it("with no database configured, a site has no business: its own owner_email", async () => {
    await expect(resolveOwnerNoticeRecipient(tenant)).resolves.toEqual({ email: "owner@gldf.example", name: null, from: "tenant_fallback", workspaceId: null });
  });

  it("nobody on record and no tenant address means no notice", async () => {
    setOwnerRecipientResolver(async () => null);
    await expect(ownerNoticeEmail({ id: "quiet", ownerEmail: "  " })).resolves.toBeNull();
    await expect(ownerNoticeEmail({ id: "quiet" })).resolves.toBeNull();
  });
});

describe("legacyOwnerLinkAllowed", () => {
  it("allows a tenant approve link only for a site with no business; unknown is no", async () => {
    const { legacyOwnerLinkAllowed } = await import("@/lib/owner-recipient");
    setOwnerRecipientResolver(async () => ({ email: "owner@gldf.example", name: null, from: "tenant", workspaceId: null, tenantId: "gldf" }));
    await expect(legacyOwnerLinkAllowed(tenant)).resolves.toBe(true);
    setOwnerRecipientResolver(async () => ({ email: "owner@gldf.example", name: null, from: "tenant", workspaceId: "w1", tenantId: "gldf" }));
    await expect(legacyOwnerLinkAllowed(tenant)).resolves.toBe(false);
    setOwnerRecipientResolver(async () => null);
    await expect(legacyOwnerLinkAllowed(tenant)).resolves.toBe(false);
    setOwnerRecipientResolver(async () => { throw new Error("db down"); });
    await expect(legacyOwnerLinkAllowed(tenant)).resolves.toBe(false);
  });
});

describe("weekly report recipients", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.tenants.mockReset();
  });

  it("generateAllReports resolves each recipient by the rule and skips nobody-on-record", async () => {
    vi.doMock("@/lib/tenants", () => ({ getAllTenants: mocks.tenants, getTenantConfig: vi.fn().mockResolvedValue(undefined) }));
    mocks.tenants.mockResolvedValue([
      { id: "converted", active: true, ownerEmail: "old@converted.example" },
      { id: "nobody", active: true, ownerEmail: "" },
    ]);
    const recipients = await import("@/lib/owner-recipient");
    recipients.setOwnerRecipientResolver(async (id) => id === "converted"
      ? { email: "new-owner@converted.example", name: null, from: "record", workspaceId: "w", tenantId: id }
      : null);
    const reports = await import("@/lib/reports");
    const result = await reports.generateAllReports();
    expect(result.skipped).toContainEqual({ tenantId: "nobody", reason: "missing_owner_email" });
    // "converted" got past the recipient gate; generation itself is not under test here.
    expect(result.skipped.find((s) => s.tenantId === "converted")?.reason).not.toBe("missing_owner_email");
    const generated = result.reports.find((r) => r.tenant.id === "converted");
    if (generated) expect(generated.ownerRecipient).toBe("new-owner@converted.example");
    recipients.setOwnerRecipientResolver(null);
    vi.doUnmock("@/lib/tenants");
  });
});

describe("hosted website report recipient", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.businessRecipient.mockReset();
    mocks.tenantConfig.mockReset();
  });

  async function load() {
    vi.doMock("@/platform/business-record/service", async (original) => ({ ...(await original<typeof import("@/platform/business-record/service")>()), resolveOwnerRecipient: mocks.businessRecipient, resolveTenantOwnerRecipient: vi.fn().mockRejectedValue(new Error("unused")) }));
    vi.doMock("@/lib/tenants", () => ({ getTenantConfig: mocks.tenantConfig }));
    return import("@/products/websites/site-report");
  }

  it("prefers the business record's owner contact over the reading owner's own address", async () => {
    mocks.businessRecipient.mockResolvedValue({ email: "pat@record.example", name: "Pat", from: "record", source: "owner", verified: true, tenantId: null });
    const { resolveWebsiteReportRecipient } = await load();
    await expect(resolveWebsiteReportRecipient("11111111-1111-4111-8111-111111111111", "mooney", "reader@owner.example"))
      .resolves.toEqual({ email: "pat@record.example", from: "record" });
  });

  it("falls back to the site's tenant rule, then to the verified owner", async () => {
    mocks.businessRecipient.mockResolvedValue(null);
    mocks.tenantConfig.mockResolvedValue({ id: "mooney", ownerEmail: "office@mooney.example" });
    const { resolveWebsiteReportRecipient } = await load();
    const recipients = await import("@/lib/owner-recipient");
    recipients.setOwnerRecipientResolver(async () => ({ email: "office@mooney.example", name: null, from: "tenant", workspaceId: null, tenantId: "mooney" }));
    await expect(resolveWebsiteReportRecipient("11111111-1111-4111-8111-111111111111", "mooney", "reader@owner.example"))
      .resolves.toEqual({ email: "office@mooney.example", from: "tenant" });
    // The tenant rule failing never falls back to the tenant's owner_email.
    recipients.setOwnerRecipientResolver(async () => { throw new Error("offline"); });
    await expect(resolveWebsiteReportRecipient("11111111-1111-4111-8111-111111111111", "mooney", "reader@owner.example"))
      .resolves.toEqual({ email: "reader@owner.example", from: "owner" });
    mocks.businessRecipient.mockRejectedValue(new Error("offline"));
    await expect(resolveWebsiteReportRecipient("11111111-1111-4111-8111-111111111111", null, "Reader@Owner.example"))
      .resolves.toEqual({ email: "reader@owner.example", from: "owner" });
    recipients.setOwnerRecipientResolver(null);
  });
});
