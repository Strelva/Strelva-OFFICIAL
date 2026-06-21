import { describe, it, expect } from "vitest";
import { renderAuditReport } from "@/lib/audit/html";
import type { AuditResult } from "@/lib/audit/types";

const sample: AuditResult = {
  url: "https://acme-plumbing.com",
  scannedAt: "2026-06-21T12:00:00.000Z",
  overallScore: 58,
  grade: "C",
  categories: [
    {
      name: "SEO",
      slug: "seo",
      weight: 0.2,
      score: 45,
      checks: [
        {
          name: "Title tag",
          status: "fail",
          score: 0,
          message: "No title tag found on the homepage.",
          impact:
            "Your title tag is the headline in search results. A missing or weak one costs clicks.",
          quantified: "~$300/mo in missed clicks",
          priority: "high",
        },
        {
          name: "Sitemap",
          status: "pass",
          score: 100,
          message: "A sitemap is present.",
        },
      ],
    },
    {
      name: "Security",
      slug: "security",
      weight: 0.15,
      score: 70,
      checks: [
        {
          name: "HTTPS",
          status: "warn",
          score: 60,
          message: "HTTPS is configured but missing security headers.",
          impact:
            "Missing security headers leave the site open to common attacks and erode trust signals search engines read.",
          priority: "medium",
        },
      ],
    },
  ],
};

describe("renderAuditReport", () => {
  const html = renderAuditReport(sample);

  it("returns a complete standalone HTML document", () => {
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain("</html>");
    expect(html).toContain("<style>");
    // No external assets.
    expect(html).not.toMatch(/<link\s+[^>]*href=/i);
    expect(html).not.toMatch(/<script/i);
  });

  it("includes the score and letter grade", () => {
    expect(html).toContain("58");
    expect(html).toContain("out of 100");
    expect(html).toContain(">C<");
  });

  it("includes at least one top-fix name and its quantified estimate", () => {
    expect(html).toContain("Title tag");
    expect(html).toContain("~$300/mo in missed clicks");
  });

  it("renders per-category score bars", () => {
    expect(html).toContain("SEO");
    expect(html).toContain("Security");
  });

  it("includes the Strelva CTA pointing to the access request", () => {
    expect(html).toContain("Strelva builds and manages sites that score higher");
    expect(html).toContain("/access-request");
  });

  it("escapes the audited URL and is print-friendly", () => {
    expect(html).toContain("acme-plumbing.com");
    expect(html).toContain("@media print");
  });
});
