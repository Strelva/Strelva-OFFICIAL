import { describe, expect, it } from "vitest";
import { load } from "cheerio";
import { auditRebuildHtml } from "@/products/websites/rebuild-audit";
import { computeVisibleText } from "@/lib/audit/checks";
import type { AuditContext } from "@/lib/audit/context";
import { checkAiReadability } from "@/lib/audit/modules/ai-readability";
import { checkSeoFoundations } from "@/lib/audit/modules/seo-foundations";
import { checkTrust } from "@/lib/audit/modules/trust";
import { checkContent } from "@/lib/audit/modules/content";

const html = '<!doctype html><html lang="en"><head><title>Alder florist</title><meta name="description" content="Seasonal flowers in Buffalo"><link rel="canonical" href="https://alder.example/"></head><body><h1>Alder florist</h1><p>Seasonal flowers in Buffalo.</p><a href="/contact">Contact us</a></body></html>';
function context(): AuditContext {
  const $ = load(html);
  return { html, $, url: "https://alder.example/", visibleText: computeVisibleText($), fetchOk: true, headers: new Headers(), robotsTxt: null, sitemapXml: null, llmsTxt: null };
}
describe("evidence-limited rebuild HTML audit", () => {
  it("uses the canonical weighted scores for categories whose signals were measured", () => {
    const result = auditRebuildHtml(html,"https://alder.example/");
    for (const category of [checkTrust(context()),checkContent(context()),checkAiReadability(context(),{htmlOnly:true}),checkSeoFoundations(context(),{htmlOnly:true})]) {
      expect(result.categories.find(item=>item.slug===category.slug)?.score).toBe(category.score);
    }
  });
  it("does not report unavailable well-known files or crawler permission as observed results", () => {
    const result = auditRebuildHtml(html,"https://alder.example/");
    expect(result.categories.flatMap(category=>category.checks).map(check=>check.name).join(" ")).not.toMatch(/robots|sitemap|llms|crawlers allowed/i);
    expect(result.categories).toHaveLength(5);
    expect(result.categories.find(item=>item.slug==="seo")?.checks.length).toBe(6);
  });
  it("keeps the existing full-audit behavior by default", () => {
    expect(checkAiReadability(context()).checks.some(check=>check.name.includes("llms.txt"))).toBe(true);
    expect(checkSeoFoundations(context()).checks.some(check=>check.name==="robots.txt")).toBe(true);
    expect(checkSeoFoundations(context()).score).toBeLessThan(checkSeoFoundations(context(),{htmlOnly:true}).score);
  });
});
