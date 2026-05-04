import { describe, expect, it } from "vitest";
import { getTenantDashboardUrl, getTenantPublicUrl } from "../lib/tenant-urls";
import type { TenantConfig } from "../lib/types";

function tenant(overrides: Partial<TenantConfig> = {}): TenantConfig {
  return {
    id: "gldf",
    subdomain: "gldf",
    siteName: "Great Lakes Dried Fruit",
    ownerName: "Great Lakes Dried Fruit",
    industry: "food-brand",
    active: true,
    createdAt: "2026-01-01",
    template: "food-brand",
    subscriptionStatus: "active",
    ...overrides,
  };
}

describe("tenant URL helpers", () => {
  it("uses tenant localhost hosts in development so dashboard context persists", () => {
    expect(getTenantDashboardUrl(tenant(), "/dashboard/site", "development")).toBe(
      "http://gldf.localhost:3000/dashboard/site"
    );
  });

  it("uses explicit admin domains first in production", () => {
    expect(
      getTenantDashboardUrl(tenant({ adminDomain: "admin.example.com" }), "/dashboard", "production")
    ).toBe("https://admin.example.com/dashboard");
  });

  it("derives admin domains from production domains in production", () => {
    expect(
      getTenantDashboardUrl(tenant({ productionDomain: "example.com" }), "/dashboard", "production")
    ).toBe("https://admin.example.com/dashboard");
  });

  it("falls back to the platform tenant subdomain for public URLs", () => {
    expect(getTenantPublicUrl(tenant(), "production")).toBe("https://gldf.scaffoldweb.com");
  });
});
