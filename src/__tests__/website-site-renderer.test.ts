import { hostedRedirectTarget } from "@/products/websites/site-routing";
import { describe, expect, it, vi } from "vitest";
import { siteDocumentSchema, siteDocumentHash, type SiteDocument } from "@/products/websites/site-document";
import { buildSiteDocumentExport, renderSiteDocumentHtml } from "@/products/websites/site-export";
import { SITE_PALETTES, safeSiteHref, siteThemeVariables } from "@/products/websites/site-render-tree";
import { safeJsonLd, siteDocumentJsonLd, siteFaqJsonLd, siteDocumentMetadata, tenantCanonicalOrigin } from "@/products/websites/site-seo";
import type { TenantConfig } from "@/lib/types";

const nodes = [
  ["Header", "logo-left", { brand: "Example law firm", links: [{ label: "About", href: "/about" }] }],
  ["Hero", "split", { title: "Counsel for your next decision", body: "A sourced description.", image: "photo", cta: { label: "Contact us", href: "/contact" } }],
  ["TrustStrip", "badges", { items: [{ label: "Owner-confirmed information" }] }],
  ["ServiceGrid", "cards", { items: [{ title: "Estate planning", body: "Plan your next step.", href: "/services/estate" }] }],
  ["ServiceDetail", "standard", { title: "Estate planning", body: "Discuss your options." }],
  ["Story", "long-form", { title: "Our story", body: "The owner's words." }],
  ["TeamGrid", "cards", { people: [{ name: "[Attorney name]", role: "Attorney" }] }],
  ["Testimonials", "carousel", { items: [{ quote: "A quoted review.", name: "[Reviewer]" }] }],
  ["ReviewSummary", "stars-and-count", { rating: 4, count: 3 }],
  ["Faq", "accordion", { items: [{ question: "How do I contact you?", answer: "Use the inquiry form." }] }],
  ["Stats", "row", { items: [{ value: "[Number]", label: "[Verified measure]" }] }],
  ["Gallery", "grid", { images: [{ assetId: "photo", caption: "The firm's office" }] }],
  ["Hours", "table", { rows: [{ day: "Monday", hours: "9:00–17:00" }] }],
  ["Map", "static", { image: "photo", address: "[Office address]", href: "https://maps.example/directions" }],
  ["Locations", "list", { items: [{ name: "Buffalo office", address: "[Office address]", phone: "+1 716 555 0100" }] }],
  ["Cta", "band", { title: "Let's talk", cta: { label: "Inquire", href: "/contact" } }],
  ["InquiryForm", "card", { title: "Send an inquiry" }],
  ["Booking", "inline", { title: "Choose a time" }],
  ["PageHeader", "standard", { title: "About the firm" }],
  ["RichText", "standard", { text: "### A heading\n\nA paragraph.\n\n<script>alert(1)</script>" }],
  ["Footer", "columns", { text: "Example law firm", columns: [{ title: "Explore", links: [{ label: "Contact", href: "/contact" }] }] }],
] as const;
function fixture(): SiteDocument {
  return siteDocumentSchema.parse({ version: 2, siteName: "Example law firm", theme: { palette: "light", typeScale: "standard" }, pages: [{ path: "/", title: "Example law firm", description: "A law firm in Buffalo.", root: "root" }, { path: "/about", title: "About", description: "Meet the firm.", root: "about" }], nodes: { root: { id: "root", type: "Section", variant: "container", props: {}, children: nodes.map((_, i) => `node${i}`) }, about: { id: "about", type: "PageHeader", variant: "standard", props: { title: "About the firm" } }, ...Object.fromEntries(nodes.map(([type, variant, props], i) => [`node${i}`, { id: `node${i}`, type, variant, props }])) }, assets: { photo: { url: "/media/example/photo.jpg", alt: "Firm office", width: 640, height: 480 } }, facts: {}, redirects: [{ from: "/old-about", to: "/about" }], provenance: { composer: "rules" } });
}

describe("v2 website catalog and static export", () => {
  it("only adds ReserveAction for an enabled connected booking page", () => {
    const document=fixture();
    document.capabilities={baseUrl:"https://app.example",tenant:"example",booking:{capabilityId:"booking-1",version:1,range:{from:"2026-11-01T00:00:00Z",to:"2026-11-30T00:00:00Z"}}};
    vi.stubEnv("STRELVA_BOOKING_AGENTS","0"); expect(siteDocumentJsonLd(document,"https://example.test")).not.toHaveProperty("potentialAction");
    vi.stubEnv("STRELVA_BOOKING_AGENTS","1"); expect(siteDocumentJsonLd(document,"https://example.test")).toMatchObject({potentialAction:{"@type":"ReserveAction",target:"https://example.test/"}});
    document.capabilities=undefined; expect(siteDocumentJsonLd(document,"https://example.test")).not.toHaveProperty("potentialAction");
    vi.unstubAllEnvs();
  });

  it("renders all 22 catalog entries with escaped text and no arbitrary markup", () => {
    const document = fixture();
    const html = renderSiteDocumentHtml(document, "/", { preview: true });
    for (const type of ["Section", ...nodes.map(([type]) => type)]) expect(html).toContain(`data-component="${type}"`);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script");
    expect(html).toContain('name="robots" content="noindex,nofollow"');
    expect(html).toContain(`name="strelva-site-hash" content="${siteDocumentHash(document)}"`);
    expect(html).toContain("<details>");
    expect(html).toContain('scope="row"');
    expect(html).not.toContain("<iframe");
  });
  it("renders every empty component as nothing", () => {
    const document = fixture();
    for (const node of Object.values(document.nodes)) { node.props = {}; node.children = []; }
    document.assets = {};
    document.theme.logo = undefined;
    const html = renderSiteDocumentHtml(document, "/", { preview: true });
    expect(html).not.toContain("data-component");
  });
  it("preview never loads capabilities or submits a form, even with active grants", () => {
    const document = fixture();
    document.capabilities = { baseUrl: "https://app.strelva.com", tenant: "example", inquiry: { capabilityId: "main", version: 1 }, booking: { capabilityId: "calendar", version: 1, range: { from: "2026-10-01T00:00:00Z", to: "2026-11-01T00:00:00Z" } } };
    const html = renderSiteDocumentHtml(document, "/", { preview: true });
    expect(html).toContain("<fieldset disabled>");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("data-strelva-config");
    expect(html).not.toContain("capability-runtime.mjs");
    expect(renderSiteDocumentHtml(document, "/", { tenant: "other-business" })).not.toContain("data-strelva-config");
    expect(renderSiteDocumentHtml(document, "/", { tenant: "example" })).toContain("data-strelva-config");
  });
  it("refuses incomplete image exports and includes exact local image bytes", () => {
    const document = fixture();
    const options = { workspaceId: "workspace", workId: "work", revision: 2, canonicalUrl: "https://example.strelva.com" };
    expect(() => buildSiteDocumentExport(document, options)).toThrow("missing from the export");
    const result = buildSiteDocumentExport(document, { ...options, assetFiles: [{ assetId: "photo", path: "assets/office.jpg", content: Buffer.from("fixture image bytes").toString("base64") }] });
    expect(result.contentHash).toBe(siteDocumentHash(document));
    expect(result.files.map(item => item.path)).toEqual(expect.arrayContaining(["index.html", "about/index.html", "site-document.json", "sitemap.xml", "robots.txt", "redirects.json", "export-manifest.json"]));
    expect(result.binaryFiles[0]?.bytes).toBe(19);
    expect(result.files.find(item => item.path === "index.html")?.content).toContain('src="/assets/office.jpg"');
    expect(result.previewHtml).toContain("noindex,nofollow");
    const portable = buildSiteDocumentExport(document, { ...options, tenant: "example", assetFiles: [{ assetId: "photo", path: "assets/office.jpg", content: Buffer.from("fixture image bytes").toString("base64") }] });
    expect(portable.files.find(item => item.path === "index.html")?.content).toContain('data-site-api-origin="https://example.strelva.com"');
    expect(portable.files.map(item => item.path)).toContain("website-generation/site-lead-runtime.mjs");
    document.assets.photo!.contentHash = "a".repeat(64);
    expect(() => buildSiteDocumentExport(document, { ...options, assetFiles: [{ assetId: "photo", path: "assets/office.jpg", content: "AA==" }] })).toThrow("recorded content hash");
    document.assets.photo!.contentHash = undefined;
    expect(() => buildSiteDocumentExport(document, { ...options, assetFiles: [{ assetId: "photo", path: "assets/../credentials", content: "AA==" }] })).toThrow("missing from the export");
  });
  it("resolves old paths only to a known document page", () => {
    const document = fixture();
    expect(hostedRedirectTarget(document, "/old-about")).toBe("/about");
    expect(hostedRedirectTarget(document, "/missing")).toBeNull();
    document.redirects = [{ from: "/old-about", to: "/loop" }, { from: "/loop", to: "/old-about" }];
    expect(hostedRedirectTarget(document, "/old-about")).toBeNull();
    document.redirects = [{ from: "/old-about", to: "https://other.example" }];
    expect(hostedRedirectTarget(document, "/old-about")).toBeNull();
  });
  it("fails unknown pages and rejects unsafe protocols", () => {
    expect(() => renderSiteDocumentHtml(fixture(), "/missing")).toThrow("no page");
    for (const value of ["javascript:alert(1)", "data:text/html,hello", "//attacker.example", "/\\attacker.example", "https://example.com\n"]) expect(safeSiteHref(value)).toBeNull();
    expect(safeSiteHref("/about")).toBe("/about");
  });
  it("contrast-checks accents and all supported palettes", () => {
    const document = fixture();
    document.theme.accent = "#ffffff";
    expect(siteThemeVariables(document)["--site-accent"]).toBe(SITE_PALETTES.light.accent);
    document.theme.accent = "#000000";
    expect(siteThemeVariables(document)["--site-accent"]).toBe("#000000");
    for (const palette of Object.keys(SITE_PALETTES) as Array<keyof typeof SITE_PALETTES>) { document.theme.palette = palette; expect(siteThemeVariables(document)["--site-text"]).toBe(SITE_PALETTES[palette].text); }
  });
});
describe("tenant-isolated website SEO", () => {
  it("uses each trusted tenant domain and never the global site URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://wrong-business.example");
    const first = tenantCanonicalOrigin("first", { productionDomain: "first.example" } as TenantConfig);
    const second = tenantCanonicalOrigin("second", { productionDomain: "second.example" } as TenantConfig);
    expect(first).toBe("https://first.example");
    expect(second).toBe("https://second.example");
    expect(tenantCanonicalOrigin("third", null)).toBe("https://third.strelva.com");
    expect(siteDocumentMetadata(fixture(), "/about", first).alternates?.canonical).toBe("https://first.example/about");
    expect(siteDocumentMetadata(fixture(), "/", second, true).robots).toEqual({ index: false, follow: false });
    vi.unstubAllEnvs();
  });
  it("only emits FAQ answers that are visible and backed by the node's verified facts", () => {
    const document = fixture();
    const faq = Object.values(document.nodes).find(node => node.type === "Faq")!;
    expect(siteFaqJsonLd(document)).toBeNull();
    document.facts.contact = { text: "Use the inquiry form.", kind: "contact", highRisk: false, origin: "owner_stated", sources: [] };
    faq.factIds = ["contact"];
    expect(siteFaqJsonLd(document)?.mainEntity).toEqual([{ "@type": "Question", name: "How do I contact you?", acceptedAnswer: { "@type": "Answer", text: "Use the inquiry form." } }]);
    expect(siteFaqJsonLd(document, "/about")).toBeNull();
    if (faq.type === "Faq") faq.props.items![0]!.answer = "We guarantee a successful case.";
    expect(siteFaqJsonLd(document)).toBeNull();
  });
  it("uses supported business subtype without invented prices or unproven ratings", () => {
    const schema = siteDocumentJsonLd(fixture(), "https://example.strelva.com", "law firm");
    expect(schema["@type"]).toBe("LegalService");
    expect(schema.url).toBe("https://example.strelva.com");
    expect(schema.subjectOf).toMatchObject({ "@type": "WebSite", url: "https://example.strelva.com" });
    expect(schema).not.toHaveProperty("priceRange");
    expect(schema).not.toHaveProperty("aggregateRating");
    expect(safeJsonLd({ name: "</script><script>alert(1)</script>" })).not.toContain("<");
  });
});
