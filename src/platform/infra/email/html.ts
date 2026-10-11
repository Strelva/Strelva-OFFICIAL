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

// "style" is intentionally omitted: DOMPurify's ALLOWED_URI_REGEXP applies only
// to href/src/action/xlink:href — it does NOT sanitize inline style values.
// Allowing style lets a content:write editor embed CSS expressions
// (expression(alert(1))) or url(javascript:…) background-image beacons that
// exfiltrate subscriber addresses. Email clients that need inline styles should
// receive them from the hard-coded renderEmailHtml layout, never from
// tenant-supplied newsletter bodies.
const ALLOWED_ATTR = ["href", "src", "alt", "title", "width", "height", "align"];

export function sanitizeEmailHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Only http(s) and mailto links/images — blocks javascript:, data:, etc.
    // Note: this regexp governs href/src/action/xlink:href only (DOMPurify
    // v2 behaviour); inline style values are protected by omitting "style"
    // from ALLOWED_ATTR above.
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input"],
    // DOMPurify strips ALL event-handler attributes (on*) by default; no
    // explicit FORBID_ATTR list is needed and a partial list gives a false
    // sense of completeness. The real gap was the style attribute (above).
  });
}

/** Plain-text fallback derived from already-sanitized HTML. */
export function htmlToPlainText(html: string): string {
  return sanitizeEmailHtml(html)
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
