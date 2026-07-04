/**
 * Strelva shared email design system.
 *
 * ONE branded, email-client-safe template that every Strelva email renders
 * through — so onboarding, weekly/monthly reports, transactional alerts, and
 * operator notifications all look like one product. Before this, each email
 * hand-rolled its own HTML with three different greens, three button styles,
 * and three widths.
 *
 * Design: light (white card on warm-gray page), single sage accent, dark ink,
 * one pill button, one footer. Table-based layout + inline styles because email
 * clients (Outlook especially) ignore <style> blocks and flexbox/grid.
 *
 * Callers describe CONTENT (heading, paragraphs, optional button, optional
 * label/value rows, footer) and never touch markup — that's the whole point.
 */

// --- Design tokens (the single source of email brand) ----------------------
const TOKENS = {
  accent: "#5b6f68", // the one sage — replaces #5b6f68 / #7c9a8e / #5d7f70
  ink: "#1a1510", // primary text
  muted: "#6b6b63", // secondary text
  faint: "#9a9a90", // footer text
  hairline: "#e7e5e0",
  page: "#f5f4f2", // outer page background
  card: "#ffffff",
  buttonText: "#ffffff",
  width: 560,
  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
} as const;

export interface EmailRow {
  label: string;
  value: string;
}

export interface EmailButton {
  label: string;
  url: string;
}

export interface EmailOptions {
  /** Hidden preview text shown in the inbox list before the body. */
  preheader?: string;
  /** The one h1. */
  heading: string;
  /** Body paragraphs, rendered in order. Plain text (auto-escaped). */
  paragraphs?: string[];
  /** Optional label/value table (lead details, receipts). Values auto-escaped. */
  rows?: EmailRow[];
  /** Optional primary call-to-action button. */
  button?: EmailButton;
  /** Small print under the body, above the footer (e.g. "for {business}"). */
  footerNote?: string;
  /** When set, renders a "Manage" link in the footer. */
  manageUrl?: string;
  /** When set, renders an "Unsubscribe" link in the footer. */
  unsubscribeUrl?: string;
}

export function escapeEmailHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wordmark(): string {
  // Text wordmark with a sage mark. No hosted logo asset yet; a text mark is
  // reliable across clients and swappable for an <img> later.
  return `<span style="display:inline-block;height:10px;width:10px;border-radius:50%;background:${TOKENS.accent};margin-right:9px;vertical-align:middle;"></span><span style="font-size:18px;font-weight:700;letter-spacing:-0.01em;color:${TOKENS.ink};vertical-align:middle;">Strelva</span>`;
}

function buttonHtml(button: EmailButton): string {
  const label = escapeEmailHtml(button.label);
  // Bulletproof-ish button: padded anchor with a solid background.
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;"><tr><td style="border-radius:999px;background:${TOKENS.accent};">
      <a href="${escapeEmailHtml(button.url)}" style="display:inline-block;padding:12px 26px;font-size:15px;font-weight:600;color:${TOKENS.buttonText};text-decoration:none;border-radius:999px;">${label}</a>
    </td></tr></table>`;
}

function rowsHtml(rows: EmailRow[]): string {
  const body = rows
    .map(
      (r) =>
        `<tr>
          <td style="padding:8px 0;font-size:13px;color:${TOKENS.muted};width:38%;vertical-align:top;">${escapeEmailHtml(r.label)}</td>
          <td style="padding:8px 0;font-size:14px;color:${TOKENS.ink};vertical-align:top;">${escapeEmailHtml(r.value)}</td>
        </tr>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:8px 0 4px;border-top:1px solid ${TOKENS.hairline};">${body}</table>`;
}

function footerHtml(opts: EmailOptions): string {
  const links: string[] = [];
  if (opts.manageUrl) links.push(`<a href="${escapeEmailHtml(opts.manageUrl)}" style="color:${TOKENS.faint};text-decoration:underline;">Manage</a>`);
  if (opts.unsubscribeUrl) links.push(`<a href="${escapeEmailHtml(opts.unsubscribeUrl)}" style="color:${TOKENS.faint};text-decoration:underline;">Unsubscribe</a>`);
  const linkRow = links.length ? ` &nbsp;·&nbsp; ${links.join(" &nbsp;·&nbsp; ")}` : "";
  const note = opts.footerNote ? `<div style="margin-bottom:6px;">${escapeEmailHtml(opts.footerNote)}</div>` : "";
  return `<div style="padding:24px 0 8px;font-size:12px;line-height:1.5;color:${TOKENS.faint};">
      ${note}Strelva${linkRow}
    </div>`;
}

/** Full branded HTML email document. */
export function renderEmailHtml(opts: EmailOptions): string {
  const preheader = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeEmailHtml(opts.preheader)}</div>`
    : "";
  const paragraphs = (opts.paragraphs ?? [])
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${TOKENS.muted};">${escapeEmailHtml(p)}</p>`,
    )
    .join("");
  const rows = opts.rows && opts.rows.length ? rowsHtml(opts.rows) : "";
  const button = opts.button ? buttonHtml(opts.button) : "";

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:${TOKENS.page};">
${preheader}
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${TOKENS.page};padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" width="${TOKENS.width}" style="max-width:${TOKENS.width}px;width:100%;background:${TOKENS.card};border:1px solid ${TOKENS.hairline};border-radius:14px;font-family:${TOKENS.font};">
      <tr><td style="padding:28px 32px 0;">${wordmark()}</td></tr>
      <tr><td style="padding:20px 32px 0;">
        <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;font-weight:700;color:${TOKENS.ink};">${escapeEmailHtml(opts.heading)}</h1>
        ${paragraphs}${rows}${button}
      </td></tr>
      <tr><td style="padding:12px 32px 26px;"><div style="border-top:1px solid ${TOKENS.hairline};">${footerHtml(opts)}</div></td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

/** Plain-text counterpart — same content, no markup. */
export function renderEmailText(opts: EmailOptions): string {
  const parts: string[] = [opts.heading, ""];
  for (const p of opts.paragraphs ?? []) parts.push(p, "");
  if (opts.rows) for (const r of opts.rows) parts.push(`${r.label}: ${r.value}`);
  if (opts.rows && opts.rows.length) parts.push("");
  if (opts.button) parts.push(`${opts.button.label}: ${opts.button.url}`, "");
  if (opts.footerNote) parts.push(opts.footerNote);
  parts.push("— Strelva");
  if (opts.manageUrl) parts.push(`Manage: ${opts.manageUrl}`);
  if (opts.unsubscribeUrl) parts.push(`Unsubscribe: ${opts.unsubscribeUrl}`);
  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
