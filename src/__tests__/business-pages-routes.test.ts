import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BusinessPagesStore } from "@/products/connected-sites/business-pages-store";

const deps = vi.hoisted(() => ({ headers: new Headers(), flag: vi.fn(), hosted: null as null | { preview: boolean; origin: string } }));
vi.mock("next/headers", () => ({ headers: async () => deps.headers }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => true }));
// The business's own connected_sites row (the public gate).
vi.mock("@/platform/release-flags/store", () => ({ workspaceReleaseFlagEnabled: deps.flag }));
vi.mock("@/products/websites/index", () => ({ getHostedSite: async () => deps.hosted }));

import { setBusinessPagesStoreForTests } from "@/products/connected-sites/business-pages-store";
import { loadPublishedBusinessPage } from "@/products/connected-sites/business-pages";
import BusinessPage, { generateMetadata } from "@/app/biz/[handle]/page";
import { GET as getLlms } from "@/app/biz/[handle]/llms.txt/route";
import robots from "@/app/robots";

const BUSINESS = "7b000000-0000-4000-8000-000000000001";
const published = {
  workspaceId: BUSINESS,
  handle: "fictional-barber",
  revision: 4,
  confirmedAt: "2026-10-03T12:00:00.000Z",
  facts: {
    display_name: "Fictional Barber <Co>",
    description: "Neighborhood barber.",
    phone: "716-555-0100",
    address: { line1: "1 Main St", city: "Buffalo", region: "NY", postalCode: "14202" },
    hours: { timezone: "America/New_York", weekly: [{ day: 1, opens: "09:00", closes: "17:00" }] },
    links: [{ kind: "booking", url: "https://book.example/barber" }],
  },
  services: [{ name: "Haircut", description: null, priceText: "$30" }],
};
let store: BusinessPagesStore;
const params = (handle: string) => ({ params: Promise.resolve({ handle }) });

beforeEach(() => {
  vi.stubEnv("STRELVA_CONNECTED_SITES_RELEASE", "1");
  vi.stubEnv("STRELVA_BUSINESS_PAGES", "1");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.strelva.test");
  deps.headers = new Headers();
  deps.hosted = null;
  deps.flag.mockReset().mockResolvedValue(true);
  store = { read: vi.fn(), set: vi.fn(), confirmedFacts: vi.fn(), published: vi.fn(async (handle: string) => handle === published.handle ? published : null) };
  setBusinessPagesStoreForTests(store);
});
afterEach(() => { vi.unstubAllEnvs(); setBusinessPagesStoreForTests(null); });

describe("which pages answer", () => {
  it("is off unless STRELVA_BUSINESS_PAGES=1 and connected sites are on, without reading the store", async () => {
    vi.stubEnv("STRELVA_BUSINESS_PAGES", "");
    expect(await loadPublishedBusinessPage("fictional-barber")).toBeNull();
    vi.stubEnv("STRELVA_BUSINESS_PAGES", "1");
    vi.stubEnv("STRELVA_CONNECTED_SITES_RELEASE", "0");
    expect(await loadPublishedBusinessPage("fictional-barber")).toBeNull();
    expect(store.published).not.toHaveBeenCalled();
  });
  it("refuses malformed handles before SQL, and a business whose connected_sites row is off", async () => {
    expect(await loadPublishedBusinessPage("../admin")).toBeNull();
    expect(store.published).not.toHaveBeenCalled();
    expect(await loadPublishedBusinessPage("Fictional-Barber")).toMatchObject({ handle: "fictional-barber" });
    deps.flag.mockResolvedValue(false);
    expect(await loadPublishedBusinessPage("fictional-barber")).toBeNull();
    expect(deps.flag).toHaveBeenCalledWith("connected_sites", BUSINESS, { operator: true, tester: false });
  });
  it("serves nothing for a business without a confirmed name", async () => {
    (store.published as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ...published, facts: { phone: "716-555-0100" } });
    expect(await loadPublishedBusinessPage("fictional-barber")).toBeNull();
  });
});

describe("GET /biz/{handle}/llms.txt", () => {
  const get = (handle: string, headers: Record<string, string> = {}) => getLlms(new Request(`https://app.strelva.test/biz/${handle}/llms.txt`, { headers }), params(handle));

  it("returns the confirmed fact sheet as cacheable plain text", async () => {
    const response = await get("fictional-barber");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("public, max-age=300, s-maxage=300");
    const body = await response.text();
    expect(body).toContain("# Fictional Barber <Co>");
    expect(body).toContain("- Phone: 716-555-0100");
    expect(body).toContain("- Page: https://app.strelva.test/biz/fictional-barber");
    expect(body).toContain("- Haircut ($30)");
  });
  it("is 404 for unknown, unpublished or off, and on a client site's host", async () => {
    expect((await get("someone-else")).status).toBe(404);
    expect((await get("fictional-barber", { "x-tenant": "gldf" })).status).toBe(404);
    vi.stubEnv("STRELVA_BUSINESS_PAGES", "0");
    expect((await get("fictional-barber")).status).toBe(404);
  });
  it("answers 503 when the store fails, and leaks nothing", async () => {
    (store.published as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("db password=secret"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await get("fictional-barber");
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret");
    spy.mockRestore();
  });
});

describe("/biz/{handle}", () => {
  it("renders every confirmed fact and its JSON-LD in the server HTML, with no JavaScript of its own", async () => {
    const html = renderToStaticMarkup(await BusinessPage(params("fictional-barber")));
    for (const text of ["Fictional Barber &lt;Co&gt;", "Neighborhood barber.", "716-555-0100", "1 Main St, Buffalo, NY 14202", "Monday", "9 AM – 5 PM", "Haircut", "$30", "Book a time", "Updated October 3, 2026"]) {
      expect(html).toContain(text);
    }
    expect(html).toContain('href="tel:7165550100"');
    expect(html).toContain('href="https://app.strelva.test/biz/fictional-barber/llms.txt"');
    // The only script is the JSON-LD, inline and escaped; nothing to download or run.
    const scripts = html.match(/<script\b[^>]*>/g) ?? [];
    expect(scripts).toEqual(['<script type="application/ld+json">']);
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]!);
    expect(ld).toMatchObject({ "@type": "LocalBusiness", name: "Fictional Barber <Co>", url: "https://app.strelva.test/biz/fictional-barber", telephone: "716-555-0100" });
    expect(html).not.toContain("<Co>");
  });
  it("names its canonical address from configuration, never the request host", async () => {
    deps.headers = new Headers({ host: "evil.example", "x-forwarded-host": "evil.example" });
    const metadata = await generateMetadata(params("fictional-barber"));
    expect(metadata.alternates?.canonical).toBe("https://app.strelva.test/biz/fictional-barber");
    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect(metadata.title).toEqual({ absolute: "Fictional Barber <Co> in Buffalo, NY" });
  });
  it("is not found when off, unpublished, or on a client site's host", async () => {
    await expect(BusinessPage(params("someone-else"))).rejects.toThrow();
    deps.headers = new Headers({ "x-tenant": "gldf" });
    await expect(BusinessPage(params("fictional-barber"))).rejects.toThrow();
    expect((await generateMetadata(params("fictional-barber"))).robots).toEqual({ index: false, follow: false });
  });
});

/** RFC 9309: the longest matching rule wins; Allow wins a tie; `*` matches any run of characters. */
function crawlable(rule: { allow?: string | string[]; disallow?: string | string[] }, path: string): boolean {
  const match = (pattern: string) => new RegExp(`^${pattern.split("*").map(part => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}`).test(path);
  const longest = (patterns: string | string[] | undefined) => Math.max(-1, ...[patterns ?? []].flat().filter(match).map(pattern => pattern.length));
  const allow = longest(rule.allow);
  const disallow = longest(rule.disallow);
  return disallow < 0 || allow >= disallow;
}

describe("robots", () => {
  const everyone = async () => {
    const rules = (await robots()).rules;
    const list = Array.isArray(rules) ? rules : [rules];
    // No rule singles out an AI crawler.
    expect(list.every(rule => rule.userAgent === "*")).toBe(true);
    return list[0]!;
  };
  it("on the app host lets every crawler read /biz pages and their llms.txt; /api stays closed (v1 baseline)", async () => {
    const rule = await everyone();
    for (const path of ["/biz/fictional-barber", "/biz/fictional-barber/llms.txt"]) expect(crawlable(rule, path)).toBe(true);
    for (const path of ["/api/v1/bookings/openapi.json", "/api/workspace", "/dashboard/site"]) expect(crawlable(rule, path)).toBe(false);
  });
  it("on a hosted site opens the agent OpenAPI file, keeps the rest of /api closed, and closes previews entirely", async () => {
    deps.hosted = { preview: false, origin: "https://gldf.example" };
    const rule = await everyone();
    expect(crawlable(rule, "/api/v1/bookings/openapi.json")).toBe(true);
    expect(crawlable(rule, "/api/v1/leads/gldf")).toBe(false);
    expect(crawlable(rule, "/workspace/site")).toBe(false);
    deps.hosted = { preview: true, origin: "https://gldf.example" };
    expect(crawlable(await everyone(), "/api/v1/bookings/openapi.json")).toBe(false);
  });
});
