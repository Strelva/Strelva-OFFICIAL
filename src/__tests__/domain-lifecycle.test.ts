import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantConfig } from "../lib/types";

let tenants: TenantConfig[] = [];

vi.mock("../lib/redis", () => ({
  getRedis: vi.fn(() => null),
}));

vi.mock("../lib/tenants", () => ({
  getAllTenants: vi.fn(() => Promise.resolve(tenants)),
  getTenantConfig: vi.fn((tenantId: string) => Promise.resolve(tenants.find((tenant) => tenant.id === tenantId))),
  isActiveTenant: (tenant: Pick<TenantConfig, "active">) => tenant.active !== false,
  invalidateDomainMapCache: vi.fn(),
  updateTenant: vi.fn((tenantId: string, updates: Partial<TenantConfig>) => {
    const index = tenants.findIndex((tenant) => tenant.id === tenantId);
    if (index === -1) return Promise.resolve(null);
    tenants[index] = { ...tenants[index], ...updates, id: tenantId };
    return Promise.resolve(tenants[index]);
  }),
}));

function tenant(id: string, overrides: Partial<TenantConfig> = {}): TenantConfig {
  return {
    id,
    subdomain: id,
    siteName: id,
    ownerName: id,
    industry: "wellness",
    active: true,
    createdAt: "2026-01-01",
    template: "wellness",
    subscriptionStatus: "active",
    ...overrides,
  };
}

describe("domain lifecycle groundwork", () => {
  beforeEach(() => {
    delete process.env.VERCEL_API_TOKEN;
    delete process.env.VERCEL_PROJECT_ID;
    tenants = [
      tenant("alpha", {
        productionDomain: "alpha.com",
        customDomains: ["shop.alpha.com"],
      }),
      tenant("beta"),
    ];
    vi.restoreAllMocks();
  });

  it("persists a pending claim instead of deriving status from elapsed time", async () => {
    const { addCustomDomain, listTenantDomainClaims } = await import("../lib/domains");

    const result = await addCustomDomain("beta", "https://BetaExample.com/path");

    expect(result.ok).toBe(true);
    const claims = await listTenantDomainClaims("beta");
    expect(claims).toMatchObject([
      {
        domain: "betaexample.com",
        tenantId: "beta",
        role: "additional",
        status: "pending",
        dnsStatus: "unknown",
        sslStatus: "unknown",
      },
    ]);
    expect(tenants.find((item) => item.id === "beta")?.customDomains).toEqual(["betaexample.com"]);
  });

  it("rejects collisions across production, derived admin, and additional domains", async () => {
    const { addCustomDomain, findDomainCollision } = await import("../lib/domains");

    await expect(findDomainCollision("www.alpha.com", "beta")).resolves.toMatchObject({
      tenantId: "alpha",
      domain: "alpha.com",
      role: "production",
    });
    await expect(findDomainCollision("admin.alpha.com", "beta")).resolves.toMatchObject({
      tenantId: "alpha",
      domain: "admin.alpha.com",
      role: "admin",
    });

    const duplicate = await addCustomDomain("beta", "shop.alpha.com");
    expect(duplicate).toEqual({
      ok: false,
      status: 409,
      error: "Domain already claimed by tenant alpha",
    });
  });

  it("rejects reserved platform domains", async () => {
    const { addCustomDomain, isValidDomain } = await import("../lib/domains");

    expect(isValidDomain("customer.strelva.com")).toBe(false);
    expect(isValidDomain("preview.vercel.app")).toBe(false);

    await expect(addCustomDomain("beta", "customer.strelva.com")).resolves.toEqual({
      ok: false,
      status: 400,
      error: "Invalid domain format",
    });
  });

  it("maps Vercel verification details into DNS and SSL status when configured", async () => {
    process.env.VERCEL_API_TOKEN = "token";
    process.env.VERCEL_PROJECT_ID = "project_123";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          name: "beta.com",
          verified: true,
          verification: [{ type: "TXT", domain: "_vercel.beta.com", value: "abc123" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const { addCustomDomain } = await import("../lib/domains");

    const result = await addCustomDomain("beta", "beta.com", "production");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claim).toMatchObject({
        status: "verified",
        dnsStatus: "configured",
        sslStatus: "issued",
        vercelProjectId: "project_123",
        verification: ["TXT _vercel.beta.com abc123"],
      });
    }
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.vercel.com/v10/projects/project_123/domains",
      expect.objectContaining({ method: "POST" })
    );
  });
});
