import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { hostedSiteAddressFromHost, hostedSitesDomain, hostedSiteRewritePath, hostedSiteUrl } from "@/lib/hosted-site-host";
import { hostedPagesFromBundle, hostedSiteContentSecurityPolicy, hostedSiteFile, websiteAddressCandidates } from "@/products/websites/hosting";
import { buildWebsiteArtifact } from "@/products/websites/artifact";
import { generateWebsiteDraft } from "@/products/websites/generation";

const readLive = vi.fn();
vi.mock("@/products/websites/publications", () => ({ websitePublicationStore: { readLive: (address: string) => readLive(address) } }));
vi.mock("@/lib/db/server-client", () => ({ isSupabaseAuthConfigured: () => false }));
vi.mock("@/lib/db/middleware-client", () => ({
  createMiddlewareSupabase: () => null,
  applyMiddlewareSupabaseResponse: (_req: unknown, response: unknown) => response,
}));

const ids = { workspaceId: "11111111-1111-4111-8111-111111111111", workId: "22222222-2222-4222-8222-222222222222" };

async function bundle() {
  const draft = await generateWebsiteDraft({
    ...ids,
    revision: 1,
    brief: { businessName: "Northstar Repair", description: "Same-week repair estimates", primaryCallToAction: "Request an estimate" },
    now: "2026-09-28T12:00:00.000Z",
  });
  return buildWebsiteArtifact({ ...ids, revision: 1, draft, generatedAt: "2026-09-28T12:00:00.000Z" });
}

describe("hosted site hosts", () => {
  it("reads the sites domain only when it is a real host", () => {
    expect(hostedSitesDomain("sites.localhost:3000")).toBe("sites.localhost:3000");
    expect(hostedSitesDomain(" .Strelva.Site ")).toBe("strelva.site");
    expect(hostedSitesDomain("")).toBeNull();
    expect(hostedSitesDomain(undefined)).toBeNull();
    expect(hostedSitesDomain("localhost")).toBeNull();
    expect(hostedSitesDomain("https://strelva.site")).toBeNull();
  });

  it("resolves one address label under the sites domain and nothing else", () => {
    expect(hostedSiteAddressFromHost("northstar.strelva.site", "strelva.site")).toBe("northstar");
    expect(hostedSiteAddressFromHost("northstar.sites.localhost:3000", "sites.localhost:3000")).toBe("northstar");
    expect(hostedSiteAddressFromHost("strelva.site", "strelva.site")).toBeNull();
    expect(hostedSiteAddressFromHost("a.b.strelva.site", "strelva.site")).toBeNull();
    expect(hostedSiteAddressFromHost("northstar.strelva.com", "strelva.site")).toBeNull();
    expect(hostedSiteAddressFromHost("northstar.evilstrelva.site", "strelva.site")).toBeNull();
    expect(hostedSiteAddressFromHost("northstar.strelva.site", null)).toBeNull();
  });

  it("builds public URLs and internal rewrite paths", () => {
    expect(hostedSiteUrl("northstar", "strelva.site")).toBe("https://northstar.strelva.site");
    expect(hostedSiteUrl("northstar", "sites.localhost:3000")).toBe("http://northstar.sites.localhost:3000");
    expect(hostedSiteRewritePath("northstar", "/")).toBe("/hosted-site/northstar");
    expect(hostedSiteRewritePath("northstar", "/about")).toBe("/hosted-site/northstar/about");
  });
});

describe("hosted site pages", () => {
  it("derives stable, safe address choices from the business name", () => {
    expect(websiteAddressCandidates("Alder & Pine Florals", ids.workId).slice(0, 3)).toEqual(["alder-and-pine-florals", "alder-and-pine-florals-2", "alder-and-pine-florals-3"]);
    expect(websiteAddressCandidates("Café Crème", ids.workId)[0]).toBe("cafe-creme");
    expect(websiteAddressCandidates("Admin", ids.workId)).toEqual(["site-22222222"]);
    expect(websiteAddressCandidates("!!!", ids.workId)).toEqual(["site-22222222"]);
    for (const address of websiteAddressCandidates("A".repeat(200), ids.workId)) expect(address.length).toBeLessThanOrEqual(48);
  });

  it("publishes only rendered pages from a verified bundle", async () => {
    const pages = hostedPagesFromBundle(await bundle());
    expect(pages["/"]).toContain("Northstar Repair");
    expect(Object.keys(pages).some((path) => /json|package|scripts|README|manifest/.test(path))).toBe(false);
  });

  it("refuses a bundle whose files changed after hashing", async () => {
    const changed = await bundle();
    changed.files = changed.files.map((file) => file.path === "site/index.html" ? { ...file, content: `${file.content}<!-- changed -->` } : file);
    expect(() => hostedPagesFromBundle(changed)).toThrow();
  });

  it("serves known paths only", () => {
    const pages = { "/": "<html>home</html>", "/about": "<html>about</html>", "/website-generation/capability-runtime.mjs": "export {}" };
    expect(hostedSiteFile(pages, "/")).toEqual({ body: "<html>home</html>", contentType: "text/html; charset=utf-8" });
    expect(hostedSiteFile(pages, "/about/")?.body).toBe("<html>about</html>");
    expect(hostedSiteFile(pages, "/about/index.html")?.body).toBe("<html>about</html>");
    expect(hostedSiteFile(pages, "/website-generation/capability-runtime.mjs")?.contentType).toBe("text/javascript; charset=utf-8");
    expect(hostedSiteFile(pages, "/missing")).toBeNull();
    expect(hostedSiteFile(pages, "/__proto__")).toBeNull();
    expect(hostedSiteFile(pages, "/constructor")).toBeNull();
  });

  it("allows network access only to the declared capability origin", () => {
    expect(hostedSiteContentSecurityPolicy(null)).toContain("connect-src 'none'");
    expect(hostedSiteContentSecurityPolicy("https://app.strelva.com")).toContain("connect-src https://app.strelva.com");
    expect(hostedSiteContentSecurityPolicy(null)).toContain("script-src 'self'");
  });
});

describe("hosted site serving", () => {
  beforeEach(() => {
    vi.stubEnv("STRELVA_SITES_DOMAIN", "sites.localhost:3000");
    readLive.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  async function get(host: string, address: string, path?: string[]) {
    const { GET } = await import("@/app/hosted-site/[address]/[[...path]]/route");
    return GET(new Request(`http://${host}/`, { headers: { host } }), { params: Promise.resolve({ address, path }) });
  }

  it("serves a live page with its own security headers", async () => {
    readLive.mockResolvedValue({ address: "northstar", contentHash: "a".repeat(64), connectOrigin: null, pages: { "/": "<html>home</html>" } });
    const response = await get("northstar.sites.localhost:3000", "northstar");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("<html>home</html>");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(readLive).toHaveBeenCalledWith("northstar");
  });

  it("does not serve generated HTML on the control-plane origin", async () => {
    const response = await get("app.strelva.com", "northstar");
    expect(response.status).toBe(404);
    expect(readLive).not.toHaveBeenCalled();
  });

  it("does not serve an address that differs from the host", async () => {
    expect((await get("northstar.sites.localhost:3000", "other")).status).toBe(404);
  });

  it("returns not found for offline or unknown sites and paths", async () => {
    readLive.mockResolvedValue(null);
    expect((await get("northstar.sites.localhost:3000", "northstar")).status).toBe(404);
    readLive.mockResolvedValue({ address: "northstar", contentHash: "a".repeat(64), connectOrigin: null, pages: { "/": "<html>home</html>" } });
    expect((await get("northstar.sites.localhost:3000", "northstar", ["missing"])).status).toBe(404);
  });

  it("reports storage failure as temporary", async () => {
    readLive.mockRejectedValue(new Error("db down"));
    const response = await get("northstar.sites.localhost:3000", "northstar");
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("routes hosted-site hosts in the proxy without touching the session", async () => {
    const { default: proxy } = await import("@/proxy");
    const response = await proxy(new NextRequest("http://northstar.sites.localhost:3000/about?x=1", { headers: { host: "northstar.sites.localhost:3000" } }));
    expect(response.headers.get("x-middleware-rewrite")).toBe("http://northstar.sites.localhost:3000/hosted-site/northstar/about");
  });
});
