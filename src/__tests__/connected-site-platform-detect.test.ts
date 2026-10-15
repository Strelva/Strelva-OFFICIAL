import { describe, expect, it } from "vitest";
import { detectSitePlatform } from "@/products/connected-sites/client";
import { fetchSiteFingerprint } from "@/products/connected-sites/site-checks";

const page = (head: string, body = "") => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

describe("detectSitePlatform", () => {
  it("reads a WordPress generator tag", () => {
    const d = detectSitePlatform({ html: page('<meta name="generator" content="WordPress 6.6.1">') });
    expect(d).toEqual({ platform: "wordpress", evidence: ["generator: WordPress 6.6.1"], confident: true });
  });
  it("reads a generator tag with content before name", () => {
    expect(detectSitePlatform({ html: page("<meta content='Wix.com Website Builder' name='generator'>") }).platform).toBe("wix");
  });
  it("counts Wix fingerprints", () => {
    const d = detectSitePlatform({ html: page('<link href="https://static.wixstatic.com/a.css"><script src="https://static.parastorage.com/x.js"></script>') });
    expect(d.platform).toBe("wix");
    expect(d.confident).toBe(true);
    expect(d.evidence).toEqual(["static.wixstatic.com", "static.parastorage.com"]);
  });
  it("is not confident on a single Squarespace marker", () => {
    const d = detectSitePlatform({ html: page("<script>Static.SQUARESPACE_CONTEXT = {}</script>") });
    expect(d).toMatchObject({ platform: "squarespace", confident: false });
  });
  it("finds Webflow, Duda and GoDaddy", () => {
    expect(detectSitePlatform({ html: page("", '<div data-wf-site="abc">') }).platform).toBe("webflow");
    expect(detectSitePlatform({ html: page('<img src="https://irp.cdn-website.com/a.png">') }).platform).toBe("duda");
    expect(detectSitePlatform({ html: page('<img src="https://img1.wsimg.com/a.png">') }).platform).toBe("godaddy");
  });
  it("uses headers", () => {
    const d = detectSitePlatform({ html: page('<link href="https://cdn.shopify.com/s/x.css">'), headers: { "x-shopid": "123" } });
    expect(d).toMatchObject({ platform: "shopify", confident: true });
    expect(d.evidence).toContain("header x-shopid");
  });
  it("returns unknown for plain HTML", () => {
    expect(detectSitePlatform({ html: page("<title>Hi</title>", "<p>hello</p>") })).toEqual({ platform: "unknown", evidence: [], confident: false });
  });
  it("lets the generator beat fingerprints", () => {
    const d = detectSitePlatform({ html: page('<meta name="generator" content="WordPress 6"><link href="https://static.wixstatic.com/x">') });
    expect(d.platform).toBe("wordpress");
  });
  it("caps evidence at 5 entries of at most 120 characters", () => {
    const d = detectSitePlatform({ html: page('<a href="/wp-content/"></a><a href="/wp-includes/"></a><a href="wp-json"></a>'), headers: { "x-powered-by": "WP Engine" } });
    expect(d.evidence.length).toBeLessThanOrEqual(5);
    const long = detectSitePlatform({ html: page(`<meta name="generator" content="WordPress ${"x".repeat(400)}">`) });
    expect(long.evidence[0]!.length).toBeLessThanOrEqual(120);
  });
  it("reads only the first 300 KB for meta tags and finishes on a 5 MB page", () => {
    const filler = "<p>x</p>".repeat(700_000);
    const late = `${filler}<meta name="generator" content="WordPress 6">`;
    expect(late.length).toBeGreaterThan(5_000_000);
    const started = Date.now();
    expect(detectSitePlatform({ html: late }).platform).toBe("unknown");
    expect(Date.now() - started).toBeLessThan(2000);
    expect(detectSitePlatform({ html: `<meta name="generator" content="WordPress 6">${filler}` }).platform).toBe("wordpress");
  });
});

function response(status: number, type: string | null, body: string, headers: Record<string, string> = {}) {
  const h = new Headers(headers);
  if (type) h.set("content-type", type);
  return { url: "https://example.test/", status, headers: h, body: Buffer.from(body) };
}

describe("fetchSiteFingerprint", () => {
  it("is unreachable for null, 404 and non-text responses", async () => {
    expect((await fetchSiteFingerprint("https://example.test", async () => null)).reachable).toBe(false);
    expect((await fetchSiteFingerprint("https://example.test", async () => response(404, "text/html", "x"))).reachable).toBe(false);
    const image = await fetchSiteFingerprint("https://example.test", async () => response(200, "image/png", "x"));
    expect(image).toMatchObject({ reachable: false, html: null, detection: { platform: "unknown" } });
  });
  it("never throws", async () => {
    const r = await fetchSiteFingerprint("https://example.test", async () => { throw new Error("boom"); });
    expect(r.reachable).toBe(false);
  });
  it("detects from a 200 text/html page and its headers", async () => {
    const r = await fetchSiteFingerprint("https://example.test", async () => response(200, "text/html; charset=utf-8", page('<meta name="generator" content="Squarespace">'), { server: "Squarespace" }));
    expect(r).toMatchObject({ reachable: true, finalUrl: "https://example.test/", detection: { platform: "squarespace" } });
    const headers = await fetchSiteFingerprint("https://example.test", async () => response(200, "text/html", page(""), { "x-shopid": "9" }));
    expect(headers.detection.evidence).toEqual(["header x-shopid"]);
  });
});
