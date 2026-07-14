import { describe, expect, it } from "vitest";
import * as cheerio from "cheerio";
import { checkContent } from "../lib/audit/modules/content";
import type { AuditContext } from "../lib/audit/context";

function makeCtx(html: string, url = "https://example.com"): AuditContext {
  return {
    url,
    html,
    $: cheerio.load(html),
    headers: new Headers(),
    robotsTxt: null,
    sitemapXml: null,
    llmsTxt: null,
  };
}

// Build a long body so visible word count clears 800 words.
const filler = Array.from({ length: 200 }, (_, i) => `quality content phrase ${i}`).join(" ");

const goodHtml = `<!doctype html>
<html lang="en">
<head><title>Good Page</title></head>
<body>
  <nav>
    <a href="/about">About</a>
    <a href="/services">Services</a>
    <a href="/contact">Contact</a>
    <a href="/blog">Blog</a>
    <a href="/pricing">Pricing</a>
    <a href="/team">Team</a>
    <a href="/faq">FAQ</a>
    <a href="/gallery">Gallery</a>
    <a href="/locations">Locations</a>
    <a href="/reviews">Reviews</a>
  </nav>
  <main>
    <h1>Welcome to Our Local Business</h1>
    <h2>Our Services</h2>
    <h2>Why Choose Us</h2>
    <h3>Our Team</h3>
    <p>We help local customers every day. ${filler}.</p>
    <ul><li>Fast service</li><li>Fair pricing</li><li>Friendly staff</li></ul>
    <ol><li><a href="tel:+15551234567">Call us</a></li><li><a href="/book">Book a time</a></li><li>Get results</li></ol>
    <img src="/a.jpg" alt="Our storefront" />
    <img src="/b.jpg" alt="Our team at work" />
    <p>Ready to begin? <a href="/contact">Contact us</a> today to get started.</p>
  </main>
</body>
</html>`;

const thinHtml = `<!doctype html>
<html>
<head><title>Thin</title></head>
<body>
  <p>This is a very short page with almost no content at all on it here.</p>
</body>
</html>`;

describe("checkContent", () => {
  it("returns the Content Quality category shape", () => {
    const result = checkContent(makeCtx(goodHtml));
    expect(result.name).toBe("Content Quality");
    expect(result.slug).toBe("content");
    expect(result.weight).toBe(0);
    expect(result.checks.length).toBeGreaterThan(0);
    for (const c of result.checks) {
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(100);
      const expected =
        c.score >= 80 ? "pass" : c.score >= 50 ? "warn" : "fail";
      expect(c.status).toBe(expected);
    }
  });

  it("scores a rich page high", () => {
    const result = checkContent(makeCtx(goodHtml));
    expect(result.score).toBeGreaterThanOrEqual(80);

    const byName = Object.fromEntries(result.checks.map((c) => [c.name, c]));
    expect(byName["Enough content"].status).toBe("pass");
    expect(byName["Heading structure"].status).toBe("pass");
    expect(byName["Key pages linked"].status).toBe("pass");
    expect(byName["Image alt coverage"].status).toBe("pass");
    expect(byName["Clear calls to action"].status).toBe("pass");
  });

  it("scores a thin page low", () => {
    const result = checkContent(makeCtx(thinHtml));
    expect(result.score).toBeLessThan(50);

    const byName = Object.fromEntries(result.checks.map((c) => [c.name, c]));
    expect(byName["Enough content"].status).toBe("fail");
    expect(byName["Heading structure"].status).toBe("fail");
    expect(byName["Key pages linked"].status).toBe("fail");
  });
});
