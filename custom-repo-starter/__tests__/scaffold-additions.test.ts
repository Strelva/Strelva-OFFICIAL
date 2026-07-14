import { describe, it, expect } from "vitest";

import { buildLlmsTxt } from "../scaffold-seo";
import { scaffoldSecurityHeaders } from "../scaffold-headers";
import { validPairs, buildFaqSchema, type ScaffoldFAQItem } from "../ScaffoldFAQ";

describe("buildLlmsTxt", () => {
  it("emits a title, blockquote summary, and link sections", () => {
    const out = buildLlmsTxt({
      siteName: "RHM Innovations",
      description: "Portable bathing systems for limited mobility.",
      sections: [
        {
          title: "Pages",
          links: [
            { title: "Home", url: "https://rhm.com/", description: "Overview." },
            { title: "Shop", url: "https://rhm.com/shop" },
          ],
        },
      ],
    });
    expect(out).toContain("# RHM Innovations");
    expect(out).toContain("> Portable bathing systems for limited mobility.");
    expect(out).toContain("## Pages");
    expect(out).toContain("- [Home](https://rhm.com/): Overview.");
    expect(out).toContain("- [Shop](https://rhm.com/shop)");
    expect(out.endsWith("\n")).toBe(true);
  });

  it("falls back to a generic title and omits everything unprovided", () => {
    expect(buildLlmsTxt({})).toBe("# Website\n");
    expect(buildLlmsTxt(undefined)).toBe("# Website\n");
    expect(buildLlmsTxt(null)).toBe("# Website\n");
  });

  it("skips sections with no title or no complete links (honesty rule)", () => {
    const out = buildLlmsTxt({
      siteName: "X",
      sections: [
        { title: "", links: [{ title: "A", url: "https://a.com" }] },
        { title: "Empty", links: [] },
        { title: "Partial", links: [{ title: "no url", url: "" }] },
      ],
    });
    expect(out).toBe("# X\n");
  });
});

describe("scaffoldSecurityHeaders", () => {
  it("returns the five always-safe headers by default, no CSP", () => {
    const keys = scaffoldSecurityHeaders().map((h) => h.key);
    expect(keys).toEqual([
      "Strict-Transport-Security",
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Referrer-Policy",
      "Permissions-Policy",
    ]);
    expect(keys).not.toContain("Content-Security-Policy");
  });

  it("adds CSP only when explicitly provided", () => {
    const headers = scaffoldSecurityHeaders({ contentSecurityPolicy: "default-src 'self'" });
    const csp = headers.find((h) => h.key === "Content-Security-Policy");
    expect(csp?.value).toBe("default-src 'self'");
  });

  it("honors an hstsMaxAge override", () => {
    const hsts = scaffoldSecurityHeaders({ hstsMaxAge: 100 }).find(
      (h) => h.key === "Strict-Transport-Security",
    );
    expect(hsts?.value).toContain("max-age=100");
  });
});

describe("ScaffoldFAQ helpers", () => {
  const faqs: ScaffoldFAQItem[] = [
    { question: "  Do you mount it?  ", answer: "No, it's portable." },
    { question: "Empty answer?", answer: "   " },
    { question: "", answer: "orphan answer" },
  ];

  it("validPairs keeps only pairs with real text on both sides, trimmed", () => {
    expect(validPairs(faqs)).toEqual([{ question: "Do you mount it?", answer: "No, it's portable." }]);
    expect(validPairs(undefined)).toEqual([]);
    // @ts-expect-error — garbage input must not throw
    expect(validPairs("nope")).toEqual([]);
  });

  it("buildFaqSchema emits a valid FAQPage the audit credits", () => {
    const schema = buildFaqSchema([{ question: "Q?", answer: "A." }]);
    expect(schema["@type"]).toBe("FAQPage");
    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema.mainEntity).toEqual([
      { "@type": "Question", name: "Q?", acceptedAnswer: { "@type": "Answer", text: "A." } },
    ]);
  });
});
