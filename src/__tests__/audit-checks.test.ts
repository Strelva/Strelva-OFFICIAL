import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports that use them
// ---------------------------------------------------------------------------

// Mock node:dns for SSRF validation tests
const mockLookup = vi.fn();
vi.mock("node:dns", () => ({
  promises: { lookup: (...args: unknown[]) => mockLookup(...args) },
}));

// Mock global fetch for network-dependent checks (SSL, PageSpeed, HTML fetch)
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------
import { isPrivateIP, validateUrlSafety, runAudit } from "../lib/audit/checks";
import {
  computeOverallScore,
  scoreToGrade,
  averageCheckScores,
} from "../lib/audit/scoring";
import type { CategoryResult } from "../lib/audit/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a Response whose `.url` property returns the given URL. */
function mockResponse(body: string, url = "https://example.com"): Response {
  const res = new Response(body, {
    status: 200,
    headers: { "content-type": "text/html" },
  });
  Object.defineProperty(res, "url", { value: url });
  return res;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  // Default: DNS resolves to a public IP
  mockLookup.mockResolvedValue({ address: "93.184.216.34" });
  // Default: fetch returns minimal HTML with a proper .url
  mockFetch.mockResolvedValue(
    mockResponse("<html><head><title>Test</title></head><body></body></html>")
  );
  // No PageSpeed API key by default
  delete process.env.GOOGLE_PAGESPEED_API_KEY;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ===========================================================================
// SSRF Protection
// ===========================================================================
describe("SSRF Protection", () => {
  describe("isPrivateIP", () => {
    it.each([
      ["10.0.0.1", "10.x.x.x (Class A private)"],
      ["10.255.255.255", "10.x.x.x upper bound"],
      ["172.16.0.1", "172.16.x.x (Class B private lower)"],
      ["172.31.255.255", "172.31.x.x (Class B private upper)"],
      ["192.168.0.1", "192.168.x.x (Class C private)"],
      ["192.168.1.100", "192.168.x.x typical LAN"],
      ["127.0.0.1", "loopback"],
      ["127.255.255.255", "loopback upper"],
      ["169.254.0.1", "link-local"],
      ["169.254.169.254", "AWS metadata endpoint"],
      ["0.0.0.0", "unspecified address"],
    ])("identifies %s as private (%s)", (ip) => {
      expect(isPrivateIP(ip)).toBe(true);
    });

    it.each([
      ["8.8.8.8", "Google DNS"],
      ["93.184.216.34", "example.com"],
      ["1.1.1.1", "Cloudflare DNS"],
      ["172.15.0.1", "just below 172.16 range"],
      ["172.32.0.1", "just above 172.31 range"],
      ["11.0.0.1", "just above 10.x range"],
    ])("allows %s as public (%s)", (ip) => {
      expect(isPrivateIP(ip)).toBe(false);
    });
  });

  describe("validateUrlSafety", () => {
    it("rejects ftp:// scheme", async () => {
      await expect(validateUrlSafety("ftp://example.com")).rejects.toThrow(
        "Blocked: non-HTTP scheme"
      );
    });

    it("rejects file:// scheme", async () => {
      await expect(validateUrlSafety("file:///etc/passwd")).rejects.toThrow(
        "Blocked: non-HTTP scheme"
      );
    });

    it("rejects javascript: scheme", async () => {
      await expect(
        validateUrlSafety("javascript:alert(1)")
      ).rejects.toThrow();
    });

    it("rejects URLs resolving to private IPs", async () => {
      mockLookup.mockResolvedValueOnce({ address: "127.0.0.1" });
      await expect(
        validateUrlSafety("https://evil.example.com")
      ).rejects.toThrow("Blocked: resolved to private IP");
    });

    it("rejects URLs resolving to 169.254.169.254 (cloud metadata)", async () => {
      mockLookup.mockResolvedValueOnce({ address: "169.254.169.254" });
      await expect(
        validateUrlSafety("https://metadata.example.com")
      ).rejects.toThrow("Blocked: resolved to private IP");
    });

    it("allows URLs resolving to public IPs", async () => {
      mockLookup.mockResolvedValueOnce({ address: "93.184.216.34" });
      const result = await validateUrlSafety("https://example.com");
      expect(result).toEqual({ address: "93.184.216.34" });
    });

    it("forces IPv4 resolution", async () => {
      mockLookup.mockResolvedValueOnce({ address: "93.184.216.34" });
      await validateUrlSafety("https://example.com");
      expect(mockLookup).toHaveBeenCalledWith("example.com", { family: 4 });
    });
  });
});

// ===========================================================================
// Scoring Math
// ===========================================================================
describe("Scoring Math", () => {
  describe("averageCheckScores", () => {
    it("averages a list of scores", () => {
      expect(averageCheckScores([100, 80, 60])).toBe(80);
    });

    it("rounds to nearest integer", () => {
      expect(averageCheckScores([100, 90, 80])).toBe(90);
      expect(averageCheckScores([33, 33, 34])).toBe(33);
    });

    it("returns 0 for empty array", () => {
      expect(averageCheckScores([])).toBe(0);
    });

    it("returns the value for a single score", () => {
      expect(averageCheckScores([75])).toBe(75);
    });
  });

  describe("scoreToGrade", () => {
    it("returns A for scores >= 90", () => {
      expect(scoreToGrade(90)).toBe("A");
      expect(scoreToGrade(100)).toBe("A");
      expect(scoreToGrade(95)).toBe("A");
    });

    it("returns B for scores 80-89", () => {
      expect(scoreToGrade(80)).toBe("B");
      expect(scoreToGrade(89)).toBe("B");
    });

    it("returns C for scores 70-79", () => {
      expect(scoreToGrade(70)).toBe("C");
      expect(scoreToGrade(79)).toBe("C");
    });

    it("returns D for scores 60-69", () => {
      expect(scoreToGrade(60)).toBe("D");
      expect(scoreToGrade(69)).toBe("D");
    });

    it("returns F for scores below 60", () => {
      expect(scoreToGrade(59)).toBe("F");
      expect(scoreToGrade(0)).toBe("F");
    });

    it("handles boundary values exactly", () => {
      expect(scoreToGrade(90)).toBe("A");
      expect(scoreToGrade(89)).toBe("B");
      expect(scoreToGrade(80)).toBe("B");
      expect(scoreToGrade(79)).toBe("C");
      expect(scoreToGrade(70)).toBe("C");
      expect(scoreToGrade(69)).toBe("D");
      expect(scoreToGrade(60)).toBe("D");
      expect(scoreToGrade(59)).toBe("F");
    });
  });

  describe("computeOverallScore", () => {
    it("computes weighted average of category scores", () => {
      const categories: CategoryResult[] = [
        { name: "A", slug: "a", weight: 0.6, score: 100, checks: [] },
        { name: "B", slug: "b", weight: 0.4, score: 50, checks: [] },
      ];
      // (100*0.6 + 50*0.4) / (0.6+0.4) = 80
      expect(computeOverallScore(categories)).toBe(80);
    });

    it("returns 0 when total weight is 0", () => {
      const categories: CategoryResult[] = [
        { name: "A", slug: "a", weight: 0, score: 100, checks: [] },
      ];
      expect(computeOverallScore(categories)).toBe(0);
    });

    it("returns 0 for empty categories", () => {
      expect(computeOverallScore([])).toBe(0);
    });

    it("handles single category", () => {
      const categories: CategoryResult[] = [
        { name: "A", slug: "a", weight: 1.0, score: 73, checks: [] },
      ];
      expect(computeOverallScore(categories)).toBe(73);
    });

    it("rounds to nearest integer", () => {
      const categories: CategoryResult[] = [
        { name: "A", slug: "a", weight: 0.3, score: 100, checks: [] },
        { name: "B", slug: "b", weight: 0.7, score: 33, checks: [] },
      ];
      // (100*0.3 + 33*0.7) / 1.0 = 30 + 23.1 = 53.1 => 53
      expect(computeOverallScore(categories)).toBe(53);
    });

    it("all checks pass produces score 100", () => {
      const categories: CategoryResult[] = [
        { name: "A", slug: "a", weight: 0.3, score: 100, checks: [] },
        { name: "B", slug: "b", weight: 0.25, score: 100, checks: [] },
        { name: "C", slug: "c", weight: 0.2, score: 100, checks: [] },
        { name: "D", slug: "d", weight: 0.1, score: 100, checks: [] },
        { name: "E", slug: "e", weight: 0.1, score: 100, checks: [] },
        { name: "F", slug: "f", weight: 0.05, score: 100, checks: [] },
      ];
      expect(computeOverallScore(categories)).toBe(100);
    });

    it("all checks fail produces score 0", () => {
      const categories: CategoryResult[] = [
        { name: "A", slug: "a", weight: 0.3, score: 0, checks: [] },
        { name: "B", slug: "b", weight: 0.25, score: 0, checks: [] },
        { name: "C", slug: "c", weight: 0.2, score: 0, checks: [] },
        { name: "D", slug: "d", weight: 0.1, score: 0, checks: [] },
        { name: "E", slug: "e", weight: 0.1, score: 0, checks: [] },
        { name: "F", slug: "f", weight: 0.05, score: 0, checks: [] },
      ];
      expect(computeOverallScore(categories)).toBe(0);
    });
  });
});

// ===========================================================================
// Individual Checks (via runAudit integration)
// ===========================================================================
describe("runAudit", () => {
  it("rejects private IP targets via SSRF protection", async () => {
    mockLookup.mockResolvedValueOnce({ address: "10.0.0.1" });
    await expect(runAudit("https://internal.corp")).rejects.toThrow(
      "Blocked: resolved to private IP"
    );
  });

  it("prepends https:// to bare domain", async () => {
    await runAudit("example.com");
    // DNS lookup should have been called with "example.com" and IPv4 forced
    expect(mockLookup).toHaveBeenCalledWith("example.com", { family: 4 });
  });

  it("returns all 6 category results", async () => {
    const results = await runAudit("https://example.com");
    expect(results).toHaveLength(6);
    const slugs = results.map((r) => r.slug);
    expect(slugs).toContain("web-vitals");
    expect(slugs).toContain("seo");
    expect(slugs).toContain("mobile");
    expect(slugs).toContain("schema");
    expect(slugs).toContain("ssl");
    expect(slugs).toContain("a11y");
  });

  describe("SSL check", () => {
    it("scores 100 for HTTPS URL", async () => {
      const results = await runAudit("https://example.com");
      const ssl = results.find((r) => r.slug === "ssl")!;
      expect(ssl.score).toBe(100);
      expect(ssl.checks[0].status).toBe("pass");
    });

    it("scores 0 for HTTP URL when HTTPS upgrade fails", async () => {
      // First call: HTML fetch for the http:// URL (succeeds)
      // Second call: HTTPS probe from checkSSL (fails)
      mockFetch
        .mockResolvedValueOnce(
          mockResponse(
            "<html><head><title>T</title></head><body></body></html>",
            "http://example.com"
          )
        )
        .mockRejectedValueOnce(new Error("connection refused"));

      const results = await runAudit("http://example.com");
      const ssl = results.find((r) => r.slug === "ssl")!;
      // First check: HTTPS => fail (score 0). Second check: HTTPS Available => fail (score 0).
      expect(ssl.checks[0].score).toBe(0);
      expect(ssl.checks[0].status).toBe("fail");
    });
  });

  describe("SEO checks", () => {
    it("scores 100 for title tag with correct length", async () => {
      const html =
        '<html><head><title>A Perfectly Good Title for SEO Purposes</title></head><body><h1>Hello</h1></body></html>';
      mockFetch.mockResolvedValueOnce(mockResponse(html));

      const results = await runAudit("https://example.com");
      const seo = results.find((r) => r.slug === "seo")!;
      const titleCheck = seo.checks.find((c) => c.name === "Title Tag")!;
      expect(titleCheck.score).toBe(100);
      expect(titleCheck.status).toBe("pass");
    });

    it("scores 0 for missing title tag", async () => {
      const html = "<html><head></head><body></body></html>";
      mockFetch.mockResolvedValueOnce(mockResponse(html));

      const results = await runAudit("https://example.com");
      const seo = results.find((r) => r.slug === "seo")!;
      const titleCheck = seo.checks.find((c) => c.name === "Title Tag")!;
      expect(titleCheck.score).toBe(0);
      expect(titleCheck.status).toBe("fail");
    });

    it("warns for short title tag", async () => {
      const html =
        "<html><head><title>Short</title></head><body></body></html>";
      mockFetch.mockResolvedValueOnce(mockResponse(html));

      const results = await runAudit("https://example.com");
      const seo = results.find((r) => r.slug === "seo")!;
      const titleCheck = seo.checks.find((c) => c.name === "Title Tag")!;
      expect(titleCheck.score).toBe(60);
      expect(titleCheck.status).toBe("warn");
    });

    it("detects missing H1 tag", async () => {
      const html =
        "<html><head><title>A Perfectly Good Title for SEO Purposes</title></head><body><p>No heading</p></body></html>";
      mockFetch.mockResolvedValueOnce(mockResponse(html));

      const results = await runAudit("https://example.com");
      const seo = results.find((r) => r.slug === "seo")!;
      const h1Check = seo.checks.find((c) => c.name === "H1 Tag")!;
      expect(h1Check.score).toBe(0);
      expect(h1Check.status).toBe("fail");
    });

    it("warns for multiple H1 tags", async () => {
      const html =
        "<html><head><title>A Perfectly Good Title for SEO Purposes</title></head><body><h1>One</h1><h1>Two</h1></body></html>";
      mockFetch.mockResolvedValueOnce(mockResponse(html));

      const results = await runAudit("https://example.com");
      const seo = results.find((r) => r.slug === "seo")!;
      const h1Check = seo.checks.find((c) => c.name === "H1 Tag")!;
      expect(h1Check.score).toBe(60);
      expect(h1Check.status).toBe("warn");
    });
  });

  describe("PageSpeed-dependent checks", () => {
    it("handles null psData gracefully (scores 50 for webVitals)", async () => {
      // No API key => psData is null => fallback to 50
      delete process.env.GOOGLE_PAGESPEED_API_KEY;

      const results = await runAudit("https://example.com");
      const webVitals = results.find((r) => r.slug === "web-vitals")!;
      expect(webVitals.score).toBe(50);
      expect(webVitals.checks[0].status).toBe("warn");
      expect(webVitals.checks[0].message).toContain("not configured");
    });

    it("handles null psData gracefully (scores 50 for mobile)", async () => {
      delete process.env.GOOGLE_PAGESPEED_API_KEY;

      const results = await runAudit("https://example.com");
      const mobile = results.find((r) => r.slug === "mobile")!;
      expect(mobile.score).toBe(50);
      expect(mobile.checks[0].status).toBe("warn");
    });
  });

  describe("Schema checks", () => {
    it("scores 0 when no structured data exists", async () => {
      const html =
        "<html><head><title>A Perfectly Good Title for SEO Purposes</title></head><body></body></html>";
      mockFetch.mockResolvedValueOnce(mockResponse(html));

      const results = await runAudit("https://example.com");
      const schema = results.find((r) => r.slug === "schema")!;
      expect(schema.checks[0].score).toBe(0);
      expect(schema.checks[0].status).toBe("fail");
    });

    it("scores 100 when JSON-LD with LocalBusiness is present", async () => {
      const html = `<html><head>
        <title>A Perfectly Good Title for SEO Purposes</title>
        <script type="application/ld+json">{"@type":"LocalBusiness","name":"Test"}</script>
      </head><body></body></html>`;
      mockFetch.mockResolvedValueOnce(mockResponse(html));

      const results = await runAudit("https://example.com");
      const schema = results.find((r) => r.slug === "schema")!;
      const structuredCheck = schema.checks.find(
        (c) => c.name === "Structured Data"
      )!;
      expect(structuredCheck.score).toBe(100);
      expect(structuredCheck.status).toBe("pass");
    });
  });

  describe("Accessibility checks", () => {
    it("passes when html has lang attribute and images have alt", async () => {
      const html =
        '<html lang="en"><head><title>Test Page With Good SEO Title</title></head><body><img src="a.png" alt="photo"></body></html>';
      mockFetch.mockResolvedValueOnce(mockResponse(html));

      const results = await runAudit("https://example.com");
      const a11y = results.find((r) => r.slug === "a11y")!;
      expect(a11y.score).toBe(100);
    });

    it("fails when html has no lang attribute", async () => {
      const html =
        "<html><head><title>Test Page With Good SEO Title Len</title></head><body></body></html>";
      mockFetch.mockResolvedValueOnce(mockResponse(html));

      const results = await runAudit("https://example.com");
      const a11y = results.find((r) => r.slug === "a11y")!;
      const langCheck = a11y.checks.find(
        (c) => c.name === "Language Attribute"
      )!;
      expect(langCheck.score).toBe(0);
      expect(langCheck.status).toBe("fail");
    });

    it("detects images missing alt attributes", async () => {
      const html =
        '<html lang="en"><head><title>Test Page With Good SEO Title</title></head><body><img src="a.png"><img src="b.png"></body></html>';
      mockFetch.mockResolvedValueOnce(mockResponse(html));

      const results = await runAudit("https://example.com");
      const a11y = results.find((r) => r.slug === "a11y")!;
      const altCheck = a11y.checks.find((c) => c.name === "Image Alt Text")!;
      expect(altCheck.score).toBe(0);
      expect(altCheck.status).toBe("fail");
    });
  });
});
