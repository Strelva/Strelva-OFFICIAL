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
// runAudit orchestration (per-module checks live in their own test files)
// ===========================================================================
describe("runAudit", () => {
  it("rejects private IP targets via SSRF protection", async () => {
    mockLookup.mockResolvedValueOnce({ address: "10.0.0.1" });
    await expect(runAudit("https://internal.corp")).rejects.toThrow(
      "Blocked: resolved to private IP"
    );
  });

  it("prepends https:// to a bare domain", async () => {
    await runAudit("example.com");
    expect(mockLookup).toHaveBeenCalledWith("example.com", { family: 4 });
  });

  it("returns the full set of audit categories", async () => {
    const results = await runAudit("https://example.com");
    const slugs = results.map((r) => r.slug);
    for (const slug of [
      "ai-readability",
      "seo",
      "security",
      "a11y",
      "web-vitals",
      "mobile",
      "trust",
      "content",
    ]) {
      expect(slugs).toContain(slug);
    }
  });

  it("assigns the central weights to the ported modules", async () => {
    const results = await runAudit("https://example.com");
    const weightBySlug = Object.fromEntries(results.map((r) => [r.slug, r.weight]));
    expect(weightBySlug["seo"]).toBeCloseTo(0.2);
    expect(weightBySlug["ai-readability"]).toBeCloseTo(0.2);
    expect(weightBySlug["security"]).toBeCloseTo(0.1);
    expect(weightBySlug["content"]).toBeCloseTo(0.1);
    expect(weightBySlug["trust"]).toBeCloseTo(0.1);
  });

  it("excludes the PageSpeed categories from the grade when no API key is set", async () => {
    delete process.env.GOOGLE_PAGESPEED_API_KEY;
    const results = await runAudit("https://example.com");
    const webVitals = results.find((r) => r.slug === "web-vitals")!;
    const mobile = results.find((r) => r.slug === "mobile")!;
    expect(webVitals.weight).toBe(0);
    expect(webVitals.score).toBe(50);
    expect(webVitals.checks[0].status).toBe("warn");
    expect(webVitals.checks[0].message.toLowerCase()).toContain("not measured");
    expect(mobile.weight).toBe(0);
    expect(mobile.score).toBe(50);
  });

  it("attaches a 'what this costs you' impact line to failing checks", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse("<html><head></head><body></body></html>")
    );
    const results = await runAudit("https://example.com");
    const failingWithImpact = results
      .flatMap((c) => c.checks)
      .find((c) => c.status === "fail" && c.impact);
    expect(failingWithImpact?.impact).toBeTruthy();
  });

  it("scores a rich, well-built page higher than an empty one", async () => {
    const richHtml = `<!doctype html><html lang="en"><head>
      <title>Acme Plumbing — Trusted Local Plumbers in Buffalo NY</title>
      <meta name="description" content="Acme Plumbing offers fast, licensed, insured plumbing across Buffalo with upfront pricing and 24/7 emergency response for homes and businesses.">
      <link rel="canonical" href="https://example.com/">
      <script type="application/ld+json">{"@type":"LocalBusiness","name":"Acme Plumbing","address":{"@type":"PostalAddress","streetAddress":"1 Main St","addressLocality":"Buffalo"},"telephone":"716-555-1212","sameAs":["https://en.wikipedia.org/wiki/Acme","https://www.linkedin.com/company/acme"]}</script>
      </head><body><main>
      <h1>Acme Plumbing</h1><h2>Our Services</h2>
      <p>${"Reliable, licensed plumbing for homes and local businesses. ".repeat(40)}</p>
      <a href="/about">About</a><a href="/services">Services</a><a href="/contact">Contact</a>
      <a href="tel:716-555-1212">Call us now</a>
      <img src="team.png" alt="The Acme Plumbing team on a job site">
      <a href="/privacy">Privacy Policy</a><a href="/terms">Terms</a>
      </main></body></html>`;
    mockFetch.mockResolvedValueOnce(mockResponse(richHtml));
    const richScore = computeOverallScore(await runAudit("https://example.com"));

    mockFetch.mockResolvedValueOnce(
      mockResponse("<html><head></head><body></body></html>")
    );
    const emptyScore = computeOverallScore(await runAudit("https://example.com"));

    expect(richScore).toBeGreaterThan(emptyScore);
  });

  it("counts real body copy when <main> is an empty shell (content in sibling sections)", async () => {
    // Regression: some layouts server-render an empty <main> beside the real
    // content. The content module read the shell and misreported a full page as
    // "0 words" / "0 CTAs" (RHM Innovations graded F off this false negative).
    const shellHtml = `<!doctype html><html lang="en"><head>
      <title>Shell Layout — Real Content Outside Main</title>
      </head><body>
      <main class="main"></main>
      <section>
      <h1>Independence in Every Shower</h1>
      <h2>How It Works</h2>
      <p>${"Accessible walk-in showers installed fast for homes across the region. ".repeat(30)}</p>
      <a href="/contact">Contact us</a>
      </section>
      </body></html>`;
    mockFetch.mockResolvedValueOnce(mockResponse(shellHtml));
    const results = await runAudit("https://example.com");
    const content = results.find((c) => c.slug === "content");
    const enough = content?.checks.find((c) => c.name === "Enough content");
    const cta = content?.checks.find((c) => c.name === "Clear calls to action");

    expect(enough?.details).not.toContain("0 words");
    expect(enough?.score).toBeGreaterThan(0);
    expect(cta?.score).toBeGreaterThan(0);
  });
});
