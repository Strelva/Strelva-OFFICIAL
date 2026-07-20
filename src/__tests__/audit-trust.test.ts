import { describe, expect, it } from "vitest";
import * as cheerio from "cheerio";
import { checkTrust } from "../lib/audit/modules/trust";
import type { AuditContext } from "../lib/audit/context";

// ---------------------------------------------------------------------------
// Helper — build a minimal AuditContext from raw HTML (mirrors audit-security).
// ---------------------------------------------------------------------------
function makeCtx(opts: { url: string; html: string }): AuditContext {
  return {
    url: opts.url,
    html: opts.html,
    $: cheerio.load(opts.html),
    headers: new Headers(),
    robotsTxt: null,
    sitemapXml: null,
    llmsTxt: null,
  };
}

describe("checkTrust", () => {
  it("scores a site rich in trust signals high", () => {
    const html = `
      <!doctype html>
      <html lang="en">
        <head><title>Trustworthy HVAC</title></head>
        <body>
          <header>
            <a href="tel:+17165551234">(716) 555-1234</a>
            <p>123 Main Street, Buffalo, NY 14201</p>
            <p>Hours: Monday 9</p>
          </header>
          <section class="testimonials">
            <blockquote>"Best service ever." - A happy customer</blockquote>
          </section>
          <p>Licensed &amp; Insured. Family owned since 2005. Satisfaction guarantee.</p>
          <p>We accept Visa and Mastercard.</p>
          <footer>
            <a href="/about-us">Our Team</a>
            <a href="/privacy">Privacy Policy</a>
            <a href="/terms">Terms of Service</a>
          </footer>
        </body>
      </html>
    `;

    const result = checkTrust(makeCtx({ url: "https://trustworthy-hvac.com", html }));

    expect(result.slug).toBe("trust");
    expect(result.name).toBe("Trust Signals");
    expect(result.weight).toBe(0);
    expect(result.score).toBeGreaterThanOrEqual(80);

    const byName = (n: string) => result.checks.find((c) => c.name === n);
    expect(byName("Secure connection (HTTPS)")?.status).toBe("pass");
    expect(byName("Contact info visible")?.status).toBe("pass");
    expect(byName("Click-to-call")?.status).toBe("pass");
    expect(byName("Customer testimonials")?.status).toBe("pass");
    expect(byName("Privacy & terms pages")?.status).toBe("pass");

    // Every check has a plain-English message and a valid status.
    for (const c of result.checks) {
      expect(c.message.length).toBeGreaterThan(0);
      expect(["pass", "warn", "fail"]).toContain(c.status);
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(100);
    }
  });

  it("credits an online-only local business fairly (email/form contact, longevity, no storefront phone)", () => {
    // The ICP includes online-only brands (no public phone or street address)
    // reached by email or a contact form. Recalibrated trust should not tank
    // them, and longevity / family-ownership / certifications are real
    // credibility — not just BBB/license/insurance.
    const html = `
      <!doctype html>
      <html lang="en">
        <head><title>Great Lakes Dried Fruit</title></head>
        <body>
          <p>Family owned. NYS grown &amp; certified. Serving customers since 1998.</p>
          <section class="reviews">
            <blockquote>"These are incredible." - A happy customer</blockquote>
          </section>
          <a href="mailto:hello@example.com">Email us</a>
          <form action="/api/contact"><input name="email" /></form>
          <footer>
            <a href="/about">Our Story</a>
            <a href="/privacy">Privacy Policy</a>
            <a href="/terms">Terms</a>
          </footer>
        </body>
      </html>
    `;

    const result = checkTrust(makeCtx({ url: "https://example.com", html }));
    const byName = (n: string) => result.checks.find((c) => c.name === n);

    // Not tanked: a legit online business clears the mid-band.
    expect(result.score).toBeGreaterThanOrEqual(70);
    // Email / contact form counts as reachable, not a contact-info fail.
    expect(byName("Contact info visible")?.status).not.toBe("fail");
    // No storefront phone is fine when there's another contact method.
    expect(byName("Click-to-call")?.status).not.toBe("fail");
  });

  it("scores an empty, insecure page low", () => {
    const html = `
      <!doctype html>
      <html lang="en">
        <head><title>Bare</title></head>
        <body><h1>Welcome</h1></body>
      </html>
    `;

    const result = checkTrust(makeCtx({ url: "http://bare-site.com", html }));

    expect(result.slug).toBe("trust");
    expect(result.score).toBeLessThan(50);

    const byName = (n: string) => result.checks.find((c) => c.name === n);
    expect(byName("Secure connection (HTTPS)")?.status).toBe("fail");
    expect(byName("Contact info visible")?.status).toBe("fail");
    expect(byName("Click-to-call")?.status).toBe("fail");
    expect(byName("Customer testimonials")?.status).toBe("fail");
    expect(byName("Privacy & terms pages")?.status).toBe("fail");
  });
});
