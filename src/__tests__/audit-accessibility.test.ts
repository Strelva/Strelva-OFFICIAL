import { describe, expect, it } from "vitest";
import * as cheerio from "cheerio";
import { checkAccessibility } from "../lib/audit/modules/accessibility";
import type { AuditContext } from "../lib/audit/context";

/** Build a minimal AuditContext from an HTML string (no network). */
function ctxFromHtml(html: string): AuditContext {
  const $ = cheerio.load(html);
  return {
    url: "https://example.com",
    html,
    $,
    headers: new Headers(),
    robotsTxt: null,
    sitemapXml: null,
    llmsTxt: null,
  };
}

const GOOD_HTML = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <title>Buffalo HVAC Repair and Installation Services</title>
  </head>
  <body>
    <a href="#main">Skip to main content</a>
    <header><nav><a href="/about">About us</a></nav></header>
    <main id="main">
      <h1>Heating and Cooling Experts</h1>
      <h2>Our Services</h2>
      <h3>Furnace Repair</h3>
      <img src="/team.jpg" alt="Our technicians installing a furnace" />
      <form>
        <label for="email">Email address</label>
        <input id="email" type="email" name="email" />
      </form>
      <button>Request a quote</button>
    </main>
    <footer>Contact us at 716-555-0100</footer>
  </body>
</html>
`;

const BAD_HTML = `
<!DOCTYPE html>
<html>
  <head></head>
  <body>
    <div>
      <h1>Welcome</h1>
      <h4>Skipped down to a level 4</h4>
      <img src="/a.jpg" />
      <img src="/b.jpg" />
      <a href="/x">click here</a>
      <a href="/y">read here</a>
      <form>
        <input type="text" name="name" />
      </form>
      <button></button>
    </div>
  </body>
</html>
`;

describe("checkAccessibility", () => {
  it("scores a clean, accessible page high", () => {
    const result = checkAccessibility(ctxFromHtml(GOOD_HTML));

    expect(result.name).toBe("Accessibility");
    expect(result.slug).toBe("a11y");
    expect(result.weight).toBe(0);
    expect(result.score).toBeGreaterThanOrEqual(80);

    // Core good-state checks should pass.
    const byName = Object.fromEntries(result.checks.map((c) => [c.name, c]));
    expect(byName["Document Language"].status).toBe("pass");
    expect(byName["Page Title"].status).toBe("pass");
    expect(byName["Image Alt Text"].status).toBe("pass");
    expect(byName["Form Labels"].status).toBe("pass");
    expect(byName["Heading Structure"].status).toBe("pass");
    expect(byName["Landmark Regions"].status).toBe("pass");
  });

  it("scores a broken page low and applies the critical cap", () => {
    const result = checkAccessibility(ctxFromHtml(BAD_HTML));

    // Multiple critical issues present (missing lang, missing alt, unlabeled
    // field, empty button) so the score is capped at 60 by the OWSH rule.
    expect(result.score).toBeLessThanOrEqual(60);
    expect(result.score).toBeLessThan(50);

    const byName = Object.fromEntries(result.checks.map((c) => [c.name, c]));

    // Missing lang attribute -> critical fail.
    expect(byName["Document Language"].status).toBe("fail");
    expect(byName["Document Language"].score).toBe(0);

    // Two images with no alt -> fail with details.
    expect(byName["Image Alt Text"].status).toBe("fail");
    expect(byName["Image Alt Text"].details).toBeTruthy();

    // "click here" / "read here" -> generic link warning.
    expect(byName["Link Text"].status).toBe("warn");

    // h1 -> h4 skip -> heading structure warning.
    expect(byName["Heading Structure"].status).toBe("warn");

    // Unlabeled input -> critical fail.
    expect(byName["Form Labels"].status).toBe("fail");

    // Empty button -> critical fail.
    expect(byName["Button and Control Names"].status).toBe("fail");

    // At least one critical (score-0) check must be present to drive the cap.
    expect(result.checks.some((c) => c.status === "fail" && c.score === 0)).toBe(
      true,
    );
  });

  it("demonstrates the critical cap holds even with mostly-passing checks", () => {
    // Everything good EXCEPT one missing lang attribute (single critical).
    const html = GOOD_HTML.replace('<html lang="en">', "<html>");
    const result = checkAccessibility(ctxFromHtml(html));

    expect(
      result.checks.find((c) => c.name === "Document Language")?.status,
    ).toBe("fail");
    // One critical issue caps the whole category at 60 despite many passes.
    expect(result.score).toBeLessThanOrEqual(60);
  });
});
