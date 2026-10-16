/**
 * XA · E2, the yes on the phone (October 15, 2026). The page an owner reaches
 * from a decision email: no sign-in, one decision, one ink pill.
 *
 * Plain HTML strings because the approve route answers a GET from any mail
 * client or scanner without React or a session. Same tokens as the workspace
 * (paper, ink, moss for live, clay for what waits), DM Sans only, light and
 * dark from the phone's own setting, focus rings, no motion. The agency's
 * accent replaces the ink pill on an agency-branded page (`brandXaPage`).
 */
import { BRAND_CREDIT, brandColors, type OwnerBrand } from "@/platform/infra/agency-brand";

export type XaPageTone = "waits" | "done" | "quiet" | "bad";

export const XA_INK = "#161715";
const ON_INK = "#ffffff";
/** Marks where the pill color sits so an agency brand can replace it. */
const PILL_COLORS = `background:${XA_INK};color:${ON_INK}`;
const IDENTITY_SLOT = "<!--xa-identity-->";

export function escapeXa(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const MARK = `<svg width="24" height="24" viewBox="0 0 48 48" aria-hidden="true"><path fill="currentColor" d="M13.96 16.82a6.6 4-8 1 0 13.08-1.84 6.6 4-8 1 0-13.08 1.84z m-0.82 8.76a9.4 4.9 5 1 0 18.72 1.64 9.4 4.9 5 1 0-18.72-1.64z m-1.32 13.56a12.2 5.6-3 1 0 24.36-1.28 12.2 5.6-3 1 0-24.36 1.28z"/><circle cx="24.5" cy="7.2" r="3.4" fill="#2f5236"/></svg>`;

const STYLE = `
:root{--canvas:#faf9f6;--surface:#fff;--inset:#f1f0ec;--line:#e6e5e0;--text:#161715;--body:#3a3c38;--text2:#6b6f68;--text3:#81847d;--moss:#2f5236;--live:#3e8e5a;--need:#9c522c;--needdot:#c9773f;--tint:#edf1ea}
@media (prefers-color-scheme:dark){:root{--canvas:#141513;--surface:#1c1d1b;--inset:#232421;--line:#2e2f2c;--text:#f2f1ec;--body:#d9d8d2;--text2:#a7aaa2;--text3:#8d9088;--moss:#8fbf98;--live:#6cbf86;--need:#e0a173;--needdot:#d98b55;--tint:#1f2a21}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;min-height:100dvh;background:var(--canvas);color:var(--text);font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.5;font-variant-numeric:tabular-nums}
main{display:flex;flex-direction:column;min-height:100dvh;max-width:480px;margin:0 auto;padding:20px 20px 28px}
.who{display:flex;align-items:center;gap:10px;min-height:44px}
.who b{font-size:16px;font-weight:600;letter-spacing:-.2px;overflow-wrap:anywhere}
.who small{margin-left:auto;color:var(--text3);font-size:13px;text-align:right}
.who img{max-height:32px;max-width:120px;object-fit:contain}
.status{display:inline-flex;align-items:center;gap:8px;margin:28px 0 8px;font-size:14px;font-weight:500}
.status i{width:7px;height:7px;border-radius:999px;background:var(--text3)}
.status[data-tone=waits]{color:var(--need)}.status[data-tone=waits] i{background:var(--needdot)}
.status[data-tone=done]{color:var(--moss)}.status[data-tone=done] i{background:var(--live)}
.status[data-tone=bad]{color:var(--need)}.status[data-tone=bad] i{background:var(--needdot)}
h1{margin:0;font-size:28px;line-height:34px;font-weight:600;letter-spacing:-.6px;overflow-wrap:anywhere}
.lede{margin:8px 0 0;color:var(--text2);white-space:pre-line;overflow-wrap:anywhere}
.by{margin:6px 0 0;color:var(--text2);font-size:14px}
.page{margin:20px 0 0;border:1px solid var(--line);border-radius:16px;background:var(--surface);overflow:hidden}
.page p.address{margin:0;padding:9px 14px;border-bottom:1px solid var(--line);background:var(--inset);color:var(--text2);font-size:13px;text-align:center}
.page p.what{margin:0;padding:12px 16px 0;color:var(--text3);font-size:13px;font-weight:500}
.page ul{margin:0;padding:8px 16px 12px;list-style:none}
.page li{padding:10px 0;border-top:1px solid var(--line);white-space:pre-wrap;overflow-wrap:anywhere;font-size:15px}
.page li:first-child{border-top:0}
.says{display:flex;gap:12px;align-items:flex-start;margin:24px 0 0}
.says img{width:36px;height:36px;border-radius:999px;flex:0 0 36px}
.says p{margin:6px 0 0;color:var(--body)}
.bottom{margin-top:auto;padding-top:32px}
form{margin:0}
.pill{display:flex;align-items:center;justify-content:center;width:100%;min-height:52px;padding:0 24px;border:0;border-radius:999px;font:inherit;font-size:17px;font-weight:600;letter-spacing:-.2px;text-decoration:none;cursor:pointer}
.text{display:flex;align-items:center;justify-content:center;min-height:44px;margin-top:8px;color:var(--moss);font-size:15px;font-weight:600;text-decoration:none}
.foot{margin:16px 0 0;color:var(--text3);font-size:13px;text-align:center}
a:focus-visible,button:focus-visible{outline:2px solid var(--moss);outline-offset:3px}
@media (min-width:720px){main{padding-top:56px}}
`;

export interface XaDecisionPageInput {
  /** HTTP status. */
  status: number;
  tone: XaPageTone;
  /** The status word beside the dot, e.g. "Waits for you". */
  statusLabel: string;
  heading: string;
  body: string;
  /** Who prepared or did it, already in the owner's words. */
  by?: string;
  /** Every value the yes applies, in full. Shown as the page it changes. */
  lines?: readonly string[];
  /** Where the change shows, e.g. "harbordental.com/book". */
  address?: string;
  /** The website preview, when the source has one. */
  preview?: { url: string; label: string };
  /** The one ink pill. A POST form when `token` is set, otherwise a link. */
  primary?: { label: string; url?: string; token?: string };
  /** The one quiet text link. */
  secondary?: { label: string; url: string };
  /** One quiet line under the actions. */
  foot?: string;
}

/** One decision page, light and dark, phone first. */
export function xaDecisionPageHtml(input: XaDecisionPageInput): string {
  const e = escapeXa;
  const bad = input.tone === "bad";
  const lines = input.lines?.length ? `<figure class="page" aria-label="${e(input.address ? `${input.address}, after your yes` : "What changes")}" style="margin-left:0;margin-right:0">${input.address ? `<p class="address">${e(input.address)}</p>` : ""}<p class="what">${input.tone === "waits" ? "After your yes" : "What changed"}</p><ul>${input.lines.map(line => `<li>${e(line)}</li>`).join("")}</ul></figure>` : "";
  const preview = input.preview ? `<p class="by"><a class="text" style="justify-content:flex-start;margin:0" href="${e(input.preview.url)}">${e(input.preview.label)}</a></p>` : "";
  // Pebble stays in frame for bad news and says it in one sentence.
  const words = bad
    ? `<div class="says"><img src="/xa/pebble-avatar.webp" alt="" width="36" height="36"><p>${e(input.body)}</p></div>`
    : `<p class="lede">${e(input.body)}</p>`;
  const primary = !input.primary ? ""
    : input.primary.token
      ? `<form method="POST" action="/api/approve"><input type="hidden" name="token" value="${e(input.primary.token)}"><button type="submit" class="pill" data-xa-primary style="${PILL_COLORS}">${e(input.primary.label)}</button></form>`
      : input.primary.url ? `<a class="pill" data-xa-primary href="${e(input.primary.url)}" style="${PILL_COLORS}">${e(input.primary.label)}</a>` : "";
  const secondary = input.secondary ? `<a class="text" href="${e(input.secondary.url)}">${e(input.secondary.label)}</a>` : "";
  const foot = input.foot ? `<p class="foot">${e(input.foot)}</p>` : "";
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="light dark"><meta name="robots" content="noindex,nofollow"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300..700&display=swap" rel="stylesheet"><title>${e(input.heading)}</title><style>${STYLE}</style></head>
<body><main>
${IDENTITY_SLOT}<header class="who">${MARK}<b>Strelva</b></header>
<p class="status" data-tone="${input.tone}"><i aria-hidden="true"></i>${e(input.statusLabel)}</p>
<h1>${e(input.heading)}</h1>
${input.by ? `<p class="by">${e(input.by)}</p>` : ""}
${words}
${lines}${preview}
<div class="bottom">${primary}${secondary}${foot}</div>
</main></body></html>`;
}

/**
 * An agency-branded page: the agency's name and logo replace Strelva's at the
 * top, "Runs on Strelva." is said once, and the agency's accent replaces the
 * ink pill. Strelva Agency gets the same treatment as any agency.
 */
export function brandXaPage(html: string, brand: OwnerBrand): string {
  if (!brand.agencyId) return html;
  const e = escapeXa;
  const colors = brandColors(brand.accentColor);
  const logo = brand.logoUrl ? `<img src="${e(brand.logoUrl)}" alt="">` : MARK;
  const contact = brand.replyTo ? ` · <a href="mailto:${e(brand.replyTo)}" style="color:inherit">Contact ${e(brand.name)}</a>` : "";
  const identity = `<header class="who">${logo}<b>${e(brand.name)}</b><small>${BRAND_CREDIT}${contact}</small></header>`;
  return html
    .replace(/<!--xa-identity--><header class="who">[\s\S]*?<\/header>/, identity)
    .replaceAll(PILL_COLORS, `background:${colors.accent};color:${colors.onAccent}`);
}

/** The words on the ink pill: the consequence, not "Confirm". */
export function xaYesLabel(kind: string | undefined, action: "approve" | "not_yet"): string {
  if (action === "not_yet") return "Not yet";
  if (!kind) return "Approve";
  if (kind === "system.go_live" || kind === "system.change_live" || kind.startsWith("copy.") || kind === "structure" || kind === "google.post" || kind === "google.photo") return "Put it live";
  if (kind === "customer.message" || kind.startsWith("review.reply")) return "Send it";
  return "Approve";
}
