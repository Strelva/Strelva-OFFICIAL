import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: (handler: unknown) => handler,
  createRouteMatcher: () => () => false,
}));

import {
  buildContentSecurityPolicy,
  extractTenantFromHost,
  getEnvDomainMap,
  resolveTenantFromDomainMap,
  shouldRedirectAdminRoot,
  shouldRewriteMarketingRoot,
  validateCronRequest,
} from "../middleware";

describe("middleware host routing helpers", () => {
  it("routes tenant.scaffoldweb.com as a platform tenant subdomain", () => {
    expect(extractTenantFromHost("gldf.scaffoldweb.com")).toEqual({
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

  it("keeps platform marketing hosts out of tenant routing", () => {
    expect(extractTenantFromHost("scaffoldweb.com")).toEqual({
      tenant: null,
      isAdminSubdomain: false,
    });
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

  it("redirects admin custom-domain root requests to the dashboard", () => {
    expect(shouldRedirectAdminRoot(true, "/")).toBe(true);
    expect(shouldRedirectAdminRoot(true, "/dashboard")).toBe(false);
    expect(shouldRedirectAdminRoot(false, "/")).toBe(false);
  });

  it("rewrites only marketing root requests to /home", () => {
    expect(shouldRewriteMarketingRoot("scaffoldweb.com", "/")).toBe(true);
    expect(shouldRewriteMarketingRoot("scaffoldweb.com", "/onboard")).toBe(false);
    expect(shouldRewriteMarketingRoot("gldf.scaffoldweb.com", "/")).toBe(false);
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

describe("middleware frame policy", () => {
  it("blocks framing for normal public pages", () => {
    const csp = buildContentSecurityPolicy({
      isPreview: false,
      host: "gldf.scaffoldweb.com",
      protocol: "https:",
    });

    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("allows dashboard origins to frame preview pages", () => {
    const csp = buildContentSecurityPolicy({
      isPreview: true,
      host: "yourbusiness.com",
      protocol: "https:",
    });

    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("https://scaffoldweb.com");
    expect(csp).toContain("https://admin.yourbusiness.com");
    expect(csp).not.toContain("frame-ancestors 'none'");
  });
});
