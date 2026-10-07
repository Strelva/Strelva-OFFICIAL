import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AiVisibilityResultView, renderAiVisibilityHtml } from "@/products/ai-visibility";
import { renderAuditReport } from "@/lib/audit/html";
import { attributedAudit } from "@/lib/audit/attribution";
import { buildAuditReportEmailOptions } from "@/lib/audit-report-email";
import { renderEmailHtml, renderEmailText } from "@/platform/infra/email/layout";
import type { AgencyAttribution } from "@/platform/infra/agency-attribution";
import type { AuditResult } from "@/lib/audit/types";
import type { AiVisibilityResult } from "@/products/ai-visibility/contracts";

const agency: AgencyAttribution = { workspaceId: "b2770000-0000-4000-8000-000000000010", slug: "northside", name: "Northside & Web", contactUrl: "https://north.example/contact?from=check&kind=fix", brand: { logoUrl: null, accentColor: null } };
const audit: AuditResult = { url: "https://fixture.example", scannedAt: "2026-10-07T12:00:00Z", overallScore: 40, grade: "F", categories: [{ name: "SEO", slug: "seo", score: 40, weight: 1, checks: [{ name: "Schema", status: "fail", score: 0, message: "Ask Strelva to add schema.", details: "Optional: ask Strelva to review it.", impact: "Ask Strelva to fix this.", priority: "high" }] }] };
const ai: AiVisibilityResult = { business: "Fixture", score: 40, grade: "F", verdict: "Needs work", topFix: "Ask Strelva to add schema.", signals: [], citation: { probed: false, mentioned: false, recommended: false, note: "Not probed" } };

describe("agency copy across public artifacts", () => {
  it("neutralizes all advice fields only on attributed results, without mutating the scanner result", () => {
    const copy = attributedAudit(audit, agency);
    expect(JSON.stringify(copy)).not.toMatch(/[Aa]sk Strelva/);
    expect(copy.categories[0]?.checks[0]).toMatchObject({ message: "Ask your web provider to add schema.", details: "Optional: ask your web provider to review it.", impact: "Ask your web provider to fix this." });
    expect(attributedAudit(audit)).toBe(audit);
    expect(audit.categories[0]?.checks[0]?.details).toContain("ask Strelva");
  });
  it("brands the audit report and CTA without implying the agency has agreed to do the work", () => {
    const html = renderAuditReport({ ...audit, agency });
    expect(html).toContain("Prepared by Northside &amp; Web on Strelva.");
    expect(html).toContain("https://north.example/contact?from=check&amp;kind=fix");
    expect(html).toContain("Ask your web provider");
    expect(html).not.toContain("Ask Strelva"); expect(html).not.toContain("Let Strelva handle it");
    expect(html).not.toContain("every issue in this report fixed");
    expect(renderAuditReport(audit)).toContain("Let Strelva handle it");
    expect(renderAuditReport(audit)).toContain("Ask Strelva");
  });
  it("brands AI HTML and rendered result, retaining the platform credit and agency contact", () => {
    const html = renderAiVisibilityHtml({ ...ai, agency });
    const ui = renderToStaticMarkup(<AiVisibilityResultView result={{ ...ai, agency }} scanId="scan_fixture" shareUrl={null} onReset={() => {}} />);
    for (const artifact of [html, ui]) {
      expect(artifact).toContain("Northside &amp; Web"); expect(artifact).toContain("on Strelva");
      expect(artifact).toContain("Ask your web provider"); expect(artifact).not.toContain("Ask Strelva");
      expect(artifact).toContain("https://north.example/contact?from=check&amp;kind=fix");
    }
    expect(renderAiVisibilityHtml(ai)).toContain("Prepared by Strelva.");
    const original = renderToStaticMarkup(<AiVisibilityResultView result={ai} scanId={null} shareUrl={null} onReset={() => {}} />);
    expect(original).toContain("Strelva builds and manages"); expect(original).toContain("/access-request?ref=ai-visibility");
  });
  it("puts the agency in email HTML/text and agency CTA, retaining default emails unchanged", () => {
    const opts = buildAuditReportEmailOptions({ name: "Jacob", url: audit.url }, attributedAudit(audit, agency), "https://app.example/audit/report/fixture");
    const html = renderEmailHtml(opts); const text = renderEmailText(opts);
    expect(html).toContain("Northside &amp; Web"); expect(html).toContain("on Strelva");
    expect(html).not.toContain('alt="Strelva"'); expect(html).not.toContain("Ask Strelva");
    expect(text).toContain("Northside & Web on Strelva"); expect(text).toContain(agency.contactUrl);
    const original = buildAuditReportEmailOptions({ name: "Jacob", url: audit.url }, audit, "https://app.example/report");
    expect(original.preparedBy).toBeUndefined(); expect(original.footerNote).toBe("You requested this audit at strelva.com/audit.");
    expect(renderEmailHtml(original)).toContain('alt="Strelva"');
  });
  it("escapes agency names in standalone exports and email identity", () => {
    const hostile = { ...agency, name: '<script>alert("brand")</script>' };
    expect(renderAuditReport({ ...audit, agency: hostile })).not.toContain('<script>alert("brand")</script>');
    expect(renderAiVisibilityHtml({ ...ai, agency: hostile })).toContain("&lt;script&gt;");
    const opts = buildAuditReportEmailOptions({ name: "Fixture", url: audit.url }, { ...audit, agency: hostile }, "https://app.example/report");
    expect(renderEmailHtml(opts)).toContain("&lt;script&gt;");
  });
});
