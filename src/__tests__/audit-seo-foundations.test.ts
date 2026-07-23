import { describe, expect, it } from "vitest";
import * as cheerio from "cheerio";
import { checkSeoFoundations } from "../lib/audit/modules/seo-foundations";
import type { AuditContext } from "../lib/audit/context";
import { computeVisibleText } from "../lib/audit/checks";

// ---------------------------------------------------------------------------
// Helper — build an AuditContext from HTML + optional well-known files
// ---------------------------------------------------------------------------
function makeContext(opts: {
  html: string;
  robotsTxt?: string | null;
  sitemapXml?: string | null;
}): AuditContext {
  return {
    url: "https://example.com",
    html: opts.html,
    $: cheerio.load(opts.html),
    visibleText: computeVisibleText(cheerio.load(opts.html)),
    fetchOk: true,
    headers: new Headers(),
    robotsTxt: opts.robotsTxt ?? null,
    sitemapXml: opts.sitemapXml ?? null,
    llmsTxt: null,
  };
}

function findCheck(checks: { name: string }[], name: string) {
  const c = checks.find((x) => x.name === name);
  if (!c) throw new Error(`Check "${name}" not found`);
  return c as { name: string; status: string; score: number; message: string };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("checkSeoFoundations", () => {
  it("scores a well-configured site high", () => {
    const html = `<!doctype html>
      <html lang="en">
        <head>
          <title>Buffalo HVAC Repair and Furnace Service Experts</title>
          <meta name="description" content="Fast, reliable HVAC repair and furnace service across Buffalo NY. Call today for same-day appointments and honest pricing." />
          <link rel="canonical" href="https://example.com/" />
        </head>
        <body>
          <h1>Buffalo HVAC Repair</h1>
          <p>${"We service furnaces, air conditioners, and heat pumps across the region. ".repeat(20)}</p>
        </body>
      </html>`;
    const robotsTxt = "User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml";
    const sitemapXml =
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset><url><loc>https://example.com/</loc></url></urlset>';

    const result = checkSeoFoundations(makeContext({ html, robotsTxt, sitemapXml }));

    expect(result.name).toBe("SEO Foundations");
    expect(result.slug).toBe("seo");
    expect(result.weight).toBe(0);
    expect(result.score).toBeGreaterThanOrEqual(90);

    // Every check should pass
    for (const check of result.checks) {
      expect(check.status).toBe("pass");
    }

    expect(findCheck(result.checks, "Crawlers allowed").status).toBe("pass");
    expect(findCheck(result.checks, "Title tag").status).toBe("pass");
  });

  it("scores a broken site low and flags blocked crawlers as critical", () => {
    const html = `<!doctype html>
      <html>
        <head></head>
        <body><div id="root"></div></body>
      </html>`;
    // Blanket block of every crawler, and no sitemap, no title.
    const robotsTxt = "User-agent: *\nDisallow: /";

    const result = checkSeoFoundations(
      makeContext({ html, robotsTxt, sitemapXml: null })
    );

    expect(result.score).toBeLessThan(50);

    // Critical: blocking robots flagged as a failure
    const crawlers = findCheck(result.checks, "Crawlers allowed");
    expect(crawlers.status).toBe("fail");
    expect(crawlers.score).toBe(0);
    expect(crawlers.message.toLowerCase()).toContain("blocking");

    // No title -> fail
    expect(findCheck(result.checks, "Title tag").status).toBe("fail");
    // No sitemap -> warn
    expect(findCheck(result.checks, "XML sitemap").status).toBe("warn");
    // SPA shell with no server content -> server-rendered warns
    expect(findCheck(result.checks, "Server-rendered content").status).toBe(
      "warn"
    );
  });
});
