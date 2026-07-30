import { describe, expect, it } from "vitest";
import { attachImpact, topFixes } from "../lib/audit/impact";
import type { CategoryResult, CheckResult } from "../lib/audit/types";

// ---------------------------------------------------------------------------
// Helpers — build a minimal CategoryResult so we can exercise attachImpact /
// topFixes in isolation (no real audit run needed).
// ---------------------------------------------------------------------------
function check(partial: Partial<CheckResult> & { name: string; status: CheckResult["status"] }): CheckResult {
  return {
    score: 0,
    message: "",
    ...partial,
  };
}

function category(slug: string, weight: number, checks: CheckResult[]): CategoryResult {
  return { name: slug, slug, weight, score: 0, checks };
}

describe("attachImpact — quantified loss estimate", () => {
  it("sets a dollar/customer figure on a slow performance check", () => {
    const cat = category("web-vitals", 0.2, [
      check({ name: "Largest Contentful Paint (LCP)", status: "fail", score: 10, message: "LCP is 6.2s" }),
    ]);

    attachImpact(cat);

    const c = cat.checks[0]!;
    expect(c.quantified).toBeDefined();
    expect(c.quantified).toMatch(/^~/); // conservative/approximate prefix
    expect(c.quantified).toMatch(/customers?\/mo/);
    expect(c.quantified).toMatch(/estimated/i);
    // impact + priority still populated as before
    expect(c.impact).toBeTruthy();
    expect(c.priority).toBe("high");
  });

  it("uses a paying client's real traffic and labels it honestly", () => {
    const cat = category("web-vitals", 0.2, [
      check({ name: "Largest Contentful Paint (LCP)", status: "fail", score: 10, message: "LCP is 6.2s" }),
    ]);

    // 5000 real monthly visitors at a real 5% conversion — 10x the generic base.
    attachImpact(cat, {
      monthlyVisitors: 5000,
      conversionRate: 0.05,
      orderValue: 75,
      source: "measured",
    });

    const c = cat.checks[0]!;
    // 5000 * 0.35 * 0.05 = ~88 customers, vs ~5 on the generic prior.
    expect(c.quantified).toMatch(/88 customers\/mo/);
    // Honest qualifier flips from "estimated" to "based on your traffic".
    expect(c.quantified).toMatch(/based on your traffic/);
    expect(c.quantified).not.toMatch(/estimated/);
  });

  it("falls back to the generic 'estimated' prior when no traffic is supplied", () => {
    const cat = category("web-vitals", 0.2, [
      check({ name: "Largest Contentful Paint (LCP)", status: "fail", score: 10, message: "LCP is 6.2s" }),
    ]);
    attachImpact(cat); // no metrics → generic
    // 500 * 0.35 * 0.03 = ~5 customers.
    expect(cat.checks[0]!.quantified).toMatch(/5 customers\/mo/);
    expect(cat.checks[0]!.quantified).toMatch(/\(estimated\)/);
  });

  it("sets a figure on a missing-schema (AI readiness) check", () => {
    const cat = category("ai-readability", 0.15, [
      check({ name: "Business structured data", status: "fail", score: 0, message: "No LocalBusiness schema found" }),
    ]);

    attachImpact(cat);

    const c = cat.checks[0]!;
    expect(c.quantified).toBeDefined();
    expect(c.quantified).toMatch(/AI search/i);
    expect(c.quantified).toMatch(/estimated/i);
  });

  it("sets a dollar figure on a no-HTTPS check", () => {
    const cat = category("security", 0.15, [
      check({ name: "Secure connection (HTTPS)", status: "fail", score: 0, message: "Site is not served over HTTPS" }),
    ]);

    attachImpact(cat);

    expect(cat.checks[0]!.quantified).toMatch(/won't submit info/i);
  });

  it("leaves quantified unset on a 'not measured' placeholder", () => {
    const cat = category("web-vitals", 0.2, [
      check({ name: "Largest Contentful Paint (LCP)", status: "warn", score: 50, message: "Performance not measured (PageSpeed key not configured)" }),
    ]);

    attachImpact(cat);

    expect(cat.checks[0]!.quantified).toBeUndefined();
    expect(cat.checks[0]!.impact).toBeUndefined();
    expect(cat.checks[0]!.priority).toBeUndefined();
  });

  it("leaves quantified unset on a check with no credible dollar figure", () => {
    const cat = category("a11y", 0.05, [
      check({ name: "Image alt text", status: "warn", score: 60, message: "3 images missing alt text" }),
    ]);

    attachImpact(cat);

    // alt text gets an impact line but no quantified figure (not credible).
    expect(cat.checks[0]!.impact).toBeTruthy();
    expect(cat.checks[0]!.quantified).toBeUndefined();
  });

  it("never touches passing checks", () => {
    const cat = category("security", 0.15, [
      check({ name: "Secure connection (HTTPS)", status: "pass", score: 100, message: "Served over HTTPS" }),
    ]);

    attachImpact(cat);

    expect(cat.checks[0]!.quantified).toBeUndefined();
    expect(cat.checks[0]!.impact).toBeUndefined();
    expect(cat.checks[0]!.priority).toBeUndefined();
  });
});

describe("topFixes — ranking + quantified passthrough", () => {
  it("ranks high-priority failing checks first and carries quantified through", () => {
    const perf = category("web-vitals", 0.2, [
      check({ name: "Largest Contentful Paint (LCP)", status: "fail", score: 10, message: "LCP is 6.2s" }),
    ]);
    const a11y = category("a11y", 0.05, [
      // low-weight warn -> low priority
      check({ name: "Image alt text", status: "warn", score: 70, message: "missing alt text" }),
    ]);
    const trust = category("trust", 0, [
      check({ name: "Customer testimonials", status: "fail", score: 0, message: "No testimonials found" }),
    ]);

    [perf, a11y, trust].forEach((c) => attachImpact(c));

    const fixes = topFixes([a11y, trust, perf], 5);

    // High-priority (heavy-category fail) ranks ahead of the low-priority warn.
    expect(fixes[0]!.name).toBe("Largest Contentful Paint (LCP)");
    expect(fixes[fixes.length - 1]!.name).toBe("Image alt text");

    // quantified is exposed on the topFixes item shape.
    const lcpFix = fixes.find((f) => f.name === "Largest Contentful Paint (LCP)");
    expect(lcpFix?.quantified).toBeDefined();
    expect(lcpFix?.quantified).toMatch(/^~/);

    // a check with no credible figure has no quantified field set.
    const altFix = fixes.find((f) => f.name === "Image alt text");
    expect(altFix?.quantified).toBeUndefined();
  });

  it("respects the limit", () => {
    const cat = category("seo", 0.12, [
      check({ name: "Page title", status: "fail", score: 0, message: "missing" }),
      check({ name: "Meta description", status: "fail", score: 0, message: "missing" }),
      check({ name: "H1 heading", status: "warn", score: 50, message: "missing" }),
    ]);
    attachImpact(cat);

    expect(topFixes([cat], 2)).toHaveLength(2);
  });
});
