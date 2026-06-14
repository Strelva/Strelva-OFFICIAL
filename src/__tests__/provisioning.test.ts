import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateTenant = vi.hoisted(() => vi.fn());
const mockCreateInvite = vi.hoisted(() => vi.fn());
const mockSetContent = vi.hoisted(() => vi.fn());
const mockIsVercelConfigured = vi.hoisted(() => vi.fn());
const mockCreateVercelProject = vi.hoisted(() => vi.fn());
const mockSetVercelEnv = vi.hoisted(() => vi.fn());
const mockAddVercelDomain = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tenants", () => ({ createTenant: mockCreateTenant }));
vi.mock("@/lib/invites", () => ({ createInvite: mockCreateInvite }));
vi.mock("@/lib/storage", () => ({ setContent: mockSetContent }));
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
  mockCreateInvite.mockResolvedValue(true);
  mockSetContent.mockResolvedValue(undefined);
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

  it("skips Vercel steps when no token is configured", async () => {
    mockIsVercelConfigured.mockReturnValue(false);
    const result = await provisionTenant(baseInput);

    expect(stepStatus(result.steps, "tenant")).toBe("ok");
    expect(stepStatus(result.steps, "vercel_project")).toBe("skipped");
    expect(stepStatus(result.steps, "vercel_env")).toBe("skipped");
    expect(stepStatus(result.steps, "vercel_domain")).toBe("skipped");
    expect(mockCreateVercelProject).not.toHaveBeenCalled();
  });

  it("bails when the tenant record cannot be created", async () => {
    mockCreateTenant.mockRejectedValue(new Error("Tenant \"acme\" already exists"));
    const result = await provisionTenant(baseInput);

    expect(result.steps).toHaveLength(1);
    expect(stepStatus(result.steps, "tenant")).toBe("failed");
    expect(result.manualNext).toEqual([]);
    expect(mockSetContent).not.toHaveBeenCalled();
    expect(mockCreateInvite).not.toHaveBeenCalled();
    expect(mockCreateVercelProject).not.toHaveBeenCalled();
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
