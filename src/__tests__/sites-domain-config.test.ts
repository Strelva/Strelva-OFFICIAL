import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { TenantConfig } from "@/lib/types";
import { siteDocumentSchema } from "@/products/websites/site-document";

const tenant = { id: "example", subdomain: "example", siteName: "Example", siteUrl: "https://example.strelva.com" } as TenantConfig;
const document = siteDocumentSchema.parse({ version: 2, siteName: "Example", theme: { palette: "light", typeScale: "standard" }, pages: [{ path: "/", title: "Example", description: "Example site", root: "root" }], nodes: { root: { id: "root", type: "Section", variant: "container", props: {}, children: ["form"] }, form: { id: "form", type: "InquiryForm", variant: "card", props: { title: "Contact" }, children: [] } }, assets: {}, facts: {}, redirects: [], provenance: { composer: "rules" }, capabilities: { baseUrl: "https://app.strelva.com", tenant: "old-slug", inquiry: { capabilityId: "contact", version: 1 } } });

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_APP_ROOT_DOMAIN", "");
  vi.stubEnv("NEXT_PUBLIC_SITES_ROOT_DOMAIN", "");
  vi.stubEnv("CUSTOM_DOMAIN_MAP", "{}");
  vi.stubEnv("STRELVA_WEBSITE_REBUILD_RELEASE", "0");
  vi.stubEnv("STRELVA_UI_PREVIEW", "0");
  vi.stubEnv("REB_DEV_UNGATED_ACCESS", "0");
  vi.stubEnv("SCAFFOLD_DEV_UNGATED_ACCESS", "0");
});
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("separate sites apex configuration", () => {
  it("preserves hosted, app, canonical, admin and export behavior without configuration", async () => {
    const brand = await import("@/platform/infra/brand");
    const urls = await import("@/lib/tenant-urls");
    const seo = await import("@/products/websites/site-seo");
    const hosted = await import("@/products/websites/hosted-routing");
    expect(brand.APP_ROOT_DOMAIN).toBe("strelva.com");
    expect(brand.SITES_ROOT_DOMAIN).toBe("strelva.com");
    expect(brand.CONTROL_PLANE_URL).toBe("https://app.strelva.com");
    expect(brand.OPERATOR_URL).toBe("https://admin.strelva.com");
    expect(brand.MARKETING_URL).toBe("https://www.strelva.com");
    expect(brand.tenantSiteOrigin("example")).toBe("https://example.strelva.com");
    expect(urls.getTenantPublicUrl(tenant, "production")).toBe("https://example.strelva.com");
    expect(urls.getTenantDashboardHost({ ...tenant, siteUrl: undefined })).toBe("example.strelva.com");
    expect(seo.tenantCanonicalOrigin("example", tenant)).toBe("https://example.strelva.com");
    expect(hosted.currentHostedUrl({ tenantId: "example" })).toBe("https://example.strelva.com/");
    const { buildSiteDocumentExport } = await import("@/products/websites/site-export");
    const exported = buildSiteDocumentExport({ ...document, capabilities: undefined }, { workspaceId: "workspace", workId: "work", revision: 1, tenant: "example" });
    expect(exported.files.find(file => file.path === "index.html")?.content).toContain('data-site-api-origin="https://example.strelva.com"');
  });

  it("uses the sites root for canonicals, read-back and exports while app/admin remain on the app root", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITES_ROOT_DOMAIN", "sites.example");
    const brand = await import("@/platform/infra/brand");
    const urls = await import("@/lib/tenant-urls");
    const seo = await import("@/products/websites/site-seo");
    const hosted = await import("@/products/websites/hosted-routing");
    expect(brand.tenantSiteOrigin("example")).toBe("https://example.sites.example");
    expect(brand.CONTROL_PLANE_URL).toBe("https://app.strelva.com");
    expect(brand.EMAIL_DOMAIN).toBe("updates.strelva.com");
    expect(urls.getTenantDashboardHost(tenant)).toBe("example.strelva.com");
    expect(urls.getTenantDashboardFallbackUrl(tenant, "/dashboard", "production")).toBe("https://app.strelva.com/client/example/dashboard");
    expect(urls.getTenantPublicUrl(tenant, "production")).toBe("https://example.sites.example");
    expect(seo.tenantCanonicalOrigin("example", tenant)).toBe("https://example.sites.example");
    expect(seo.tenantCanonicalOrigin("example", { ...tenant, productionDomain: "www.customer.example" })).toBe("https://www.customer.example");
    expect(hosted.currentHostedUrl({ tenantId: "example", receipt: { providerUrl: "https://example.strelva.com/" } })).toBe("https://example.sites.example/");
    const { buildSiteDocumentExport } = await import("@/products/websites/site-export");
    const exported = buildSiteDocumentExport({ ...document, capabilities: undefined }, { workspaceId: "workspace", workId: "work", revision: 1, tenant: "example" });
    expect(exported.files.find(file => file.path === "index.html")?.content).toContain('data-site-api-origin="https://example.sites.example"');
  });

  it("parses both roots, preserves legacy admin hosts and reserves the separate sites apex", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITES_ROOT_DOMAIN", "sites.example");
    const { parseTenantHost } = await import("@/lib/tenant-host");
    const { extractTenantFromHost, shouldResolveCustomDomain, isBareAdminHost } = await import("@/proxy");
    for (const host of ["Example.sites.example:443", "example.strelva.com", "example.localhost:3000"]) {
      expect(parseTenantHost(host)).toEqual({ tenant: "example", isAdmin: false });
      expect(extractTenantFromHost(host)).toEqual({ tenant: "example", isAdminSubdomain: false });
      expect(shouldResolveCustomDomain(host)).toBe(false);
    }
    for (const host of ["sites.example", "www.sites.example", "app.sites.example", "api.sites.example", "admin.sites.example", "admin.example.sites.example", "nested.example.sites.example", "app.strelva.com"]) {
      expect(parseTenantHost(host)).toEqual({ tenant: null, isAdmin: false });
      expect(shouldResolveCustomDomain(host)).toBe(false);
    }
    expect(parseTenantHost("admin.example.strelva.com")).toEqual({ tenant: "example", isAdmin: true });
    expect(isBareAdminHost("admin.strelva.com")).toBe(true);
    expect(isBareAdminHost("admin.sites.example")).toBe(false);
    expect(shouldResolveCustomDomain("customer.example")).toBe(true);
    expect(parseTenantHost("example.sites.example.attacker.example")).toEqual({ tenant: null, isAdmin: false });
  });

  it("sets trusted tenant headers on public pages for both roots and strips forged tenant headers on reserved sites hosts", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITES_ROOT_DOMAIN", "sites.example");
    const { default: proxy } = await import("@/proxy");
    for (const host of ["example.strelva.com", "example.sites.example"]) {
      const response = await proxy(new NextRequest(`https://${host}/about`, { headers: { host, "x-tenant": "forged" } }));
      expect(response.headers.get("x-middleware-request-x-tenant")).toBe("example");
      expect(response.headers.get("location")).toBeNull();
    }
    for (const host of ["sites.example", "admin.sites.example", "app.sites.example"]) {
      const response = await proxy(new NextRequest(`https://${host}/about`, { headers: { host, "x-tenant": "forged" } }));
      expect(response.headers.get("x-middleware-request-x-tenant")).toBeNull();
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    }
  });

  it("accepts explicit parser roots and an independently configured app root", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ROOT_DOMAIN", "app-root.example");
    vi.stubEnv("NEXT_PUBLIC_SITES_ROOT_DOMAIN", "sites.example");
    const brand = await import("@/platform/infra/brand");
    const { parseTenantHost } = await import("@/lib/tenant-host");
    expect(brand.CONTROL_PLANE_URL).toBe("https://app.app-root.example");
    expect(parseTenantHost("example.other.example", "other.example")).toEqual({ tenant: "example", isAdmin: false });
    expect(parseTenantHost("app.app-root.example")).toEqual({ tenant: null, isAdmin: false });
    expect(parseTenantHost("example.app-root.example")).toEqual({ tenant: "example", isAdmin: false });
  });

  it("keeps issued documents/receipts immutable and visitor tools usable after apex cutover plus slug rename", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITES_ROOT_DOMAIN", "sites.example");
    const { bindToCurrentTenant, currentHostedUrl } = await import("@/products/websites/hosted-routing");
    const receipt = { providerUrl: "https://old-slug.strelva.com/" };
    expect(bindToCurrentTenant(document, "new-slug", receipt).capabilities?.tenant).toBe("new-slug");
    expect(document.capabilities?.tenant).toBe("old-slug");
    expect(receipt.providerUrl).toBe("https://old-slug.strelva.com/");
    expect(currentHostedUrl({ tenantId: "new-slug", receipt })).toBe("https://new-slug.sites.example/");
    expect(bindToCurrentTenant(document, "new-slug", { providerUrl: "https://old-slug.attacker.example/" })).toBe(document);
  });

  it("excludes both platform roots from custom domain claims and customer-domain inventory", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITES_ROOT_DOMAIN", "sites.example");
    const { isPlatformDomain } = await import("@/platform/infra/brand");
    const { isValidDomain } = await import("@/lib/domains");
    const { getTenantPublicUrlFromDomainMap } = await import("@/lib/tenant-urls");
    for (const host of ["example.strelva.com", "example.sites.example", "sites.example"]) {
      expect(isPlatformDomain(host)).toBe(true);
      expect(isValidDomain(host)).toBe(false);
    }
    expect(getTenantPublicUrlFromDomainMap("example", JSON.stringify({ "example.sites.example": "example", "customer.example": "example" }))).toBe("https://customer.example");
  });

  it.each(["https://sites.example", "sites.example/path", "sites.example:443", "sites.example; script-src *", "*.sites.example"])("rejects malformed root %s", async value => {
    const { configuredRootDomain } = await import("@/platform/infra/brand");
    expect(() => configuredRootDomain(value)).toThrow("bare DNS domain");
    expect(configuredRootDomain(" SITES.EXAMPLE ")).toBe("sites.example");
  });
});
