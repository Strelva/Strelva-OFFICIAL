/**
 * XA · E2, the yes on the phone (October 15–16, 2026). The page an owner
 * reaches from a decision email: no sign-in, one decision, one ink pill.
 *
 * Plain HTML strings because the approve route answers a GET from any mail
 * client or scanner without React or a session. Same tokens as the workspace
 * (paper, ink, moss for live, clay for what waits), DM Sans only, light and
 * dark from the phone's own setting, focus rings, no motion.
 *
 * The page belongs to the business: its name (and owner) head it, never the
 * platform's mark. An agency brand adds the agency's name, logo or initial,
 * and accent (`brandXaPage`); Strelva Agency is treated like any agency.
 */
import { BRAND_CREDIT, brandColors, type OwnerBrand } from "@/platform/infra/agency-brand";
import { XA_YES_LABELS } from "@/platform/presentation/place-labels";

export type XaPageTone = "waits" | "done" | "quiet" | "bad";

export const XA_INK = "#161715";
const ON_INK = "#ffffff";
/** Marks where the pill color sits so an agency brand can replace it. */
const PILL_COLORS = `background:${XA_INK};color:${ON_INK}`;
const AGENCY_SLOT = "<!--xa-agency-->";
const IDENTITY_SLOT = "<!--xa-identity-->";

export function escapeXa(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** A square initial tile: the mark of a business or agency with no logo. */
function monogram(name: string, size = 28): string {
  const initial = (name.trim().match(/[\p{L}\p{N}]/u)?.[0] ?? "?").toUpperCase();
  return `<span class="mono" aria-hidden="true" style="width:${size}px;height:${size}px;flex:0 0 ${size}px">${escapeXa(initial)}</span>`;
}

const STYLE = `
:root{--canvas:#faf9f6;--surface:#fff;--inset:#f1f0ec;--line:#e6e5e0;--text:#161715;--body:#3a3c38;--text2:#6b6f68;--text3:#81847d;--moss:#2f5236;--live:#3e8e5a;--need:#9c522c;--needdot:#c9773f;--tint:#edf1ea;--open:#edf1ea;--opentext:#2f5236;--shut:#f6e6da;--shuttext:#9c522c}
@media (prefers-color-scheme:dark){:root{--canvas:#141513;--surface:#1c1d1b;--inset:#232421;--line:#2e2f2c;--text:#f2f1ec;--body:#d9d8d2;--text2:#a7aaa2;--text3:#8d9088;--moss:#8fbf98;--live:#6cbf86;--need:#e0a173;--needdot:#d98b55;--tint:#1f2a21;--open:#1f2a21;--opentext:#a9d3b1;--shut:#2e221a;--shuttext:#e0a173}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;min-height:100dvh;background:var(--canvas);color:var(--text);font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.5;font-variant-numeric:tabular-nums}
main{display:flex;flex-direction:column;min-height:100dvh;max-width:480px;margin:0 auto;padding:20px 20px 28px}
.who{display:flex;align-items:center;gap:10px;min-height:44px}
.who b{font-size:16px;font-weight:600;letter-spacing:-.2px;overflow-wrap:anywhere}
.who small{margin-left:auto;color:var(--text2);font-size:13px;text-align:right}
.who img{max-height:28px;max-width:120px;object-fit:contain}
.mono{display:inline-flex;align-items:center;justify-content:center;border-radius:8px;background:var(--text);color:var(--canvas);font-size:14px;font-weight:600;line-height:1}
.status{display:inline-flex;align-items:center;gap:8px;margin:28px 0 8px;font-size:14px;font-weight:500}
.status i{width:7px;height:7px;border-radius:999px;background:var(--text3)}
.status[data-tone=waits]{color:var(--need)}.status[data-tone=waits] i{background:var(--needdot)}
.status[data-tone=done]{color:var(--moss)}.status[data-tone=done] i{background:var(--live)}
.status[data-tone=bad]{color:var(--need)}.status[data-tone=bad] i{background:var(--needdot)}
.gap{height:28px}
h1{margin:0;font-size:28px;line-height:34px;font-weight:600;letter-spacing:-.6px;overflow-wrap:anywhere;text-wrap:balance}
.lede{margin:8px 0 0;color:var(--text2);white-space:pre-line;overflow-wrap:anywhere}
.by{margin:6px 0 0;color:var(--text2);font-size:14px}
.links{margin:16px 0 0;font-size:15px;color:var(--text3)}
.links a{color:var(--moss);font-weight:600;text-decoration:none;display:inline-block;padding:10px 0}
.page{margin:20px 0 0;border:1px solid var(--line);border-radius:16px;background:var(--surface);overflow:hidden}
.page p.address{margin:0;padding:9px 14px;border-bottom:1px solid var(--line);background:var(--inset);color:var(--text2);font-size:13px;text-align:center}
.page p.what{margin:0;padding:12px 12px 0;color:var(--text3);font-size:13px;font-weight:500}
.page ul{margin:0;padding:8px 16px 12px;list-style:none}
.page li{padding:10px 0;border-top:1px solid var(--line);white-space:pre-wrap;overflow-wrap:anywhere;font-size:15px}
.page li:first-child{border-top:0}
.week{display:grid;grid-template-columns:repeat(var(--days,6),minmax(0,1fr));gap:6px;padding:10px 12px 14px}
.day{display:flex;flex-direction:column;gap:6px;min-width:0}
.day p{display:flex;flex-direction:column;align-items:center;margin:0 0 2px;color:var(--text2);font-size:12px;line-height:1.3}
.day p b{color:var(--text);font-size:17px;font-weight:600}
.day[data-closed] p b{color:var(--text3);font-weight:500}
.t,.x{display:flex;align-items:center;justify-content:center;min-height:30px;border-radius:8px;font-size:12px;font-weight:500;white-space:nowrap}
.t{background:var(--open);color:var(--opentext)}
.x{background:var(--shut);color:var(--shuttext)}
.n{padding-top:6px;text-align:center;color:var(--text3);font-size:12px}
.notes{margin:0;padding:12px 14px;border-top:1px solid var(--line);color:var(--body);font-size:14px}
.notes span{display:block}
.says{display:flex;gap:12px;align-items:flex-start;margin:24px 0 0}
.says img{width:36px;height:36px;border-radius:999px;flex:0 0 36px}
.says p{margin:6px 0 0;color:var(--body)}
.bottom{margin-top:auto;padding-top:32px}
form{margin:0}
.pill{display:flex;align-items:center;justify-content:center;width:100%;min-height:52px;padding:0 24px;border:0;border-radius:999px;font:inherit;font-size:17px;font-weight:600;letter-spacing:-.2px;text-decoration:none;cursor:pointer}
.text{display:flex;align-items:center;justify-content:center;width:100%;min-height:44px;margin-top:8px;padding:0;border:0;background:none;color:var(--moss);font:inherit;font-size:15px;font-weight:600;text-decoration:none;cursor:pointer}
.text.left{justify-content:flex-start;width:auto;margin:12px 0 0}
.foot{margin:12px 0 0;color:var(--text3);font-size:13px;text-align:center}
.agency{display:flex;align-items:center;justify-content:center;gap:8px;margin:20px 0 0;color:var(--text3);font-size:13px}
.agency img{max-height:18px;max-width:80px;object-fit:contain}
.agency .mono{border-radius:5px;font-size:11px}
.agency a{color:inherit}
a:focus-visible,button:focus-visible{outline:2px solid var(--moss);outline-offset:3px;border-radius:4px}
@media (min-width:720px){main{padding-top:56px}.bottom{margin-top:0}}
`;

/** A read-only week, the same days, times and closures the visitor's booking page shows. */
export interface XaWeek {
  /** Where the change shows, e.g. "harbordental.com/book". */
  address: string;
  days: { key: string; weekday: string; date: string; times: readonly string[]; closed: string | null }[];
  /** Plain sentences under the week ("No one is booked on those days."). */
  notes?: readonly string[];
}

export interface XaIdentity {
  /** The business the decision is for. */
  name: string;
  logoUrl?: string | null;
  /** "Dr. Lin", when the record names the owner. */
  owner?: string | null;
}

export interface XaDecisionPageInput {
  /** HTTP status. */
  status: number;
  tone: XaPageTone;
  /** The status word beside the dot, e.g. "Waits for you". Left out when the headline says it. */
  statusLabel?: string;
  heading: string;
  body?: string;
  /** The business this is for. Unknown (a broken link): no identity, never the platform's. */
  identity?: XaIdentity | null;
  /** Who prepared or did it, already in the owner's words. */
  by?: string;
  /** Every value the yes applies, in full, when the source has no week. */
  lines?: readonly string[];
  /** The page the yes changes, as the visitor sees it. */
  week?: XaWeek;
  /** Where the change shows, e.g. "harbordental.com/book". */
  address?: string;
  /** The website preview, when the source has one. */
  preview?: { url: string; label: string };
  /** The one ink pill. A POST form when `token` is set, otherwise a link. */
  primary?: { label: string; url?: string; token?: string };
  /** The other answer, as a text button that posts its own token ("Not now", "Keep it with Maya"). */
  decline?: { label: string; token: string };
  /** One quiet text link under the actions. */
  secondary?: { label: string; url: string };
  /** Inline text links under the headline, e.g. "See it · Undo". */
  links?: readonly { label: string; url: string }[];
  /** One quiet line under the actions. */
  foot?: string;
}

function weekHtml(week: XaWeek, waits: boolean): string {
  const e = escapeXa;
  const days = week.days.map(day => `<div class="day"${day.closed ? " data-closed" : ""}><p><span>${e(day.weekday)}</span><b>${e(day.date)}</b></p>${day.times.length ? day.times.map(t => `<span class="t">${e(t)}</span>`).join("") : day.closed ? `<span class="x">${e(day.closed.replace(/,.*$/, ""))}</span>` : `<span class="n">Nothing open</span>`}</div>`).join("");
  const label = `${week.address}${waits ? ", after your yes" : ""}. ${week.days.map(d => `${d.weekday} ${d.date}: ${d.times.length ? d.times.join(", ") : d.closed ?? "nothing open"}`).join("; ")}`;
  return `<figure class="page" role="img" aria-label="${e(label)}" style="margin-left:0;margin-right:0"><p class="address">${e(week.address)}</p><p class="what">${waits ? "After your yes" : "Now live"}</p><div class="week" style="--days:${Math.min(week.days.length, 7)}">${days}</div>${week.notes?.length ? `<p class="notes">${week.notes.map(n => `<span>${e(n)}</span>`).join("")}</p>` : ""}</figure>`;
}

function postForm(token: string, button: string): string {
  return `<form method="POST" action="/api/approve"><input type="hidden" name="token" value="${escapeXa(token)}">${button}</form>`;
}

function identityHtml(id: XaIdentity): string {
  const e = escapeXa;
  return `<header class="who">${id.logoUrl ? `<img src="${e(id.logoUrl)}" alt="">` : monogram(id.name)}<b>${e(id.name)}</b>${id.owner ? `<small>For ${e(id.owner)}</small>` : ""}</header>`;
}

/** Put the business at the top of a page built before the route knew it. */
export function identifyXaPage(html: string, identity: XaIdentity | null | undefined): string {
  return identity?.name?.trim() ? html.replace(IDENTITY_SLOT, identityHtml(identity)) : html;
}

/** One decision page, light and dark, phone first. */
export function xaDecisionPageHtml(input: XaDecisionPageInput): string {
  const e = escapeXa;
  const bad = input.tone === "bad";
  const waits = input.tone === "waits";
  const id = input.identity;
  const header = id?.name?.trim() ? identityHtml(id) : IDENTITY_SLOT;
  const change = input.week ? weekHtml(input.week, waits)
    : input.lines?.length ? `<figure class="page" aria-label="${e(input.address ? `${input.address}, after your yes` : "What changes")}" style="margin-left:0;margin-right:0">${input.address ? `<p class="address">${e(input.address)}</p>` : ""}<p class="what">${waits ? "After your yes" : "What changed"}</p><ul>${input.lines.map(line => `<li>${e(line)}</li>`).join("")}</ul></figure>`
      : "";
  const preview = input.preview ? `<a class="text left" href="${e(input.preview.url)}">${e(input.preview.label)}</a>` : "";
  // Pebble stays in frame for bad news and says it in one sentence.
  const words = !input.body ? ""
    : bad ? `<div class="says"><img src="/xa/pebble-avatar.webp" alt="" width="36" height="36"><p>${e(input.body)}</p></div>`
      : `<p class="lede">${e(input.body)}</p>`;
  const links = input.links?.length ? `<p class="links">${input.links.map(l => `<a href="${e(l.url)}">${e(l.label)}</a>`).join(" · ")}</p>` : "";
  const primary = !input.primary ? ""
    : input.primary.token
      ? postForm(input.primary.token, `<button type="submit" class="pill" data-xa-primary style="${PILL_COLORS}">${e(input.primary.label)}</button>`)
      : input.primary.url ? `<a class="pill" data-xa-primary href="${e(input.primary.url)}" style="${PILL_COLORS}">${e(input.primary.label)}</a>` : "";
  // With no yes on the page (a not-yet link), the decision sits right under the item it keeps.
  const besideItem = Boolean(input.decline && !input.primary);
  const decline = input.decline ? postForm(input.decline.token, `<button type="submit" class="text${besideItem ? " left" : ""}" data-xa-decline>${e(input.decline.label)}</button>`) : "";
  const secondary = input.secondary ? `<a class="text" href="${e(input.secondary.url)}">${e(input.secondary.label)}</a>` : "";
  const foot = input.foot ? `<p class="foot">${e(input.foot)}</p>` : "";
  const status = input.statusLabel ? `<p class="status" data-tone="${input.tone}"><i aria-hidden="true"></i>${e(input.statusLabel)}</p>` : `<div class="gap"></div>`;
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="light dark"><meta name="robots" content="noindex,nofollow"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300..700&display=swap" rel="stylesheet"><title>${e(input.heading)}</title><style>${STYLE}</style></head>
<body><main>
${header}
${status}
<h1>${e(input.heading)}</h1>
${input.by ? `<p class="by">${e(input.by)}</p>` : ""}
${words}
${links}
${change}${preview}${besideItem ? decline : ""}
<div class="bottom">${primary}${besideItem ? "" : decline}${secondary}${foot}${AGENCY_SLOT}</div>
</main></body></html>`;
}

/**
 * An agency-branded page: the business still heads it; the agency's logo (or
 * its initial, never Strelva's mark), name and "Runs on Strelva." sit under
 * the actions, and the agency's accent replaces the ink pill. Strelva Agency
 * gets the same treatment as any agency.
 */
export function brandXaPage(html: string, brand: OwnerBrand): string {
  if (!brand.agencyId) return html;
  const e = escapeXa;
  const colors = brandColors(brand.accentColor);
  const logo = brand.logoUrl ? `<img src="${e(brand.logoUrl)}" alt="">` : monogram(brand.name, 18);
  const contact = brand.replyTo ? ` · <a href="mailto:${e(brand.replyTo)}">Contact ${e(brand.name)}</a>` : "";
  const line = `<p class="agency">${logo}<span><b>${e(brand.name)}</b> · ${BRAND_CREDIT}${contact}</span></p>`;
  return html
    .replace(AGENCY_SLOT, line)
    .replaceAll(PILL_COLORS, `background:${colors.accent};color:${colors.onAccent}`);
}

/**
 * The words on the ink pill, from the one label set (XA_YES_LABELS): "Make it
 * live" for every owner yes, "Send" for a reply. No "Approve" or "Put it live".
 */
export function xaYesLabel(kind: string | undefined, action: "approve" | "not_yet"): string {
  if (action === "not_yet") return XA_YES_LABELS.notYet;
  if (kind && (kind === "customer.message" || kind.startsWith("review.reply"))) return XA_YES_LABELS.send;
  return XA_YES_LABELS.yes;
}

function putsLive(kind: string): boolean {
  return kind === "system.go_live" || kind === "system.change_live" || kind.startsWith("copy.") || kind === "structure" || kind === "google.post" || kind === "google.photo";
}

/** A change that goes live can be undone from Home; a sent message cannot. */
export function xaUndoable(kind: string | undefined): boolean {
  return Boolean(kind && putsLive(kind) && !kind.startsWith("google."));
}

/** "Maya at North Studio", the preparer in the owner's words, for the not-yet text button. */
export function xaKeepWith(preparer: string | undefined): string {
  const first = preparer?.trim().split(/\s+at\s+|\s/)[0];
  return first ? `Keep it with ${first}` : "Not now";
}

/** The done page, shared by the route and its preview: one headline, who did what, then See it · Undo. */
export function xaDoneInput(input: { changed: string | null; verified: boolean; /** Who prepared or did it, as a sentence ("Maya at North Studio prepared it"). */ who?: string; identity?: XaIdentity | null; seeUrl: string; undoUrl?: string | null }): XaDecisionPageInput {
  const what = input.changed?.trim();
  const heading = input.verified ? what ? `${what.charAt(0).toUpperCase()}${what.slice(1)} went live` : "Your change went live" : "Your yes went through";
  const by = `${input.who?.trim() ? `${input.who.trim().replace(/\.$/, "")}. ` : ""}You said yes.${input.verified ? "" : ` Strelva is still checking that ${what ?? "it"} shows.`}`;
  return {
    status: 200, tone: "done", heading, by, identity: input.identity,
    links: [{ label: "See it", url: input.seeUrl }, ...(input.undoUrl ? [{ label: "Undo", url: input.undoUrl }] : [])],
  };
}
