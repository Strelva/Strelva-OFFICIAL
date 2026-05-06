import { describe, expect, it } from "vitest";
import {
  getTenantDashboardHost,
  getTenantDashboardUrl,
  getTenantPrimaryDomain,
  getTenantPublicUrl,
} from "../lib/tenant-urls";
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

  it("derives admin domains from apex custom domains when productionDomain is missing", () => {
    const config = tenant({ customDomains: ["greatlakesdriedfruit.com"] });

    expect(getTenantPrimaryDomain(config)).toBe("greatlakesdriedfruit.com");
    expect(getTenantDashboardHost(config)).toBe("admin.greatlakesdriedfruit.com");
    expect(getTenantDashboardUrl(config, "/dashboard", "production")).toBe(
      "https://admin.greatlakesdriedfruit.com/dashboard"
    );
  });

  it("uses apex custom domains for public URLs when productionDomain is missing", () => {
    expect(
      getTenantPublicUrl(tenant({ customDomains: ["greatlakesdriedfruit.com"] }), "production")
    ).toBe("https://greatlakesdriedfruit.com");
  });

  it("normalizes protocols, paths, and www prefixes for primary domains", () => {
    expect(
      getTenantPublicUrl(tenant({ productionDomain: "https://www.Example.com/dashboard" }), "production")
    ).toBe("https://example.com");
    expect(getTenantDashboardHost(tenant({ customDomains: ["https://www.Example.com/path"] }))).toBe(
      "admin.example.com"
    );
  });

  it("falls back to the platform tenant subdomain only when no real domain exists", () => {
    expect(getTenantPublicUrl(tenant(), "production")).toBe("https://gldf.scaffoldweb.com");
  });
});
