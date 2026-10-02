import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const published = vi.hoisted(() => vi.fn());
vi.mock("@/products/websites/document-store", () => ({ getPublishedSiteDocument: published }));
import proxy, { config } from "@/proxy";
const request = (path: string, tenant = "example", headers?: Record<string,string>) => new NextRequest(`https://${tenant}.strelva.com${path}`, { headers: { host: `${tenant}.strelva.com`, ...headers } });
function enable() { vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1"); vi.stubEnv("STRELVA_WEBSITE_REBUILD_RELEASE", "1"); }
afterEach(() => { vi.unstubAllEnvs(); published.mockReset(); });
describe("hosted old-file redirects", () => {
  it("includes a supplemental proxy matcher for html, htm, php and aspx", () => {
    const matcher = config.matcher.at(-1)!;
    for (const path of ["/old.html", "/old.htm", "/old.php", "/old.aspx"]) expect(new RegExp(`^${matcher}$`).test(path)).toBe(true);
    expect(new RegExp(`^${matcher}$`).test("/photo.jpg")).toBe(false);
  });
  it("preserves the exact header-free legacy HTML passthrough while disabled", async () => {
    vi.stubEnv("STRELVA_WEBSITE_REBUILD_RELEASE", "0");
    for (const path of ["/old.html", "/old.htm"]) {
      const result = await proxy(request(path));
      expect(result.status).toBe(200);
      expect([...result.headers.entries()]).toEqual([["x-middleware-next", "1"]]);
      expect(await result.text()).toBe("");
    }
    expect(published).not.toHaveBeenCalled();
  });
  it("301 redirects each old extension using the trusted host and retains query parameters", async () => {
    enable();
    published.mockResolvedValue({ pages: [{ path: "/about" }], redirects: ["html", "htm", "php", "aspx"].map(extension => ({ from: `/old.${extension}`, to: "/about" })) });
    for (const extension of ["html", "htm", "php", "aspx"]) {
      const result = await proxy(request(`/old.${extension}?campaign=source`, "example", { "x-tenant": "attacker" }));
      expect(result.status).toBe(301);
      expect(result.headers.get("location")).toBe("https://example.strelva.com/about?campaign=source");
      expect(published).toHaveBeenLastCalledWith("example");
    }
  });
  it("does not apply hosted redirects inside preview or on an unbound apex host", async () => {
    enable();
    await proxy(request("/old.html?preview=true"));
    expect(published).not.toHaveBeenCalled();
    await proxy(new NextRequest("https://app.strelva.com/old.html", { headers: { host: "app.strelva.com", "x-tenant": "example" } }));
    expect(published).not.toHaveBeenCalled();
  });
  it("does not redirect an unmapped old file", async () => {
    enable(); published.mockResolvedValue(null);
    expect((await proxy(request("/unmapped.html"))).status).toBe(200);
  });
});
