import { describe, it, expect } from "vitest";

import { buildMetadata, buildSitemap, buildRobots } from "../scaffold-seo";

describe("buildMetadata", () => {
  it("returns an empty object for an empty/absent config (omits everything)", () => {
    expect(buildMetadata({})).toEqual({});
    expect(buildMetadata(undefined)).toEqual({});
    expect(buildMetadata({ title: "  ", description: "" })).toEqual({});
  });

  it("maps title/description/canonical and builds openGraph", () => {
    const meta = buildMetadata({
      title: "Green Leaf Dental",
      description: "Family dentistry in Buffalo.",
      ogImage: "https://greenleafdental.com/og.jpg",
      canonical: "https://greenleafdental.com/",
      url: "https://greenleafdental.com/",
      siteName: "Green Leaf Dental",
    });
    expect(meta.title).toBe("Green Leaf Dental");
    expect(meta.description).toBe("Family dentistry in Buffalo.");
    expect(meta.alternates).toEqual({ canonical: "https://greenleafdental.com/" });
    expect(meta.openGraph).toEqual({
      title: "Green Leaf Dental",
      description: "Family dentistry in Buffalo.",
      url: "https://greenleafdental.com/",
      siteName: "Green Leaf Dental",
      images: [{ url: "https://greenleafdental.com/og.jpg" }],
    });
  });

  it("emits noindex robots only when requested", () => {
    expect(buildMetadata({ title: "x" }).robots).toBeUndefined();
    expect(buildMetadata({ title: "x", noindex: true }).robots).toEqual({ index: false, follow: false });
  });

  it("omits openGraph entirely when no OG-relevant field is present", () => {
    expect(buildMetadata({ canonical: "https://x.com/" }).openGraph).toBeUndefined();
  });
});

describe("buildSitemap", () => {
  it("returns an empty array for a non-array input", () => {
    expect(buildSitemap(undefined)).toEqual([]);
    // @ts-expect-error garbage input must not throw
    expect(buildSitemap("nope")).toEqual([]);
  });

  it("maps entries, clamps priority, and drops empty urls", () => {
    const out = buildSitemap([
      { url: "https://x.com/", priority: 5, changeFrequency: "daily" },
      { url: "  ", priority: 0.5 },
      { url: "https://x.com/about", lastModified: "2024-01-01" },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ url: "https://x.com/", priority: 1, changeFrequency: "daily" });
    expect(out[1]).toEqual({ url: "https://x.com/about", lastModified: "2024-01-01" });
  });

  it("absolutizes path urls against baseUrl and de-dupes by final url", () => {
    const out = buildSitemap(
      [{ url: "/about" }, { url: "about" }, { url: "https://x.com/contact" }],
      { baseUrl: "https://x.com/" },
    );
    expect(out.map((e) => e.url)).toEqual(["https://x.com/about", "https://x.com/contact"]);
  });
});

describe("buildRobots", () => {
  it("defaults the user-agent to * and sets provided allow/disallow + sitemap", () => {
    const robots = buildRobots({ disallow: ["/admin", "/api"], sitemap: "https://x.com/sitemap.xml" });
    expect(robots.rules).toEqual({ userAgent: "*", disallow: ["/admin", "/api"] });
    expect(robots.sitemap).toBe("https://x.com/sitemap.xml");
  });

  it("blocks the whole site when disallowAll is set", () => {
    const robots = buildRobots({ disallowAll: true, allow: ["/should-be-ignored"] });
    expect(robots.rules).toEqual({ userAgent: "*", disallow: "/" });
  });

  it("keeps multiple sitemaps as an array and sets host", () => {
    const robots = buildRobots({
      sitemap: ["https://x.com/a.xml", "https://x.com/b.xml"],
      host: "https://x.com",
    });
    expect(robots.sitemap).toEqual(["https://x.com/a.xml", "https://x.com/b.xml"]);
    expect(robots.host).toBe("https://x.com");
  });
});
