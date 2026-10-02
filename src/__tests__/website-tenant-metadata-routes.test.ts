import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MARKETING_URL } from "@/lib/brand";
const request = vi.hoisted(() => ({ tenant: "first", preview: false, hosted: true }));
vi.mock("@/products/websites/hosted-public", () => ({ getHostedSite: async () => request.hosted ? ({ tenant: request.tenant, origin: `https://${request.tenant}.example`, preview: request.preview, document: { pages: [{ path: "/" }, { path: `/services/${request.tenant}-service` }] } }) : null }));
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";

afterEach(() => { request.tenant = "first"; request.preview = false; request.hosted = true; vi.useRealTimers(); vi.unstubAllEnvs(); });
const baseline = (path: string) => readFileSync(`src/__tests__/fixtures/website-legacy/${path.includes("layout") ? "layout" : path.includes("sitemap") ? "sitemap" : "robots"}.txt`, "utf8");
function legacyRouteResult(path: string, name: string) {
  const original = baseline(path).replace(/^import .+;\n/gm, "").replace(`export default function ${name}(): MetadataRoute.${name === "sitemap" ? "Sitemap" : "Robots"}`, `function ${name}()`);
  return new Function("MARKETING_URL", `${original}\nreturn ${name}();`)(MARKETING_URL) as unknown;
}

describe("tenant metadata routes", () => {
  it("keeps alternating v2 sitemap requests isolated by tenant", async () => {
    const first = await sitemap(); request.tenant = "second"; const second = await sitemap();
    expect(first.map(item => item.url)).toEqual(["https://first.example/", "https://first.example/services/first-service"]);
    expect(second.map(item => item.url)).toEqual(["https://second.example/", "https://second.example/services/second-service"]);
    expect((await robots()).sitemap).toBe("https://second.example/sitemap.xml");
  });
  it("preserves byte-identical v1 sitemap and robots output from the git baseline", async () => {
    request.hosted = false; vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-01T00:00:00Z")); vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://legacy.example");
    expect(JSON.stringify(await sitemap())).toBe(JSON.stringify(legacyRouteResult("src/app/sitemap.ts", "sitemap")));
    expect(JSON.stringify(await robots())).toBe(JSON.stringify(legacyRouteResult("src/app/robots.ts", "robots")));
  });
  it("preserves the exact v1 metadata and JSON-LD implementation from the git baseline", () => {
    const path = "src/app/(public)/layout.tsx";
    const original = baseline(path); const current = readFileSync(path, "utf8");
    const metadata = (source: string) => source.slice(source.indexOf("  const tenant = await getTenantFromHeaders();", source.indexOf("export async function generateMetadata")), source.indexOf("// Map a tenant industry"));
    const jsonLd = (source: string) => source.slice(source.indexOf("async function LocalBusinessSchema()"), source.indexOf("export default async function TenantPublicLayout"));
    expect(metadata(current)).toBe(metadata(original));
    expect(jsonLd(current)).toBe(jsonLd(original));
  });
  it("blocks private v2 preview indexing and page discovery", async () => {
    request.preview = true; expect(await sitemap()).toEqual([]); expect(await robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });
});
