import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUserTenants: vi.fn(),
  getTenantConfig: vi.fn(),
  getTenantDashboardFallbackUrl: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUserTenants: mocks.getCurrentUserTenants }));
vi.mock("@/lib/tenants", () => ({
  getTenantConfig: mocks.getTenantConfig,
  isActiveTenant: (tenant: { active?: boolean }) => tenant.active !== false,
}));
vi.mock("@/lib/tenant-urls", () => ({ getTenantDashboardFallbackUrl: mocks.getTenantDashboardFallbackUrl }));

import { listManagedPresenceWork } from "@/products/managed-presence/server";

function tenant(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    subdomain: id,
    siteName: `${id} site`,
    ownerName: `${id} owner`,
    active: true,
    siteUrl: "https://client-supplied.example/should-not-be-used",
    ...overrides,
  };
}

describe("managed-presence workspace projection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getCurrentUserTenants.mockResolvedValue([]);
    mocks.getTenantConfig.mockResolvedValue(undefined);
    mocks.getTenantDashboardFallbackUrl.mockImplementation((config: { id: string }) => `https://app.strelva.com/client/${config.id}/dashboard`);
  });

  it("projects only active, non-demo tenants from the user's memberships", async () => {
    const configs = new Map([
      ["gldf", tenant("gldf", { siteName: "Great Lakes Dried Fruit" })],
      ["inactive", tenant("inactive", { active: false })],
      ["demo", tenant("demo", { siteName: "Public Demo" })],
    ]);
    mocks.getCurrentUserTenants.mockResolvedValue(["gldf", "gldf", "inactive", "demo", "stale"]);
    mocks.getTenantConfig.mockImplementation(async (id: string) => configs.get(id));

    const result = await listManagedPresenceWork();

    expect(result).toEqual({
      managedWork: [{
        id: "gldf",
        title: "Great Lakes Dried Fruit",
        href: "https://app.strelva.com/client/gldf/dashboard",
        productId: "managed_presence",
        relationship: "client",
      }],
      unavailable: false,
    });
    expect(mocks.getTenantConfig).toHaveBeenCalledTimes(4);
    expect(mocks.getTenantDashboardFallbackUrl).toHaveBeenCalledWith(configs.get("gldf"));
  });

  it("keeps successful managed links when one tenant read is unavailable", async () => {
    mocks.getCurrentUserTenants.mockResolvedValue(["good", "broken"]);
    mocks.getTenantConfig.mockImplementation(async (id: string) => {
      if (id === "broken") throw new Error("database details");
      return tenant(id);
    });

    const result = await listManagedPresenceWork();

    expect(result.managedWork).toHaveLength(1);
    expect(result.managedWork[0]).toMatchObject({ id: "good", productId: "managed_presence" });
    expect(result.unavailable).toBe(true);
    expect(JSON.stringify(result)).not.toContain("database details");
  });

  it("reports membership discovery failure without throwing or broadening the list", async () => {
    mocks.getCurrentUserTenants.mockRejectedValue(new Error("membership store unavailable"));

    await expect(listManagedPresenceWork()).resolves.toEqual({ managedWork: [], unavailable: true });
    expect(mocks.getTenantConfig).not.toHaveBeenCalled();
  });

  it("uses the server fallback URL authority rather than tenant URL fields", async () => {
    const config = tenant("safe-id");
    mocks.getCurrentUserTenants.mockResolvedValue(["safe-id"]);
    mocks.getTenantConfig.mockResolvedValue(config);

    const result = await listManagedPresenceWork();

    expect(result.managedWork[0]?.href).toBe("https://app.strelva.com/client/safe-id/dashboard");
    expect(result.managedWork[0]?.href).not.toContain("client-supplied");
    expect(mocks.getTenantDashboardFallbackUrl).toHaveBeenCalledWith(config);
  });

  it("does not project a config whose identity does not match the authorized tenant id", async () => {
    mocks.getCurrentUserTenants.mockResolvedValue(["authorized"]);
    mocks.getTenantConfig.mockResolvedValue(tenant("different-tenant"));

    await expect(listManagedPresenceWork()).resolves.toEqual({ managedWork: [], unavailable: true });
    expect(mocks.getTenantDashboardFallbackUrl).not.toHaveBeenCalled();
  });

  it("deduplicates tenant memberships without changing the server-owned destination", async () => {
    const config = tenant("gldf");
    mocks.getCurrentUserTenants.mockResolvedValue(["GLDF", "gldf"]);
    mocks.getTenantConfig.mockResolvedValue(config);

    const result = await listManagedPresenceWork();

    expect(result.managedWork).toHaveLength(1);
    expect(mocks.getTenantConfig).toHaveBeenCalledTimes(1);
  });
});
