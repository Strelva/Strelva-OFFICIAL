import { describe, expect, it } from "vitest";
import * as cheerio from "cheerio";
import { checkAiReadability } from "../lib/audit/modules/ai-readability";
import type { AuditContext } from "../lib/audit/context";

function makeContext(
  html: string,
  overrides: Partial<AuditContext> = {}
): AuditContext {
  return {
    url: "https://example.com",
    html,
    $: cheerio.load(html),
    headers: new Headers(),
    robotsTxt: null,
    sitemapXml: null,
    llmsTxt: null,
    ...overrides,
  };
}

const GOOD_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <title>Buffalo Plumbing Co | Trusted Local Plumbers</title>
    <meta property="og:site_name" content="Buffalo Plumbing Co" />
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "LocalBusiness",
          "name": "Buffalo Plumbing Co",
          "telephone": "+1-716-555-0100",
          "priceRange": "$$",
          "areaServed": "Buffalo, NY",
          "foundingDate": "2008",
          "url": "https://example.com",
          "image": "https://example.com/logo.png",
          "openingHours": "Mo-Fr 08:00-18:00",
          "address": {
            "@type": "PostalAddress",
            "streetAddress": "123 Main St",
            "addressLocality": "Buffalo",
            "addressRegion": "NY",
            "postalCode": "14201",
            "addressCountry": "US"
          },
          "sameAs": [
            "https://en.wikipedia.org/wiki/Buffalo_Plumbing",
            "https://www.linkedin.com/company/buffalo-plumbing",
            "https://www.facebook.com/buffaloplumbing"
          ]
        },
        {
          "@type": "FAQPage",
          "mainEntity": [
            { "@type": "Question", "name": "Do you offer emergency service?", "acceptedAnswer": { "@type": "Answer", "text": "Yes, 24/7." } },
            { "@type": "Question", "name": "What areas do you serve?", "acceptedAnswer": { "@type": "Answer", "text": "All of Buffalo." } }
          ]
        }
      ]
    }
    </script>
  </head>
  <body>
    <footer><span class="brand">Buffalo Plumbing Co</span></footer>
    <main>
      <h1>Buffalo Plumbing Co</h1>
      <p>${"We are a trusted, family-owned plumbing company serving Buffalo and the surrounding region since 2008. Our licensed plumbers handle leaks, water heaters, drain cleaning, repiping, and emergency calls around the clock. ".repeat(10)}</p>
    </main>
  </body>
</html>`;

const BAD_HTML = `<!DOCTYPE html>
<html>
  <head><title>Loading</title></head>
  <body>
    <div id="root"></div>
  </body>
</html>`;

describe("checkAiReadability", () => {
  it("returns a well-formed AI Readability category", () => {
    const result = checkAiReadability(makeContext(GOOD_HTML, { llmsTxt: "# Buffalo Plumbing\nLocal plumbers." }));
    expect(result.name).toBe("AI Readability");
    expect(result.slug).toBe("ai-readability");
    expect(result.weight).toBe(0);
    expect(result.checks.length).toBeGreaterThanOrEqual(7);
  });

  it("scores a complete, AI-ready site high", () => {
    const result = checkAiReadability(
      makeContext(GOOD_HTML, { llmsTxt: "# Buffalo Plumbing\nWe are local plumbers in Buffalo, NY." })
    );

    const byName = Object.fromEntries(result.checks.map((c) => [c.name, c]));

    expect(byName["Structured data present"].status).toBe("pass");
    expect(byName["Business schema valid"].status).toBe("pass");
    expect(byName["AI-answer content (FAQ/HowTo)"].score).toBeGreaterThanOrEqual(50);
    // sameAs authority = 3 platforms (30) + Wikipedia KG (+20) = 50 (warn by convention),
    // and the KG signal is recognized in the message.
    expect(byName["Entity authority (sameAs)"].score).toBeGreaterThanOrEqual(50);
    expect(byName["Entity authority (sameAs)"].message).toMatch(/Wikipedia\/Wikidata/);
    expect(byName["Plain-text readable by AI"].status).toBe("pass");
    expect(byName["Single clear business name"].status).toBe("pass");
    expect(byName["llms.txt for AI agents"].status).toBe("pass");

    // Good case clears 60 comfortably; OWSH's authority/entity sub-scores are
    // deliberately conservative, so a strong site lands in the mid-60s+, well
    // above the < 40 bad case.
    expect(result.score).toBeGreaterThanOrEqual(60);
  });

  it("scores a normal local site (FAQ + 2 socials, no Wikipedia/HowTo) fairly", () => {
    // The ICP case: a good local business declares a LocalBusiness + FAQPage and
    // links two real profiles (Facebook + Instagram). It has no Wikipedia entry,
    // no HowTo schema, and no 5-platform social footprint — signals it can never
    // realistically have. Recalibrated ai-readability must credit this as strong,
    // and 2 declared profiles must pass (not fail) the entity-authority check.
    const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <title>McLear's Cottage Colony | Black Lake, NY</title>
    <meta property="og:site_name" content="McLear's Cottage Colony" />
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "LodgingBusiness",
      "name": "McLear's Cottage Colony",
      "telephone": "+1-315-375-6508",
      "priceRange": "$$",
      "areaServed": "Black Lake, NY",
      "url": "https://example.com",
      "image": "https://example.com/logo.png",
      "sameAs": [
        "https://www.facebook.com/mclears",
        "https://www.instagram.com/mclears"
      ]
    }
    </script>
    <script type="application/ld+json">
    { "@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
      { "@type": "Question", "name": "What is check-in?", "acceptedAnswer": { "@type": "Answer", "text": "1 PM." } },
      { "@type": "Question", "name": "Do you allow pets?", "acceptedAnswer": { "@type": "Answer", "text": "Yes, leashed." } }
    ] }
    </script>
  </head>
  <body>
    <footer><span>McLear's Cottage Colony</span></footer>
    <main>
      <h1>McLear's Cottage Colony</h1>
      <p>${"A family-owned cottage colony on Black Lake since the 1920s, with lakefront cottages, boat rentals, and world-class bass fishing for every kind of trip. ".repeat(8)}</p>
    </main>
  </body>
</html>`;

    const result = checkAiReadability(makeContext(html));
    const byName = Object.fromEntries(result.checks.map((c) => [c.name, c]));

    // FAQ schema is a pass on its own; 2 declared profiles pass entity authority.
    expect(byName["AI-answer content (FAQ/HowTo)"].status).toBe("pass");
    expect(byName["Entity authority (sameAs)"].status).not.toBe("fail");
    // A genuinely AI-ready local site should not be stuck in the 60s (this
    // minimal fixture, with no llms.txt and only 2 socials, lands in the mid-70s;
    // the same site live with 3 profiles scores mid-80s).
    expect(result.score).toBeGreaterThanOrEqual(72);
  });

  it("scores a no-schema SPA shell with no llms.txt low", () => {
    const result = checkAiReadability(makeContext(BAD_HTML)); // llmsTxt null by default

    const byName = Object.fromEntries(result.checks.map((c) => [c.name, c]));

    expect(byName["Structured data present"].status).toBe("fail");
    expect(byName["Business schema valid"].status).toBe("fail");
    expect(byName["AI-answer content (FAQ/HowTo)"].status).toBe("fail");
    expect(byName["Entity authority (sameAs)"].status).toBe("fail");
    // SPA root + < 100 words => "AI crawlers can't execute your JS"
    expect(byName["Plain-text readable by AI"].status).toBe("fail");
    expect(byName["Plain-text readable by AI"].message).toMatch(/can't execute your JavaScript/i);
    expect(byName["llms.txt for AI agents"].status).not.toBe("pass");

    expect(result.score).toBeLessThan(40);
  });

  it("detects the llms.txt signal independently", () => {
    const withLlms = checkAiReadability(makeContext(BAD_HTML, { llmsTxt: "# Site" }));
    const llmsCheck = withLlms.checks.find((c) => c.name === "llms.txt for AI agents");
    expect(llmsCheck?.status).toBe("pass");
    expect(llmsCheck?.score).toBe(100);
  });
});
