import { describe, expect, it, vi } from "vitest";
import { publishedWebsiteUrl, readPublishedWebsiteContent } from "@/products/websites/content-readback";

const tenant = { productionDomain: "example.test", siteUrl: "https://preview.example.test/" };
const now = () => new Date("2026-10-06T12:00:00.000Z");
const expected = { headline: "Buffalo & beyond", ctaText: "Book a call", ctaLink: "/book", logoUrl: "/logo.png" };

describe("published website content read-back", () => {
  it("uses the production homepage rather than a preview URL or credentials", () => {
    expect(publishedWebsiteUrl(tenant)).toBe("https://example.test/");
    expect(publishedWebsiteUrl({ productionDomain: "https://example.test/" })).toBe("https://example.test/");
    expect(publishedWebsiteUrl({ siteUrl: "https://example.test/about?preview=1" })).toBe("https://example.test/");
    expect(publishedWebsiteUrl({ siteUrl: "https://secret@example.test/" })).toBeNull();
    expect(publishedWebsiteUrl({ siteUrl: "file:///etc/passwd" })).toBeNull();
  });

  it("confirms rendered text, links and optimized images using bounded safe transport", async () => {
    const fetch = vi.fn().mockResolvedValue('<html><body><h1>Buffalo &amp; <span>beyond</span></h1><a href="/book">Book a call</a><img src="/_next/image?url=%2Flogo.png&amp;w=128&amp;q=75"></body></html>');
    const result = await readPublishedWebsiteContent({ tenant, section: "hero", expected }, { fetch, now });
    expect(result).toMatchObject({ ok: true, status: "verified", checkedValues: 4, missingFields: [], url: "https://example.test/", checkedAt: now().toISOString() });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith("https://example.test/", { timeoutMs: 8000, maxBytes: 2_000_000, maxRedirects: 5 });
  });

  it("does not mistake serialized app data or hidden content for a live section", async () => {
    const fetch = vi.fn().mockResolvedValue('<body><h1>Earlier headline</h1><script>Buffalo & beyond</script><div hidden>Buffalo &amp; beyond</div><div aria-hidden="true">Buffalo &amp; beyond</div><template>Buffalo &amp; beyond</template></body>');
    const result = await readPublishedWebsiteContent({ tenant, section: "hero", expected: { headline: "Buffalo & beyond" } }, { fetch, now });
    expect(result).toMatchObject({ ok: false, status: "mismatch", missingFields: ["headline"] });
    expect(result.detail).not.toContain("Buffalo");
  });

  it("finds missing nested list values without copying their content into diagnostics", async () => {
    const fetch = vi.fn().mockResolvedValue("<body><h2>Consultations</h2><p>First service</p></body>");
    const result = await readPublishedWebsiteContent({ tenant, section: "services", expected: { headline: "Consultations", services: [{ id: "one", name: "First service" }, { id: "two", name: "Sensitive new service" }] } }, { fetch, now });
    expect(result).toMatchObject({ ok: false, status: "mismatch", checkedValues: 3, missingFields: ["services[1].name"] });
    expect(JSON.stringify(result)).not.toContain("Sensitive new service");
  });

  it.each([null, new Error("timeout")])("keeps a read-back failure separate from accepted publication: %s", async outcome => {
    const fetch = outcome instanceof Error ? vi.fn().mockRejectedValue(outcome) : vi.fn().mockResolvedValue(outcome);
    const result = await readPublishedWebsiteContent({ tenant, section: "hero", expected }, { fetch, now });
    expect(result).toMatchObject({ ok: false, status: "unreachable", checkedValues: 0 });
    expect(result.detail).toContain("publish remains accepted");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("leaves visual-only and missing-routing changes unverified without fetching", async () => {
    const fetch = vi.fn();
    expect(await readPublishedWebsiteContent({ tenant, section: "theme", expected: { colors: { cream: "#ffffff" } } }, { fetch, now })).toMatchObject({ ok: false, status: "unverified" });
    expect(await readPublishedWebsiteContent({ tenant: {}, section: "hero", expected }, { fetch, now })).toMatchObject({ ok: false, status: "unverified", url: null });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not confirm a link target merely because the URL appears in body text", async () => {
    const fetch = vi.fn().mockResolvedValue('<body><a href="/old-book">Book a call</a><p>/book</p></body>');
    expect(await readPublishedWebsiteContent({ tenant, section: "hero", expected: { ctaText: "Book a call", ctaLink: "/book" } }, { fetch, now })).toMatchObject({ ok: false, status: "mismatch", missingFields: ["ctaLink"] });
  });

  it("reads inline background images but excludes inline-hidden content", async () => {
    const fetch = vi.fn().mockResolvedValue('<body><section style="background-image: url(\'/hero.jpg\')"><h1>New headline</h1></section><p style="display: none">Secret replacement</p></body>');
    expect(await readPublishedWebsiteContent({ tenant, section: "hero", expected: { headline: "New headline", backgroundImageUrl: "/hero.jpg" } }, { fetch, now })).toMatchObject({ ok: true, status: "verified", checkedValues: 2 });
    expect(await readPublishedWebsiteContent({ tenant, section: "hero", expected: { headline: "Secret replacement" } }, { fetch, now })).toMatchObject({ ok: false, status: "mismatch" });
  });
});
