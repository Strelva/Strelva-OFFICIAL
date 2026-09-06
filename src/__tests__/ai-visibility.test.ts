import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * AI Visibility Score tests.
 *
 * Two concerns:
 *
 *  1. HONEST VERDICT LANGUAGE (the claims-discipline rule in score.ts):
 *     when the live Gemini citation probe did NOT run (no API key), the verdict
 *     must use readiness language only and must NEVER assert "AI won't recommend
 *     you". This guards the honest surface described at the top of score.ts.
 *
 *  2. THE HTML ARTIFACT (renderAiVisibilityHtml): a pure function that turns a
 *     result into a sendable one-page document. It must surface the grade and
 *     top fix, attribute the citation result to Gemini by name when the probe
 *     ran, and fall back to readiness language when it did not.
 */

// Mock global fetch so scoreAiVisibility does no real network IO.
const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", mockFetch);
vi.mock("@/lib/pinned-public-text", () => ({
  fetchPinnedPublicText: async (url: string) => {
    const response = await mockFetch(url);
    return response.ok ? response.text() : null;
  },
}));

import { probeStatusLine, renderAiVisibilityHtml, scoreAiVisibility, slugify, type AiVisibilityResult, type Signal } from "../products/ai-visibility/server";

/** Minimal HTML page that fails most readiness signals -> low grade. */
const WEAK_HTML = "<html><head><title>Hi</title></head><body><p>Welcome</p></body></html>";

function htmlResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { "content-type": "text/html" } });
}

const ORIGINAL_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

beforeEach(() => {
  mockFetch.mockReset();
  // Default: site fetch returns weak HTML, robots.txt 404s.
  mockFetch.mockImplementation((input: string | URL) => {
    const u = String(input);
    if (u.includes("robots.txt")) return Promise.resolve(new Response("", { status: 404 }));
    return Promise.resolve(htmlResponse(WEAK_HTML));
  });
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  else process.env.GOOGLE_GENERATIVE_AI_API_KEY = ORIGINAL_KEY;
  vi.restoreAllMocks();
});

describe("scoreAiVisibility — honest verdict language", () => {
  it("never claims AI won't recommend you when the probe did not run", async () => {
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY; // probe cannot run
    const result = await scoreAiVisibility({
      business: "Acme Plumbing",
      url: "example.com",
      category: "plumbers",
      location: "Buffalo, NY",
    });

    expect(result.citation.probed).toBe(false);
    // Readiness-framed verdict, no unproven recommendation claim.
    expect(result.verdict).toMatch(/website readiness score/i);
    expect(result.verdict).not.toMatch(/won't recommend|did NOT name|isn't recommended/i);
  });

  it("the citation note stays in readiness language without a key", async () => {
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const result = await scoreAiVisibility({ business: "Acme Plumbing", url: "acme-plumbing.example" });
    expect(result.citation.probed).toBe(false);
    expect(result.citation.note).toMatch(/Gemini citation check was not available/i);
    expect(result.citation.note).not.toContain("GOOGLE_GENERATIVE_AI_API_KEY");
  });

  it("does not present a grade when no evidence source could be measured", async () => {
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const result = await scoreAiVisibility({ business: "Acme Plumbing" });

    expect(result.measurementStatus).toBe("unavailable");
    expect(result.readinessMeasured).toBe(false);
    expect(result.verdict).toMatch(/couldn't measure/i);
    expect(result.verdict).toMatch(/no visibility grade was produced/i);
    expect(result.topFix).toMatch(/reachable public website/i);
  });
});

// ---------------------------------------------------------------------------
// HTML artifact
// ---------------------------------------------------------------------------

const SIGNALS: Signal[] = [
  { id: "ai_crawlers", label: "AI crawlers allowed", pass: false, weight: 28, detail: "robots.txt blocks AI crawlers" },
  { id: "structured_data", label: "Structured data (schema.org)", pass: true, weight: 24, detail: "Found schema.org types: LocalBusiness" },
];

function baseResult(overrides: Partial<AiVisibilityResult> = {}): AiVisibilityResult {
  return {
    business: "Acme Plumbing",
    url: "https://acme-plumbing.example",
    score: 42,
    grade: "F",
    verdict: "Acme Plumbing is at high risk of being invisible to AI search.",
    signals: SIGNALS,
    citation: { probed: false, mentioned: false, recommended: false, note: "Set the key to run the probe." },
    topFix: "Add schema.org LocalBusiness structured data so AI can ground on your facts.",
    ...overrides,
  };
}

describe("renderAiVisibilityHtml", () => {
  it("includes the grade and the single top fix", () => {
    const html = renderAiVisibilityHtml(baseResult());
    expect(html).toContain(">F<"); // big grade glyph
    expect(html).toContain("42/100");
    expect(html).toContain("Add schema.org LocalBusiness structured data so AI can ground on your facts.");
  });

  it("renders the business name, signal checklist with weights, and footer", () => {
    const html = renderAiVisibilityHtml(baseResult());
    expect(html).toContain("Acme Plumbing");
    expect(html).toContain("AI crawlers allowed");
    expect(html).toContain("28 pts");
    expect(html).toContain("24 pts");
    expect(html).toContain("Prepared by Strelva");
    expect(html).toContain("strelva.com");
  });

  it("attributes the probe to Gemini by name when the probe ran (not named)", () => {
    const html = renderAiVisibilityHtml(
      baseResult({
        citation: { probed: true, mentioned: false, recommended: false, note: "" },
      }),
    );
    expect(html).toContain("Gemini did not name Acme Plumbing");
    // Must not use a generic multi-tool claim when only Gemini was probed.
    expect(html).not.toMatch(/AI tools won't recommend you/i);
  });

  it("attributes a positive probe to Gemini by name when named", () => {
    const html = renderAiVisibilityHtml(
      baseResult({
        citation: { probed: true, mentioned: true, recommended: true, note: "" },
      }),
    );
    expect(html).toContain("Gemini named Acme Plumbing");
  });

  it("uses readiness language (no recommendation claim) when the probe did not run", () => {
    const html = renderAiVisibilityHtml(baseResult());
    expect(html).toMatch(/live AI-citation probe hasn't been run/i);
    expect(html).toContain("AI readiness");
    expect(html).not.toMatch(/Gemini did not name|Gemini named/i);
    expect(html).not.toMatch(/won't recommend you/i);
  });

  it("does not render a legacy F when measurement was unavailable", () => {
    const html = renderAiVisibilityHtml(baseResult({
      measurementStatus: "unavailable",
      measurementNote: "This run could not measure either source.",
      readinessMeasured: false,
    }));
    expect(html).toContain("Not measured");
    expect(html).toContain("Measurement unavailable");
    expect(html).not.toContain(">F<");
    expect(html).not.toContain("42/100");
  });

  it("escapes HTML in untrusted fields (no injection)", () => {
    const html = renderAiVisibilityHtml(baseResult({ business: "Bob's <script>alert(1)</script> Plumbing" }));
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("probeStatusLine", () => {
  it("is Gemini-attributed when probed, readiness-only when not", () => {
    expect(probeStatusLine({ probed: true, mentioned: false, recommended: false, note: "" }, "Acme")).toMatch(
      /Gemini did not name Acme/,
    );
    expect(probeStatusLine({ probed: true, mentioned: true, recommended: true, note: "" }, "Acme")).toMatch(
      /Gemini named Acme/,
    );
    expect(probeStatusLine({ probed: false, mentioned: false, recommended: false, note: "" }, "Acme")).toMatch(
      /probe hasn't been run/i,
    );
  });
});

describe("slugify", () => {
  it("produces a filesystem-safe slug and falls back for empty input", () => {
    expect(slugify("Acme Plumbing & Co.")).toBe("acme-plumbing-co");
    expect(slugify("  ")).toBe("business");
  });
});
