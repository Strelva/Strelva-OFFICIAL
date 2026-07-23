import { describe, expect, it } from "vitest";
import * as cheerio from "cheerio";
import { checkSecurity } from "../lib/audit/modules/security";
import type { AuditContext } from "../lib/audit/context";
import { computeVisibleText } from "../lib/audit/checks";

// ---------------------------------------------------------------------------
// Helper — build a minimal AuditContext from raw HTML.
// ---------------------------------------------------------------------------
function makeCtx(opts: {
  url: string;
  html: string;
  headers?: Record<string, string>;
}): AuditContext {
  return {
    url: opts.url,
    html: opts.html,
    $: cheerio.load(opts.html),
    visibleText: computeVisibleText(cheerio.load(opts.html)),
    fetchOk: true,
    headers: new Headers(opts.headers ?? {}),
    robotsTxt: null,
    sitemapXml: null,
    llmsTxt: null,
  };
}

const ALL_SECURITY_HEADERS: Record<string, string> = {
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "content-security-policy": "default-src 'self'",
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "geolocation=()",
  "x-xss-protection": "0",
};

describe("checkSecurity", () => {
  it("scores a hardened HTTPS site high", () => {
    const html = `
      <!doctype html>
      <html lang="en">
        <head><title>Secure Site</title></head>
        <body>
          <img src="https://example.com/logo.png" alt="logo" />
          <form action="https://example.com/contact">
            <input type="hidden" name="csrf_token" value="abc" />
            <input type="email" name="email" />
          </form>
          <div class="cookie-consent">We use cookies</div>
        </body>
      </html>`;
    const ctx = makeCtx({
      url: "https://example.com",
      html,
      headers: ALL_SECURITY_HEADERS,
    });

    const result = checkSecurity(ctx);

    expect(result.name).toBe("Security");
    expect(result.slug).toBe("security");
    expect(result.weight).toBe(0);
    expect(result.checks).toHaveLength(5);
    expect(result.score).toBeGreaterThanOrEqual(80);

    const byName = Object.fromEntries(result.checks.map((c) => [c.name, c]));
    expect(byName["HTTPS"].status).toBe("pass");
    expect(byName["Security headers"].status).toBe("pass");
    expect(byName["No mixed content"].status).toBe("pass");
    expect(byName["Form security"].status).toBe("pass");
    expect(byName["Cookie consent"].status).toBe("pass");
    // Every check status must agree with its score band.
    for (const c of result.checks) {
      const expected = c.score >= 80 ? "pass" : c.score >= 50 ? "warn" : "fail";
      expect(c.status).toBe(expected);
    }
  });

  it("scores an insecure site low", () => {
    const html = `
      <!doctype html>
      <html>
        <head><title>Insecure Site</title></head>
        <body>
          <img src="http://insecure.example.com/banner.jpg" alt="banner" />
          <script src="http://insecure.example.com/app.js"></script>
          <form action="http://insecure.example.com/submit">
            <input type="text" name="name" />
          </form>
        </body>
      </html>`;
    // No security headers set; page is HTTPS so the http:// script is active mixed content.
    const ctx = makeCtx({ url: "https://insecure-but-sloppy.example.com", html });

    const result = checkSecurity(ctx);

    expect(result.score).toBeLessThan(50);

    const byName = Object.fromEntries(result.checks.map((c) => [c.name, c]));
    expect(byName["Security headers"].status).toBe("fail");
    expect(byName["Security headers"].details).toContain("Missing headers");
    // Active http:// script on an https page => mixed content fails at score 0.
    expect(byName["No mixed content"].status).toBe("fail");
    expect(byName["No mixed content"].score).toBe(0);
    expect(byName["Cookie consent"].status).toBe("warn");
  });

  it("fails HTTPS for an http url", () => {
    const ctx = makeCtx({
      url: "http://plain.example.com",
      html: "<html><head><title>x</title></head><body></body></html>",
    });
    const result = checkSecurity(ctx);
    const https = result.checks.find((c) => c.name === "HTTPS");
    expect(https?.status).toBe("fail");
    expect(https?.score).toBe(0);
    expect(result.score).toBeLessThan(50);
  });
});
