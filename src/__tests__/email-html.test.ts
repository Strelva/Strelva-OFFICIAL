import { describe, expect, it } from "vitest";
import { sanitizeEmailHtml, htmlToPlainText } from "@/lib/email-html";

describe("sanitizeEmailHtml", () => {
  it("strips script tags and event handlers", () => {
    const out = sanitizeEmailHtml(
      `<p>Hi</p><script>alert(1)</script><img src=x onerror="alert(2)">`
    );
    expect(out).not.toContain("<script");
    expect(out).not.toContain("onerror");
    expect(out).toContain("<p>Hi</p>");
  });

  it("drops javascript: and data: URLs but keeps https links", () => {
    expect(sanitizeEmailHtml(`<a href="javascript:alert(1)">x</a>`)).not.toContain("javascript:");
    expect(sanitizeEmailHtml(`<a href="data:text/html,<script>">x</a>`)).not.toContain("data:");
    const safe = sanitizeEmailHtml(`<a href="https://strelva.com">visit</a>`);
    expect(safe).toContain("https://strelva.com");
  });

  it("removes iframes and forms", () => {
    const out = sanitizeEmailHtml(`<iframe src="https://evil.test"></iframe><form></form><b>ok</b>`);
    expect(out).not.toContain("<iframe");
    expect(out).not.toContain("<form");
    expect(out).toContain("<b>ok</b>");
  });

  it("keeps basic formatting and images", () => {
    const out = sanitizeEmailHtml(`<h1>Title</h1><p><strong>bold</strong></p><img src="https://x/y.png" alt="y">`);
    expect(out).toContain("<h1>Title</h1>");
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("https://x/y.png");
  });
});

describe("htmlToPlainText", () => {
  it("returns sanitized text without tags or script content", () => {
    expect(htmlToPlainText(`<p>Hello <strong>world</strong></p><script>alert(1)</script>`)).toBe(
      "Hello world"
    );
  });
});
