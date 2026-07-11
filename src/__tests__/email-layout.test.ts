import { describe, expect, it } from "vitest";
import { renderEmailHtml, renderEmailText, escapeEmailHtml } from "@/lib/email/layout";

describe("email design system layout", () => {
  it("renders a full branded HTML document with the heading and body", () => {
    const html = renderEmailHtml({
      heading: "Your site is live",
      paragraphs: ["Hi Chelsea, your site is live."],
      button: { label: "View dashboard", url: "https://admin.example.com" },
    });
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Your site is live");
    expect(html).toContain("Hi Chelsea, your site is live.");
    // The one brand sage (ink sage on white), the real logo, and the CTA href.
    expect(html).toContain("#447a4f");
    expect(html).toContain('alt="Strelva"');
    expect(html).toContain('href="https://admin.example.com"');
    expect(html).toContain("View dashboard");
  });

  it("escapes user content in headings, paragraphs, and rows", () => {
    const html = renderEmailHtml({
      heading: "New lead: Harbor & Pine <script>",
      paragraphs: ["A <b>bold</b> & tricky line"],
      rows: [{ label: "Business", value: "Harbor & Pine <x>" }],
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>bold</b>");
    expect(html).toContain("Harbor &amp; Pine");
    expect(html).toContain("&lt;x&gt;");
    expect(escapeEmailHtml(`a&b<c>"d'`)).toBe("a&amp;b&lt;c&gt;&quot;d&#39;");
  });

  it("renders footer manage/unsubscribe links only when provided", () => {
    const withLinks = renderEmailHtml({
      heading: "H",
      manageUrl: "https://x/manage",
      unsubscribeUrl: "https://x/unsub",
    });
    expect(withLinks).toContain("https://x/manage");
    expect(withLinks).toContain("Unsubscribe");

    const bare = renderEmailHtml({ heading: "H" });
    expect(bare).not.toContain("Unsubscribe");
  });

  it("produces a plain-text counterpart with the same content", () => {
    const text = renderEmailText({
      heading: "Your site is live",
      paragraphs: ["Hi Chelsea."],
      rows: [{ label: "Plan", value: "Monthly" }],
      button: { label: "View", url: "https://x" },
      unsubscribeUrl: "https://x/unsub",
    });
    expect(text).toContain("Your site is live");
    expect(text).toContain("Hi Chelsea.");
    expect(text).toContain("Plan: Monthly");
    expect(text).toContain("View: https://x");
    expect(text).toContain("\nStrelva");
    expect(text).not.toContain("<");
  });
});
