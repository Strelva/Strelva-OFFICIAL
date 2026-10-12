import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  release: vi.fn(),
  access: vi.fn(),
  config: vi.fn(),
  ownerEntry: vi.fn(), actor: vi.fn(), systems: vi.fn(), systemsRelease: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
  redirect: (href: string) => { throw new Error(`REDIRECT:${href}`); },
}));
vi.mock("@/platform/infra/auth", () => ({ requireTenantAccess: mocks.access }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: mocks.config }));
vi.mock("@/products/inquiries/server", () => ({ inquiryReleaseEnabled: mocks.release, inquiryReleaseMayBeOn: (...args: unknown[]) => mocks.release(...args), inquiryReleasedForCurrentUser: async (...args: unknown[]) => mocks.release(...args), inquiryReleaseEnabledForTenant: async (...args: unknown[]) => mocks.release(...args) }));
vi.mock("@/experience/inquiries/InquiryServerExperience", () => ({ InquiryServerExperience: () => null }));
vi.mock("@/platform/owner-entry/server", () => ({ ownerEntryForTenant: mocks.ownerEntry }));
vi.mock("@/platform/workspaces/http", () => ({ workspaceHttpActor: mocks.actor }));
vi.mock("@/platform/systems", () => ({ createSupabaseSystemStore: () => ({}), listBusinessSystems: mocks.systems }));
vi.mock("@/platform/systems-release", () => ({ systemsReleasedFor: mocks.systemsRelease }));

import BusinessPage from "@/app/business/[tenant]/page";

const page = (tenant = "example") => BusinessPage({ params: Promise.resolve({ tenant }) });

describe("private inquiry business entry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.release.mockReturnValue(true);
    mocks.access.mockResolvedValue(null);
    mocks.config.mockResolvedValue({ id: "example", active: true, ownerEmail: "private@example.invalid" });
    mocks.ownerEntry.mockResolvedValue({ kind: "dashboard", reason: "entry_off" });
    mocks.actor.mockResolvedValue({ userId: "owner", verifiedEmail: "owner@example.test" });
    mocks.systemsRelease.mockResolvedValue(true); mocks.systems.mockResolvedValue({ systems: [] });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("keeps the route closed until release is explicitly enabled", async () => {
    mocks.release.mockReturnValue(false);
    await expect(page()).rejects.toThrow("NOT_FOUND");
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.config).not.toHaveBeenCalled();
  });

  it("preserves the selected business through sign in without reading its data", async () => {
    mocks.access.mockResolvedValue({ status: 401 });
    await expect(page()).rejects.toThrow("REDIRECT:/sign-in?next=%2Fbusiness%2Fexample");
    expect(mocks.config).not.toHaveBeenCalled();
  });

  it("does not reveal a foreign business or read its configuration", async () => {
    mocks.access.mockResolvedValue({ status: 403 });
    await expect(page()).rejects.toThrow("NOT_FOUND");
    expect(mocks.config).not.toHaveBeenCalled();
  });

  it("rejects inactive businesses", async () => {
    mocks.config.mockResolvedValue({ active: false });
    await expect(page()).rejects.toThrow("NOT_FOUND");
  });

  it("passes only the authorized routing identity to the client", async () => {
    const element = await page();
    expect(mocks.access).toHaveBeenCalledWith("example");
    expect(element.props).toEqual({ tenantId: "example" });
  });

  it("current customers follow the trusted linked workspace and matching inquiry System, never a different site's System", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1"); vi.stubEnv("STRELVA_OWNER_ENTRY", "1"); vi.stubEnv("STRELVA_INQUIRY_RECORDS", "1"); vi.stubEnv("DUAL_WRITE_PG", "1");
    mocks.ownerEntry.mockResolvedValue({ kind: "workspace", workspaceId: "current-workspace", tenantStableId: "current-tenant", operator: false, tester: false });
    mocks.systems.mockResolvedValue({ systems: [{ system: { id: "private-system", kind: "inquiry" }, references: { tenantStableId: "other" } }, { system: { id: "current-system", kind: "inquiry" }, references: { tenantStableId: "current-tenant" } }] });
    await expect(page()).rejects.toThrow("REDIRECT:/workspace?workspaceId=current-workspace&view=system&system=current-system");
    expect(mocks.ownerEntry).toHaveBeenCalledWith("example");
    expect(mocks.systems).toHaveBeenCalledWith({ userId: "owner", verifiedEmail: "owner@example.test" }, "current-workspace", { store: {} });
    mocks.systems.mockRejectedValue(new Error("catalog unavailable"));
    await expect(page()).rejects.toThrow("REDIRECT:/workspace?workspaceId=current-workspace");
  });

  it("operators keep the internal builder; flag-off makes no owner entry or catalog read; revoked tenant authority stops before either", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1"); vi.stubEnv("STRELVA_OWNER_ENTRY", "1"); vi.stubEnv("STRELVA_INQUIRY_RECORDS", "1"); vi.stubEnv("DUAL_WRITE_PG", "1");
    mocks.ownerEntry.mockResolvedValue({ kind: "workspace", workspaceId: "current-workspace", tenantStableId: "current-tenant", operator: true, tester: false });
    expect((await page()).props).toEqual({ tenantId: "example" }); expect(mocks.systems).not.toHaveBeenCalled();
    vi.stubEnv("STRELVA_INQUIRY_RECORDS", "0"); mocks.ownerEntry.mockClear();
    expect((await page()).props).toEqual({ tenantId: "example" }); expect(mocks.ownerEntry).not.toHaveBeenCalled();
    vi.stubEnv("STRELVA_INQUIRY_RECORDS", "1"); mocks.access.mockResolvedValue({ status: 403 });
    await expect(page()).rejects.toThrow("NOT_FOUND"); expect(mocks.ownerEntry).not.toHaveBeenCalled();
  });
});
