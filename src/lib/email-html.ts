/**
 * Sanitize HTML destined for outbound email (the newsletter body).
 *
 * The newsletter send route forwarded the editor-supplied `body` straight into
 * Resend as `html`. Anyone with content:write (including an editor-role
 * collaborator) could blast arbitrary HTML — <script>, event handlers,
 * javascript: URLs, tracking iframes — to the tenant's entire subscriber list.
 * Run the body through DOMPurify with an email-appropriate allowlist before it
 * leaves the building.
 */

import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = [
  "a", "b", "i", "em", "strong", "u", "s", "p", "br", "hr",
  "ul", "ol", "li", "blockquote", "pre", "code",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "img", "figure", "figcaption",
  "table", "thead", "tbody", "tr", "td", "th",
  "span", "div",
];

const ALLOWED_ATTR = ["href", "src", "alt", "title", "width", "height", "align", "style"];

export function sanitizeEmailHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Only http(s) and mailto links/images — blocks javascript:, data:, etc.
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input"],
    FORBID_ATTR: ["onerror", "onload", "onclick"],
  });
}

/** Plain-text fallback derived from already-sanitized HTML. */
export function htmlToPlainText(html: string): string {
  return sanitizeEmailHtml(html)
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
