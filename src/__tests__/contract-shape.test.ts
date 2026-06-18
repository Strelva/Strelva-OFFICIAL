/**
 * Locks the wire SHAPE of the public /api/v1/* storefront contract. Deployed
 * client repos (GLDF, Rohlax) consume these responses directly, so a
 * non-additive change to the shape must fail CI here, not on a live site.
 *
 * The single most load-bearing guarantee: v1 content returns the section data
 * OBJECT DIRECTLY — not wrapped in { data } / { content }. A client repo does
 * `const hero = await res.json()` and renders it. Wrapping it would silently
 * blank every client site.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const getTenantConfig = vi.fn();
const getContent = vi.fn();
const getPageConfig = vi.fn();
const getSiteCapabilityManifest = vi.fn();

vi.mock("@/lib/tenants", () => ({
  getTenantConfig: (...a: unknown[]) => getTenantConfig(...a),
}));
vi.mock("@/lib/storage", () => ({
  getContent: (...a: unknown[]) => getContent(...a),
  getPageConfig: (...a: unknown[]) => getPageConfig(...a),
  getDraftPageConfig: vi.fn(() => null),
  SECTION_TO_TYPE: { hero: "hero", services: "services" },
}));
vi.mock("@/lib/site-capabilities", () => ({
  getSiteCapabilityManifest: (...a: unknown[]) => getSiteCapabilityManifest(...a),
}));

afterEach(() => vi.clearAllMocks());

const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

describe("v1 content contract shape", () => {
  it("returns the section data object directly (unwrapped)", async () => {
    const heroData = { title: "Welcome", subtitle: "Book today", _wrapperCheck: true };
    getTenantConfig.mockResolvedValue({ id: "gldf", active: true });
    getContent.mockResolvedValue(heroData);
    const { GET } = await import("@/app/api/v1/content/[tenant]/[section]/route");

    const res = await GET(
      new Request("http://localhost/api/v1/content/gldf/hero"),
      params({ tenant: "gldf", section: "hero" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // The body IS the data — no envelope key. If someone wraps it, this fails.
    expect(body).toEqual(heroData);
    expect(body.data).toBeUndefined();
    expect(body.content).toBeUndefined();
  });

  it("uses the { error } envelope and stable status codes", async () => {
    const { GET } = await import("@/app/api/v1/content/[tenant]/[section]/route");

    // invalid tenant slug -> 400 { error }
    const bad = await GET(
      new Request("http://localhost/api/v1/content/..%2F/hero"),
      params({ tenant: "../", section: "hero" }),
    );
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: expect.any(String) });

    // unknown tenant -> 404 { error }
    getTenantConfig.mockResolvedValue(null);
    const missing = await GET(
      new Request("http://localhost/api/v1/content/ghost/hero"),
      params({ tenant: "ghost", section: "hero" }),
    );
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: expect.any(String) });

    // unknown section on a valid tenant -> 400 { error }
    getTenantConfig.mockResolvedValue({ id: "gldf", active: true });
    const badSection = await GET(
      new Request("http://localhost/api/v1/content/gldf/not-a-section"),
      params({ tenant: "gldf", section: "not-a-section" }),
    );
    expect(badSection.status).toBe(400);
    expect(await badSection.json()).toEqual({ error: expect.any(String) });
  });
});

describe("v1 page-config + site-capabilities contract shape", () => {
  it("page-config returns the config object directly", async () => {
    const cfg = { pages: [{ slug: "/", sections: ["hero"] }] };
    getTenantConfig.mockResolvedValue({ id: "gldf", active: true });
    getSiteCapabilityManifest.mockResolvedValue({ supportsDraftPreview: false });
    getPageConfig.mockResolvedValue(cfg);
    const { GET } = await import("@/app/api/v1/page-config/[tenant]/route");

    const res = await GET(
      new Request("http://localhost/api/v1/page-config/gldf"),
      params({ tenant: "gldf" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(cfg);
  });

  it("site-capabilities returns the manifest object directly", async () => {
    const manifest = { supportsDraftPreview: true, sections: ["hero"] };
    getTenantConfig.mockResolvedValue({ id: "gldf", active: true });
    getSiteCapabilityManifest.mockResolvedValue(manifest);
    const { GET } = await import("@/app/api/v1/site-capabilities/[tenant]/route");

    const res = await GET(
      new Request("http://localhost/api/v1/site-capabilities/gldf"),
      params({ tenant: "gldf" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(manifest);
  });
});
