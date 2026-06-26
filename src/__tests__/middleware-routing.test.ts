import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: (handler: unknown) => handler,
  createRouteMatcher: () => () => false,
}));

import {
  buildContentSecurityPolicy,
  clearDomainResolutionCacheForTests,
  extractTenantFromClientPath,
  extractTenantFromHost,
  getEnvDomainMap,
  getLegacyPublicSiteRedirect,
  getOwnershipSettingsRedirectPath,
  isMarketingHost,
  resolveTenantFromCustomDomain,
  resolveTenantFromDomainMap,
  shouldRedirectAdminRoot,
  shouldResolveCustomDomain,
  shouldUseFallbackAuthForAdminHost,
  shouldRewriteMarketingRoot,
  validateCronRequest,
} from "../proxy";
import { parseMarketingDomains } from "../lib/marketing-hosts";
import { getTenantFromHost } from "../lib/tenant";
import { getTenantSiteName } from "../lib/tenant-display";

describe("proxy host routing helpers", () => {
  it("routes tenant.strelva.com as a platform tenant subdomain", () => {
    expect(extractTenantFromHost("gldf.strelva.com")).toEqual({
      tenant: "gldf",
      isAdminSubdomain: false,
    });
  });

  it("routes tenant.localhost with a dev server port", () => {
    expect(extractTenantFromHost("gldf.localhost:3000")).toEqual({
      tenant: "gldf",
      isAdminSubdomain: false,
    });
  });

  it("keeps reserved control-plane subdomains out of tenant routing", () => {
    // app.strelva.com is the post-cutover control-plane host, NOT a tenant.
    expect(extractTenantFromHost("app.strelva.com")).toEqual({
      tenant: null,
      isAdminSubdomain: false,
    });
    expect(extractTenantFromHost("api.strelva.com")).toEqual({
      tenant: null,
      isAdminSubdomain: false,
    });
    expect(extractTenantFromHost("www.strelva.com")).toEqual({
      tenant: null,
      isAdminSubdomain: false,
    });
  });

  it("routes admin tenant hosts to the tenant dashboard surface", () => {
    expect(extractTenantFromHost("admin.gldf.localhost:3000")).toEqual({
      tenant: "gldf",
      isAdminSubdomain: true,
    });
    expect(extractTenantFromHost("admin.rohlax.strelva.com")).toEqual({
      tenant: "rohlax",
      isAdminSubdomain: true,
    });
  });

  it("routes /client tenant fallback paths to the dashboard surface", () => {
    expect(extractTenantFromClientPath("/client/rohlax")).toEqual({
      tenant: "rohlax",
      targetPath: "/dashboard",
      shouldRedirectToDashboard: true,
    });
    expect(extractTenantFromClientPath("/client/rohlax/")).toEqual({
      tenant: "rohlax",
      targetPath: "/dashboard",
      shouldRedirectToDashboard: true,
    });
    expect(extractTenantFromClientPath("/client/rohlax/dashboard/site")).toEqual({
      tenant: "rohlax",
      targetPath: "/dashboard/site",
      shouldRedirectToDashboard: false,
    });
    expect(extractTenantFromClientPath("/dashboard")).toEqual({
      tenant: null,
      targetPath: "/dashboard",
      shouldRedirectToDashboard: false,
    });
  });

  it("derives tenant context from auth page hosts when middleware headers are unavailable", () => {
    expect(getTenantFromHost("admin.gldf.localhost:3000")).toBe("gldf");
    expect(getTenantFromHost("admin.rohlax.strelva.com")).toBe("rohlax");
    expect(getTenantFromHost("gldf.localhost:3000")).toBe("gldf");
    expect(getTenantFromHost("strelva.com")).toBeNull();
    expect(getTenantFromHost("admin.strelva.com")).toBeNull();
  });

  it("keeps auth page tenant names useful when tenant storage is unavailable", () => {
    expect(getTenantSiteName("gldf", undefined)).toBe("Great Lakes Dried Fruit");
    expect(getTenantSiteName("new-client", undefined)).toBe("New Client");
    expect(getTenantSiteName("demo", undefined)).toBe("Strelva");
  });

  it("keeps platform marketing hosts out of tenant routing", () => {
    expect(isMarketingHost("strelva.com")).toBe(true);
    expect(isMarketingHost("localhost:3000")).toBe(true);
    expect(isMarketingHost("127.0.0.1:3001")).toBe(true);
    expect(isMarketingHost("gldf.localhost:3000")).toBe(false);

    expect(extractTenantFromHost("strelva.com")).toEqual({
      tenant: null,
      isAdminSubdomain: false,
    });
  });

  it("normalizes marketing domains from production env format", () => {
    expect(parseMarketingDomains("https://strelva.com, www.strelva.com/, localhost:3000")).toEqual([
      "strelva.com",
      "www.strelva.com",
      "localhost:3000",
    ]);
  });

  it("skips custom-domain lookups for known platform and local hosts", () => {
    expect(shouldResolveCustomDomain("strelva.com")).toBe(false);
    expect(shouldResolveCustomDomain("localhost:3000")).toBe(false);
    expect(shouldResolveCustomDomain("127.0.0.1:3000")).toBe(false);
    expect(shouldResolveCustomDomain("gldf.localhost:3000")).toBe(false);
    expect(shouldResolveCustomDomain("gldf.strelva.com")).toBe(false);
    expect(shouldResolveCustomDomain("greatlakesdriedfruit.com")).toBe(true);
  });

  it("routes custom domains from the domain map", () => {
    const map = getEnvDomainMap('{"yourbusiness.com":"tenantid"}');

    expect(resolveTenantFromDomainMap("yourbusiness.com", map)).toEqual({
      tenant: "tenantid",
      isAdminSubdomain: false,
    });
    expect(resolveTenantFromDomainMap("www.yourbusiness.com", map)).toEqual({
      tenant: "tenantid",
      isAdminSubdomain: false,
    });
  });

  it("routes admin.customdomain.com as the tenant admin surface", () => {
    const map = getEnvDomainMap('{"customdomain.com":"tenantid"}');

    expect(resolveTenantFromDomainMap("admin.customdomain.com", map)).toEqual({
      tenant: "tenantid",
      isAdminSubdomain: true,
    });
  });

  it("keeps public and admin custom-domain cache entries isolated", async () => {
    clearDomainResolutionCacheForTests();
    process.env.INTERNAL_API_SECRET = "secret";
    const req = { nextUrl: { origin: "https://strelva.com" } } as never;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input));
      const domain = url.searchParams.get("domain");
      const payload = domain === "example.com"
        ? { tenant: "tenantid", isAdmin: false }
        : { tenant: null, isAdmin: false };

      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    await expect(resolveTenantFromCustomDomain("admin.example.com", req)).resolves.toEqual({
      tenant: "tenantid",
      isAdminSubdomain: true,
    });
    await expect(resolveTenantFromCustomDomain("example.com", req)).resolves.toEqual({
      tenant: "tenantid",
      isAdminSubdomain: false,
    });

    fetchMock.mockRestore();
  });

  it("redirects admin custom-domain root requests to the dashboard", () => {
    expect(shouldRedirectAdminRoot(true, "/")).toBe(true);
    expect(shouldRedirectAdminRoot(true, "/dashboard")).toBe(false);
    expect(shouldRedirectAdminRoot(false, "/")).toBe(false);
  });

  it("moves legacy ownership routes into settings", () => {
    expect(getOwnershipSettingsRedirectPath("/dashboard/ownership")).toBe("/dashboard/settings#ownership");
    expect(getOwnershipSettingsRedirectPath("/dashboard/ownership/")).toBe("/dashboard/settings#ownership");
    expect(getOwnershipSettingsRedirectPath("/client/gldf/dashboard/ownership")).toBe(
      "/client/gldf/dashboard/settings#ownership",
    );
    expect(getOwnershipSettingsRedirectPath("/dashboard/settings")).toBeNull();
  });

  it("uses scaffoldweb fallback auth for customer-owned admin domains", () => {
    expect(shouldUseFallbackAuthForAdminHost("admin.greatlakesdriedfruit.com", true)).toBe(true);
    expect(shouldUseFallbackAuthForAdminHost("admin.rohlaxwellness.com", true)).toBe(true);
    expect(shouldUseFallbackAuthForAdminHost("admin.rohlax.strelva.com", true)).toBe(false);
    expect(shouldUseFallbackAuthForAdminHost("admin.gldf.localhost:3000", true)).toBe(false);
    expect(shouldUseFallbackAuthForAdminHost("greatlakesdriedfruit.com", false)).toBe(false);
  });

  it("rewrites only marketing root requests to /home", () => {
    expect(shouldRewriteMarketingRoot("strelva.com", "/")).toBe(true);
    expect(shouldRewriteMarketingRoot("strelva.com", "/access-request")).toBe(false);
    expect(shouldRewriteMarketingRoot("strelva.com", "/onboard")).toBe(false);
    expect(shouldRewriteMarketingRoot("gldf.strelva.com", "/")).toBe(false);
  });

  it("redirects legacy customer-facing platform subdomains to the real customer domain", () => {
    expect(getLegacyPublicSiteRedirect("gldf.strelva.com")).toBe("https://greatlakesdriedfruit.com");
    expect(getLegacyPublicSiteRedirect("gldf.strelva.com:443")).toBe("https://greatlakesdriedfruit.com");
    expect(getLegacyPublicSiteRedirect("rohlax.strelva.com")).toBeNull();
  });

  it("fails cron routes closed without the configured secret", () => {
    expect(validateCronRequest(undefined, "Bearer secret")).toEqual({
      allowed: false,
      status: 500,
      message: "CRON_SECRET not configured",
    });
  });

  it("allows cron routes only with the configured bearer secret", () => {
    expect(validateCronRequest("secret", "Bearer secret").allowed).toBe(true);
    expect(validateCronRequest("secret", "Bearer wrong")).toEqual({
      allowed: false,
      status: 401,
      message: "Unauthorized",
    });
  });
});

describe("proxy frame policy", () => {
  it("blocks framing for normal public pages", () => {
    const csp = buildContentSecurityPolicy({
      isPreview: false,
      host: "gldf.strelva.com",
      protocol: "https:",
    });

    // Prod frame-src no longer includes http://localhost:* (dev-only now).
    expect(csp).toContain("frame-src 'self' https:");
    expect(csp).not.toContain("http://localhost:* http://*.localhost:*");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("allows dashboard origins to frame preview pages", () => {
    const csp = buildContentSecurityPolicy({
      isPreview: true,
      host: "yourbusiness.com",
      protocol: "https:",
    });

    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("https://strelva.com");
    expect(csp).toContain("https://admin.yourbusiness.com");
    expect(csp).not.toContain("frame-ancestors 'none'");
  });

  it("allows the dashboard to frame the live preview proxy", () => {
    const csp = buildContentSecurityPolicy({
      isPreview: false,
      isLivePreview: true,
      host: "localhost:3000",
      protocol: "http:",
    });

    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval' https: http://localhost:*");
    expect(csp).toContain("base-uri 'self' https:");
    expect(csp).toContain("frame-ancestors 'self' http://localhost:3000");
    expect(csp).not.toContain("frame-ancestors 'none'");
  });
});
