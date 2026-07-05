import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateTenant = vi.hoisted(() => vi.fn());
const mockGetTenantConfig = vi.hoisted(() => vi.fn());
const mockCreateInvite = vi.hoisted(() => vi.fn());
const mockSetContent = vi.hoisted(() => vi.fn());
const mockIsVercelConfigured = vi.hoisted(() => vi.fn());
const mockCreateVercelProject = vi.hoisted(() => vi.fn());
const mockSetVercelEnv = vi.hoisted(() => vi.fn());
const mockAddVercelDomain = vi.hoisted(() => vi.fn());
const mockSetAnalyticsConfig = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tenants", () => ({
  createTenant: mockCreateTenant,
  getTenantConfig: mockGetTenantConfig,
}));
vi.mock("@/lib/invites", () => ({ createInvite: mockCreateInvite }));
vi.mock("@/lib/storage", () => ({ setContent: mockSetContent }));
// Spy on the analytics auto-write but keep deriveScDomain real so the test
// verifies provisioning persists the ACTUAL siteUrl-derived GSC property.
vi.mock("@/lib/analytics", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/analytics")>();
  return { ...actual, setAnalyticsConfig: mockSetAnalyticsConfig };
});
vi.mock("@/lib/vercel", () => ({
  isVercelConfigured: mockIsVercelConfigured,
  createVercelProject: mockCreateVercelProject,
  setVercelEnv: mockSetVercelEnv,
  addVercelDomain: mockAddVercelDomain,
}));

import { provisionTenant } from "@/lib/provisioning";

function stepStatus(steps: { key: string; status: string }[], key: string) {
  return steps.find((s) => s.key === key)?.status;
}

const baseInput = {
  subdomain: "acme",
  siteName: "Acme HVAC",
  ownerName: "Jane Doe",
  ownerEmail: "jane@acme.com",
  industry: "trades",
  productionDomain: "acmehvac.com",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateTenant.mockResolvedValue({ id: "acme", siteName: "Acme HVAC" });
  mockGetTenantConfig.mockResolvedValue(null);
  mockCreateInvite.mockResolvedValue(true);
  mockSetContent.mockResolvedValue(undefined);
  mockSetAnalyticsConfig.mockResolvedValue({
    tenantId: "acme",
    gscProperty: "sc-domain:acmehvac.com",
    ga4PropertyId: null,
    updatedAt: new Date().toISOString(),
  });
  mockIsVercelConfigured.mockReturnValue(true);
  mockCreateVercelProject.mockResolvedValue({ ok: true, data: { id: "prj_1", name: "acme-site" } });
  mockSetVercelEnv.mockResolvedValue({ ok: true, data: { set: ["TENANT_ID"] } });
  mockAddVercelDomain.mockResolvedValue({ ok: true, data: { domain: "acmehvac.com" } });
});

describe("provisionTenant", () => {
  it("runs the full happy path with Vercel configured", async () => {
    const result = await provisionTenant(baseInput);

    expect(result.tenantId).toBe("acme");
    expect(stepStatus(result.steps, "tenant")).toBe("ok");
    expect(stepStatus(result.steps, "seed")).toBe("ok");
    expect(stepStatus(result.steps, "invite")).toBe("ok");
    expect(stepStatus(result.steps, "vercel_project")).toBe("ok");
    expect(stepStatus(result.steps, "vercel_env")).toBe("ok");
    expect(stepStatus(result.steps, "vercel_domain")).toBe("ok");

    // Generated a 64-char hex revalidation secret passed to createTenant.
    const tenantArg = mockCreateTenant.mock.calls[0][0];
    expect(tenantArg.revalidationSecret).toMatch(/^[a-f0-9]{64}$/);
    expect(tenantArg.deliveryModel).toBe("custom_repo");
    expect(tenantArg.siteUrl).toBe("https://acmehvac.com");

    // Seeded all 9 core sections.
    expect(mockSetContent).toHaveBeenCalledTimes(9);
    // Vercel project named "<id>-site".
    expect(mockCreateVercelProject).toHaveBeenCalledWith("acme-site");
    expect(mockAddVercelDomain).toHaveBeenCalledWith("prj_1", "acmehvac.com");
    expect(result.manualNext.length).toBeGreaterThan(0);

    // The client-repo env is returned (incl. the secret) for the operator to paste,
    // and points at the live control plane (scaffoldweb.com, not the marketing host).
    expect(result.clientEnv.REVALIDATION_SECRET).toMatch(/^[a-f0-9]{64}$/);
    expect(result.clientEnv.SCAFFOLD_API_URL).toBe("https://scaffoldweb.com");
    expect(result.clientEnv.TENANT_ID).toBe("acme");
  });

  it("persists the siteUrl-derived GSC analytics config so reads need no manual admin step", async () => {
    const result = await provisionTenant(baseInput);

    // GSC property derived from the production domain, GA4 left ready to fill.
    expect(mockSetAnalyticsConfig).toHaveBeenCalledWith("acme", {
      gscProperty: "sc-domain:acmehvac.com",
      ga4PropertyId: null,
    });
    expect(stepStatus(result.steps, "analytics")).toBe("ok");
  });

  it("reports the analytics step as failed without aborting when the config write throws", async () => {
    mockSetAnalyticsConfig.mockRejectedValue(new Error("redis down"));
    const result = await provisionTenant(baseInput);

    expect(stepStatus(result.steps, "analytics")).toBe("failed");
    // Provisioning still completes the later steps (fail-soft).
    expect(stepStatus(result.steps, "vercel_project")).toBe("ok");
  });

  it("skips Vercel steps when no token is configured", async () => {
    mockIsVercelConfigured.mockReturnValue(false);
    const result = await provisionTenant(baseInput);

    expect(stepStatus(result.steps, "tenant")).toBe("ok");
    expect(stepStatus(result.steps, "vercel_project")).toBe("skipped");
    expect(stepStatus(result.steps, "vercel_env")).toBe("skipped");
    expect(stepStatus(result.steps, "vercel_domain")).toBe("skipped");
    expect(mockCreateVercelProject).not.toHaveBeenCalled();
  });

  it("bails when the tenant record cannot be created (genuine failure)", async () => {
    mockCreateTenant.mockRejectedValue(new Error("Sanity write failed"));
    const result = await provisionTenant(baseInput);

    expect(result.steps).toHaveLength(1);
    expect(stepStatus(result.steps, "tenant")).toBe("failed");
    expect(result.manualNext).toEqual([]);
    expect(mockSetContent).not.toHaveBeenCalled();
    expect(mockCreateInvite).not.toHaveBeenCalled();
    expect(mockCreateVercelProject).not.toHaveBeenCalled();
  });

  it("resumes the remaining steps when the tenant already exists", async () => {
    // A prior partial run created the record but failed later. Re-running must
    // continue (not bail) so the operator can complete provisioning.
    mockCreateTenant.mockRejectedValue(new Error("Tenant \"acme\" already exists"));
    mockGetTenantConfig.mockResolvedValue({ id: "acme", siteName: "Acme HVAC" });

    const result = await provisionTenant(baseInput);

    expect(stepStatus(result.steps, "tenant")).toBe("skipped");
    expect(result.steps.length).toBeGreaterThan(1);
    // It actually proceeds to the later steps instead of bailing.
    expect(mockCreateVercelProject).toHaveBeenCalled();
  });

  it("skips the invite when there is no owner email", async () => {
    const result = await provisionTenant({ ...baseInput, ownerEmail: undefined });
    expect(stepStatus(result.steps, "invite")).toBe("skipped");
    expect(mockCreateInvite).not.toHaveBeenCalled();
  });

  it("reports a failed Vercel env step without throwing", async () => {
    mockSetVercelEnv.mockResolvedValue({ ok: false, error: "REVALIDATION_SECRET: forbidden" });
    const result = await provisionTenant(baseInput);
    expect(stepStatus(result.steps, "vercel_env")).toBe("failed");
    expect(result.steps.find((s) => s.key === "vercel_env")?.detail).toContain("forbidden");
  });

  it("uses the subdomain URL when no production domain is given", async () => {
    await provisionTenant({ ...baseInput, productionDomain: undefined });
    const tenantArg = mockCreateTenant.mock.calls[0][0];
    expect(tenantArg.siteUrl).toBe("https://acme.strelva.com");
  });
});
