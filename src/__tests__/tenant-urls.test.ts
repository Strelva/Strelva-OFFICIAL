import { describe, expect, it } from "vitest";
import {
  getTenantDashboardHost,
  getTenantDashboardFallbackUrl,
  getTenantDashboardUrl,
  getTenantPrimaryDomain,
  getTenantPublicUrl,
  getTenantPublicUrlFromDomainMap,
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

  it("builds stable scaffoldweb.com fallback dashboard URLs", () => {
    expect(getTenantDashboardFallbackUrl(tenant(), "/dashboard/site", "development")).toBe(
      "http://localhost:3000/client/gldf/dashboard/site"
    );
    expect(getTenantDashboardFallbackUrl(tenant(), "/dashboard", "production")).toBe(
      "https://scaffoldweb.com/client/gldf/dashboard"
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

  it("preserves www public domains while deriving admin hosts from the apex", () => {
    expect(
      getTenantPublicUrl(tenant({ productionDomain: "https://www.Example.com/dashboard" }), "production")
    ).toBe("https://www.example.com");
    expect(getTenantDashboardHost(tenant({ customDomains: ["https://www.Example.com/path"] }))).toBe(
      "admin.example.com"
    );
  });

  it("uses the www site URL when it matches an apex production domain", () => {
    expect(
      getTenantPublicUrl(
        tenant({
          productionDomain: "greatlakesdriedfruit.com",
          siteUrl: "https://www.greatlakesdriedfruit.com",
        }),
        "production",
      )
    ).toBe("https://www.greatlakesdriedfruit.com");
    expect(
      getTenantDashboardHost(
        tenant({
          productionDomain: "greatlakesdriedfruit.com",
          siteUrl: "https://www.greatlakesdriedfruit.com",
        }),
      )
    ).toBe("admin.greatlakesdriedfruit.com");
  });

  it("prefers a matching www custom domain for the public URL", () => {
    expect(
      getTenantPublicUrl(
        tenant({
          productionDomain: "greatlakesdriedfruit.com",
          customDomains: ["greatlakesdriedfruit.com", "www.greatlakesdriedfruit.com"],
        }),
        "production",
      )
    ).toBe("https://www.greatlakesdriedfruit.com");
  });

  it("falls back to the platform tenant subdomain only when no real domain exists", () => {
    expect(getTenantPublicUrl(tenant(), "production")).toBe("https://gldf.scaffoldweb.com");
  });

  it("derives the active public site from CUSTOM_DOMAIN_MAP when tenant config is missing", () => {
    expect(
      getTenantPublicUrlFromDomainMap(
        "gldf",
        JSON.stringify({
          "greatlakesdriedfruit.com": "gldf",
          "admin.greatlakesdriedfruit.com": "gldf",
          "demo.scaffoldweb.com": "gldf",
        })
      )
    ).toBe("https://greatlakesdriedfruit.com");
  });

  it("does not turn admin-only domain map entries into public site URLs", () => {
    expect(
      getTenantPublicUrlFromDomainMap(
        "gldf",
        JSON.stringify({ "admin.greatlakesdriedfruit.com": "gldf" })
      )
    ).toBe("");
  });
});
