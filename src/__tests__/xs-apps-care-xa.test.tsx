// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { PREVIEW_FACTS, PREVIEW_NOTE } from "@/experience/care-reports/preview-fixture";
import { renderCareReportMail } from "@/platform/care-reports/mail";
import { SiteDeliveryStatus } from "@/experience/operations/SiteDeliveryStatus";
import { deliverySentence, scopeWords } from "@/experience/operations/DeliveryCommitmentPanel";

const mail = (over: Partial<Parameters<typeof renderCareReportMail>[0]> = {}) => renderCareReportMail({ facts: PREVIEW_FACTS, agencyName: "North Studio", businessName: "Harbor Dental", release: 2, link: "https://app.example.test/r", agencyNote: PREVIEW_NOTE, ...over });

describe("Care plan report email (XA, template only)", () => {
  it("keeps the agency's subject and names who acted", () => {
    const { subject, html, text } = mail();
    expect(subject).toBe("North Studio: Harbor Dental · September 2026 report");
    expect(html).toContain("North Studio · Runs on Strelva");
    expect(html).toContain("Open the report");
    expect(text).toContain("Open the report: https://app.example.test/r");
  });
  it("uses DM Sans only, no monospace, no uppercase overlines, no em dashes", () => {
    const { html } = mail();
    expect(html).not.toMatch(/mono|courier|menlo/i);
    expect(html).not.toMatch(/text-transform:\s*uppercase/i);
    expect(html).not.toContain("—");
  });
  it("escapes what the agency typed and refuses unsafe links", () => {
    expect(mail({ agencyNote: "<script>x</script>" }).html).not.toContain("<script>x");
    expect(() => mail({ link: "javascript:alert(1)" })).toThrow();
  });
  it("says plainly when nothing changed", () => {
    const empty = { ...PREVIEW_FACTS, changes: { total: 0, confirmed: 0, notConfirmed: 0, notChecked: 0, items: [] } };
    expect(mail({ facts: empty }).html).toContain("No Releases were recorded this month.");
  });
});

describe("Hired work in words a person reads", () => {
  it("shows scope as words and whose move it is", () => {
    expect(scopeWords(["website_delivery"])).toBe("Website delivery");
    const item = { status: "requested" as const, providerAcceptance: { status: "accepted" as const, actorId: "a", acceptedAt: "2026-10-01T00:00:00Z", note: null } };
    const proposed = { status: "proposed" } as Parameters<typeof deliverySentence>[0];
    expect(deliverySentence(proposed, item, "business")).toBe("Scope and terms wait for your yes.");
    expect(deliverySentence(proposed, item, "agency")).toBe("Scope and terms wait for the business to accept them.");
  });
  it("tracks a website request without an account and marks the current step", () => {
    const html = renderToStaticMarkup(createElement(SiteDeliveryStatus, { businessName: "Harbor Dental", status: "drafting", submittedAt: "2026-10-09T15:00:00Z", maskedEmail: "a***@harbordental.example" }));
    expect(html).toContain("Step 3 of 6");
    expect(html).toContain('aria-current="step"');
    expect(html).toContain("Runs on Strelva");
  });
});
