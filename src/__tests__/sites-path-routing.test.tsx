import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";
import { siteDocumentHash, siteDocumentSchema } from "@/products/websites/site-document";

const document = siteDocumentSchema.parse({ version: 2, siteName: "Elmwood Bakery", theme: { palette: "warm", typeScale: "standard" },
  pages: [{ path: "/", title: "Elmwood Bakery", description: "Saturday bread", root: "header" }, { path: "/about", title: "About", description: "About the bakery", root: "header" }],
  nodes: { header: { id: "header", type: "Header", variant: "logo-left", props: { brand: "Elmwood Bakery", links: [{ label: "About", href: "/about" }, { label: "Email", href: "mailto:bread@example.test" }, { label: "External", href: "https://example.test" }] }, children: [], factIds: [] } }, assets: {}, facts: {}, redirects: [], provenance: { composer: "rules" } });

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SITES_PATH_ORIGIN", "https://assigned-sites.vercel.app");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.strelva.com");
  vi.stubEnv("REB_DEV_UNGATED_ACCESS", "0");
  vi.stubEnv("SCAFFOLD_DEV_UNGATED_ACCESS", "0");
});
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("assigned-origin website delivery", () => {
  it("is inert when unconfigured and leaves the existing API origin contract intact", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITES_PATH_ORIGIN", "");
    const brand = await import("@/platform/infra/brand");
    expect(brand.tenantHostedBaseUrl("bakery")).toBe("https://bakery.strelva.com");
    expect(brand.isSitesPathHost("assigned-sites.vercel.app")).toBe(false);
    expect(brand.tenantSiteOrigin("bakery")).toBe("https://bakery.strelva.com");
  });

  it.each(["https://app.strelva.com", "https://vercel.app", "http://assigned-sites.vercel.app", "https://assigned-sites.vercel.app:444", "https://user:pass@assigned-sites.vercel.app", "https://assigned-sites.vercel.app/path", "https://assigned-sites.vercel.app?tenant=bakery", "https://assigned-sites.vercel.app#draft", "https://assigned-sites.vercel.app.attacker.test"])("refuses unsafe or unassigned origin %s", async origin => {
    const { configuredSitesPathOrigin } = await import("@/platform/infra/brand");
    expect(() => configuredSitesPathOrigin(origin)).toThrow();
  });

  it("refuses the app's assigned alias, and refuses local transport in production", async () => {
    const { configuredSitesPathOrigin } = await import("@/platform/infra/brand");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://same-app.vercel.app");
    expect(() => configuredSitesPathOrigin("https://same-app.vercel.app")).toThrow();
    vi.stubEnv("NODE_ENV", "production");
    expect(() => configuredSitesPathOrigin("http://sites.localhost:3456")).toThrow();
  });

  it("mounts navigation and canonical paths without modifying approved content or its hash", async () => {
    const { SiteRenderer } = await import("@/products/websites/SiteRenderer");
    const { siteDocumentMetadata } = await import("@/products/websites/site-seo");
    const before = JSON.stringify(document);
    const hash = siteDocumentHash(document);
    const html = renderToStaticMarkup(<SiteRenderer document={document} basePath="/sites/bakery" />);
    expect(html).toContain('href="/sites/bakery/"');
    expect(html).toContain('href="/sites/bakery/about"');
    for (const href of ["mailto:bread@example.test", "https://example.test"]) expect(html).toContain(`href="${href}"`);
    expect(html).toContain(hash);
    expect(JSON.stringify(document)).toBe(before);
    expect(siteDocumentMetadata(document, "/about", "https://assigned-sites.vercel.app/sites/bakery").alternates?.canonical).toBe("https://assigned-sites.vercel.app/sites/bakery/about");
  });

  it("uses the current selected URL but preserves issued receipts and rename bindings", async () => {
    const { currentHostedUrl, bindToCurrentTenant } = await import("@/products/websites/hosted-routing");
    const receipt = { providerUrl: "https://assigned-sites.vercel.app/sites/old-bakery/" };
    const bound = { ...document, capabilities: { baseUrl: "https://app.strelva.com", tenant: "old-bakery", inquiry: { capabilityId: "inquiries", version: 1 } } };
    expect(currentHostedUrl({ tenantId: "bakery", receipt })).toBe("https://assigned-sites.vercel.app/sites/bakery/");
    expect(bindToCurrentTenant(bound, "bakery", receipt).capabilities?.tenant).toBe("bakery");
    expect(bindToCurrentTenant(bound, "bakery", { providerUrl: "https://attacker.test/sites/old-bakery/" })).toBe(bound);
    expect(bound.capabilities.tenant).toBe("old-bakery");
    expect(receipt.providerUrl).toBe("https://assigned-sites.vercel.app/sites/old-bakery/");
  });

  it("strips session and preview input; refuses every app fallback even with dev bypass on", async () => {
    vi.stubEnv("REB_DEV_UNGATED_ACCESS", "1");
    const { default: proxy } = await import("@/proxy");
    const headers = { host: "assigned-sites.vercel.app", cookie: "session=forged", authorization: "Bearer forged", "x-tenant": "other", "x-preview-mode": "true" };
    const response = await proxy(new NextRequest("https://assigned-sites.vercel.app/sites/bakery/about?preview=true&tenant=other", { headers }));
    expect(response.headers.get("x-middleware-request-x-tenant")).toBe("bakery");
    for (const header of ["cookie", "authorization", "x-preview-mode"]) expect(response.headers.get(`x-middleware-request-${header}`)).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-security-policy")).toContain("connect-src 'self' https://app.strelva.com");
    for (const path of ["/", "/sign-in", "/auth/callback", "/workspace", "/preview/strelva/workspace", "/client/bakery/dashboard", "/api/workspace", "/api/internal/domain-map", "/api/cron/needs-you", "/embed/agency/bakery/audit", "/sites/bakery/%2Fapi"]) {
      const result = await proxy(new NextRequest(`https://assigned-sites.vercel.app${path}?tenant=other`, { headers }));
      expect(result.status, path).toBe(404);
      expect(result.headers.get("set-cookie")).toBeNull();
      expect(result.headers.get("location")).toBeNull();
    }
  });

  it("exempts only the public booking paths; booking management stays gated", async () => {
    const { isPublicRoute } = await import("@/proxy");
    for (const path of ["/api/booking", "/api/booking/availability"]) expect(isPublicRoute(new NextRequest(`https://bakery.strelva.com${path}`))).toBe(true);
    for (const path of ["/api/booking/list", "/api/booking/config", "/api/booking/overrides", "/api/booking/private-id", "/api/booking/availability/private"]) expect(isPublicRoute(new NextRequest(`https://bakery.strelva.com${path}`))).toBe(false);
  });
});
