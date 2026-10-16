/**
 * XA emails (October 15, 2026): E1 "waits for you" and E3 the Monday email.
 *
 * TEMPLATES ONLY. Nothing here sends, signs a link or reads a business. The
 * one send path stays `send.ts`, gated by `enabled.ts`, and client email stays
 * off during the rollout. Callers pass URLs that existing issuance already
 * authorized (the signed `/api/approve` link for E1).
 *
 * Mail clients need tables and inline styles, so the LX look is written out
 * literally: paper canvas, one white card, one ink pill, clay for what waits,
 * moss for what is live (figures use tabular numerals, never monospace).
 * DM Sans arrives by a Google Fonts <link>, so it shows only where the client
 * loads web fonts (Apple Mail, iOS Mail); Gmail and Outlook strip it and show
 * the system sans stack. Light only, like every Strelva email.
 */
import { actorPresentation, type RecordedActor } from "@/platform/presentation/actor";
import { BRAND_CREDIT } from "@/platform/infra/agency-brand";
import { escapeEmailHtml } from "./escape";
import { EMAIL_FONT_LINKS, emailTextLinkStyle } from "./fonts";

const X = {
  canvas: "#edece7", surface: "#ffffff", inset: "#f4f3ef", line: "#e6e5e0",
  text: "#161715", body: "#3a3c38", muted: "#6b6f68", faint: "#81847d",
  ink: "#161715", onInk: "#ffffff", moss: "#2f5236", tint: "#edf1ea",
  need: "#9c522c", needDot: "#c9773f",
  font: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
} as const;

export interface XaMailAction { label: string; url: string }

/** The page a change lands on, the way its visitors will read it. */
export interface XaMailPage { address: string; title: string; change: string; note?: string }

export interface XaMailChange {
  /** Short date, e.g. "Nov 10". */
  date: string;
  /** What was done, as a verb phrase that follows the actor: "Moved the Book a visit button to the top of the home page". */
  text: string;
  /** Who acted, in the owner's words: "You", "Strelva", "Maya at North Studio". */
  who: string;
}

/** A change as one sentence that leads with whoever acted: "Maya at North Studio moved the Book a visit button…". */
export function xaChangeSentence(change: Pick<XaMailChange, "text" | "who">): string {
  const what = change.text.trim().replace(/[.!?]+$/, "");
  const who = change.who.trim();
  const sentence = who ? `${who} ${what.charAt(0).toLowerCase()}${what.slice(1)}` : `${what.charAt(0).toUpperCase()}${what.slice(1)}`;
  return `${sentence}.`;
}

export type XaMailBlock =
  | { kind: "identity"; business: string; logoUrl?: string | null }
  | { kind: "waits"; label: string }
  | { kind: "headline"; text: string; lede?: string }
  | { kind: "page"; page: XaMailPage }
  | { kind: "primary"; action: XaMailAction; note?: string; align?: "block" | "start" }
  | { kind: "art"; url: string; alt: string; width: number; height: number }
  | { kind: "period"; text: string }
  | { kind: "figure"; value: string; label: string; detail?: string; /** Pebble beside the number, holding the week. */ art?: { url: string; alt: string } }
  | { kind: "changes"; label: string; rows: readonly XaMailChange[] }
  | { kind: "sentence"; text: string; muted?: boolean }
  /** The one sentence a report leads with (replaces a hero figure): ink, then one quiet clause with a different fact. */
  | { kind: "lead"; text: string; quiet?: string }
  /** The one change that mattered: a label, the sentence naming whoever acted, when, and a text link to see it. */
  /** The one change that mattered: a sentence that already names whoever acted, then its date and an optional "See it". */
  | { kind: "change"; label: string; text: string; date?: string; link?: XaMailAction }
  | { kind: "rule" }
  /* Visitor blocks (xs-visitor, Oct 16): the business writing to its own customers. */
  /** A state as a dot and a word: clay for what waits on the reader, moss for confirmed, quiet for ended. */
  | { kind: "status"; tone: "waits" | "live" | "ended"; label: string }
  /** The one thing the email is about: a day, a time in large figures, then what and where. */
  | { kind: "when"; day: string; time: string; detail?: string; struck?: boolean }
  /** Plain label and value lines with a hairline between. */
  | { kind: "rows"; rows: readonly { label: string; value: string }[] }
  /** The reader's own words, quoted back in a tint. */
  | { kind: "quote"; label: string; text: string }
  /** Times or dates to choose from, each a link to the page where the choice is confirmed. */
  | { kind: "choices"; label?: string; items: readonly XaMailAction[] }
  /** One quiet text action under the primary, or on its own. */
  | { kind: "link"; action: XaMailAction }
  /** Already sanitized HTML (a newsletter issue). Never pass unsanitized content. */
  | { kind: "html"; html: string; text: string };

export interface XaMail {
  subject: string;
  preheader?: string;
  /** Who it is from, as the mail client shows it: "North Studio via Strelva". */
  fromName: string;
  blocks: readonly XaMailBlock[];
  /** One quiet line under the card. */
  footer: string;
  /** Owner and agency mail end with an email settings link. Visitor mail has none. */
  settings?: XaMailAction;
  /** Further quiet links after the footer, e.g. "Unsubscribe". */
  footerLinks?: readonly XaMailAction[];
  /**
   * Visitor mail only: the business's own accent (already contrast-checked on
   * white) for its button, links and initial, and its logo. Absent: XA ink.
   */
  brand?: XaMailBrand;
}

export interface XaMailBrand { accent: string; onAccent: string; logoUrl?: string | null }

const e = escapeEmailHtml;
function url(value: string): string {
  if (/[\u0000- \u007f\\]/.test(value)) throw new Error("Unsafe email URL");
  if (value.startsWith("/") && !value.startsWith("//")) return e(value);
  const parsed = new URL(value);
  if (!["https:", "http:", "mailto:"].includes(parsed.protocol)) throw new Error("Unsafe email URL");
  return e(value);
}
const HEX = /^#[0-9a-f]{6}$/i;
/** The fill and label for the one button and links: the business's accent when it has one. */
function tone(brand?: XaMailBrand) {
  return brand && HEX.test(brand.accent) && HEX.test(brand.onAccent) ? { fill: brand.accent, on: brand.onAccent, link: brand.accent } : { fill: X.ink, on: X.onInk, link: X.moss };
}
const table = (body: string, style = "", width = "100%") => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${width}" style="border-collapse:separate;${style}">${body}</table>`;
const pill = (action: XaMailAction, block: boolean, brand?: XaMailBrand) => table(`<tr><td align="center" bgcolor="${tone(brand).fill}" style="background:${tone(brand).fill};border-radius:999px;"><a href="${url(action.url)}" style="display:block;padding:15px 28px;font-family:${X.font};font-size:17px;line-height:22px;font-weight:600;color:${tone(brand).on};text-decoration:none;border-radius:999px;">${e(action.label)}</a></td></tr>`, "", block ? "100%" : "");

function block(b: XaMailBlock, brand?: XaMailBrand): string {
  switch (b.kind) {
    // The business's own logo when it has one (its name as the alt), otherwise its name as a plain wordmark in its accent. Never a tile.
    case "identity": { const logo = b.logoUrl ?? brand?.logoUrl;
      return logo ? `<p style="margin:0;line-height:0;"><img src="${url(logo)}" alt="${e(b.business)}" height="32" style="display:block;height:32px;width:auto;max-width:220px;border:0;"></p>`
        : `<p style="margin:0;font-size:18px;line-height:24px;font-weight:600;letter-spacing:-0.2px;color:${brand ? tone(brand).link : X.text};">${e(b.business)}</p>`; }
    case "waits": return `<p style="margin:0;font-size:15px;line-height:22px;color:${X.need};"><span style="display:inline-block;width:7px;height:7px;margin-right:8px;border-radius:999px;background:${X.needDot};vertical-align:1px;"></span>${e(b.label)}</p>`;
    case "headline": return `<h1 style="margin:0;font-size:28px;line-height:34px;font-weight:600;letter-spacing:-0.6px;color:${X.text};overflow-wrap:anywhere;">${e(b.text)}</h1>${b.lede ? `<p style="margin:12px 0 0;font-size:16px;line-height:24px;color:${X.muted};">${e(b.lede)}</p>` : ""}`;
    case "page": return table(`<tr><td align="center" style="padding:10px 16px;background:${X.inset};border-bottom:1px solid ${X.line};border-radius:16px 16px 0 0;font-size:13px;line-height:18px;color:${X.muted};">${e(b.page.address)}</td></tr>
      <tr><td style="padding:20px 24px 22px;"><p style="margin:0 0 12px;font-size:20px;line-height:26px;font-weight:600;color:${X.text};">${e(b.page.title)}</p>
      ${table(`<tr><td style="padding:12px 14px;background:${X.tint};border-radius:10px;font-size:16px;line-height:24px;color:${X.text};">${e(b.page.change)}</td></tr>`)}
      ${b.page.note ? `<p style="margin:12px 0 0;font-size:13px;line-height:18px;color:${X.faint};">${e(b.page.note)}</p>` : ""}</td></tr>`, `border:1px solid ${X.line};border-radius:16px;background:${X.surface};`);
    case "primary": return `${pill(b.action, b.align !== "start", brand)}${b.note ? `<p style="margin:14px 0 0;text-align:center;font-size:13px;line-height:18px;color:${X.muted};">${e(b.note)}</p>` : ""}`;
    case "art": return `<p style="margin:0;text-align:center;"><img src="${url(b.url)}" alt="${e(b.alt)}" width="${b.width}" height="${b.height}" style="display:inline-block;max-width:100%;height:auto;border:0;"></p>`;
    case "period": return `<p style="margin:0;font-size:13px;line-height:18px;color:${X.faint};">${e(b.text)}</p>`;
    case "figure": return table(`<tr>${b.art ? `<td valign="middle" style="padding-right:14px;"><img src="${url(b.art.url)}" alt="${e(b.art.alt)}" width="64" height="64" style="display:block;border:0;"></td>` : ""}<td valign="middle" style="padding-right:16px;font-size:64px;line-height:64px;font-weight:300;letter-spacing:-2px;color:${X.text};font-variant-numeric:tabular-nums;white-space:nowrap;">${e(b.value)}</td><td valign="middle" style="width:100%;"><p style="margin:0;font-size:19px;line-height:26px;color:${X.text};">${e(b.label)}</p>${b.detail ? `<p style="margin:2px 0 0;font-size:14px;line-height:20px;color:${X.muted};">${e(b.detail)}</p>` : ""}</td></tr>`);
    case "changes": return `<p style="margin:0 0 6px;font-size:13px;line-height:18px;color:${X.faint};">${e(b.label)}</p>${table(b.rows.map(r => `<tr><td valign="top" style="padding:8px 16px 8px 0;font-size:14px;line-height:22px;color:${X.faint};white-space:nowrap;">${e(r.date)}</td><td valign="top" style="padding:8px 0;width:100%;font-size:15px;line-height:22px;color:${X.text};overflow-wrap:anywhere;">${e(r.text)}</td><td valign="top" align="right" style="padding:8px 0 8px 16px;font-size:13px;line-height:22px;color:${X.muted};white-space:nowrap;">${e(r.who)}</td></tr>`).join(""))}`;
    case "lead": return `<p style="margin:0;font-size:24px;line-height:32px;font-weight:500;letter-spacing:-0.4px;color:${X.text};overflow-wrap:anywhere;">${e(b.text)}${b.quiet ? `<span style="color:${X.muted};"> ${e(b.quiet)}</span>` : ""}</p>`;
    case "change": return `<p style="margin:0 0 6px;font-size:13px;line-height:18px;color:${X.faint};">${e(b.label)}</p><p style="margin:0;font-size:16px;line-height:24px;color:${X.text};overflow-wrap:anywhere;">${e(b.text)}${b.date || b.link ? ` <span style="white-space:nowrap;">${b.date ? `<span style="color:${X.faint};">${e(b.date)}</span>` : ""}${b.date && b.link ? `<span style="color:${X.faint};"> · </span>` : ""}${b.link ? `<a href="${url(b.link.url)}" style="${emailTextLinkStyle(X.text)}">${e(b.link.label)}</a>` : ""}</span>` : ""}</p>`;
    case "sentence": return `<p style="margin:0;font-size:14px;line-height:22px;color:${b.muted ? X.faint : X.body};">${e(b.text)}</p>`;
    case "rule": return `<div style="height:1px;line-height:1px;font-size:1px;background:${X.line};">&nbsp;</div>`;
    case "status": { const color = b.tone === "waits" ? X.need : b.tone === "live" ? X.moss : X.muted; const dot = b.tone === "waits" ? X.needDot : b.tone === "live" ? "#3e8e5a" : X.faint;
      return `<p style="margin:0;font-size:15px;line-height:22px;color:${color};"><span style="display:inline-block;width:7px;height:7px;margin-right:8px;border-radius:999px;background:${dot};vertical-align:1px;"></span>${e(b.label)}</p>`; }
    case "when": return table(`<tr><td style="padding:18px 0;border-top:1px solid ${X.line};border-bottom:1px solid ${X.line};"><p style="margin:0;font-size:15px;line-height:22px;color:${X.muted};">${e(b.day)}</p><p style="margin:2px 0 0;font-size:34px;line-height:40px;font-weight:600;letter-spacing:-0.8px;color:${b.struck ? X.muted : X.text};font-variant-numeric:tabular-nums;${b.struck ? "text-decoration:line-through;" : ""}">${e(b.time)}</p>${b.detail ? `<p style="margin:6px 0 0;font-size:15px;line-height:22px;color:${X.body};overflow-wrap:anywhere;">${e(b.detail)}</p>` : ""}</td></tr>`);
    case "rows": return table(b.rows.map(r => `<tr><td valign="top" style="padding:12px 16px 12px 0;border-bottom:1px solid ${X.line};font-size:14px;line-height:22px;color:${X.muted};white-space:nowrap;">${e(r.label)}</td><td valign="top" align="right" style="padding:12px 0;border-bottom:1px solid ${X.line};font-size:15px;line-height:22px;color:${X.text};overflow-wrap:anywhere;">${e(r.value)}</td></tr>`).join(""), `border-top:1px solid ${X.line};`);
    case "quote": return `<p style="margin:0 0 8px;font-size:13px;line-height:18px;color:${X.muted};">${e(b.label)}</p>${table(`<tr><td style="padding:12px 14px;background:${X.inset};border-radius:10px;font-size:15px;line-height:23px;color:${X.body};white-space:pre-line;overflow-wrap:anywhere;">${e(b.text)}</td></tr>`)}`;
    // One hairline-divided list inside the card, never a stack of boxes: each time is a link.
    case "choices": return `${b.label ? `<p style="margin:0 0 4px;font-size:13px;line-height:18px;color:${X.muted};">${e(b.label)}</p>` : ""}${table(b.items.map(item => `<tr><td style="border-bottom:1px solid ${X.line};"><a href="${url(item.url)}" style="display:block;padding:13px 0;font-size:16px;line-height:22px;font-weight:600;color:${X.text};text-decoration:none;font-variant-numeric:tabular-nums;">${e(item.label)}<span style="float:right;font-size:15px;font-weight:600;color:${tone(brand).link};">Pick</span></a></td></tr>`).join(""), `border-top:1px solid ${X.line};`)}`;
    case "link": return `<p style="margin:0;text-align:center;"><a href="${url(b.action.url)}" style="display:inline-block;padding:4px 0;font-size:15px;line-height:22px;font-weight:600;color:${tone(brand).link};text-decoration:none;">${e(b.action.label)}</a></p>`;
    case "html": return `<div style="font-size:16px;line-height:26px;color:${X.body};overflow-wrap:anywhere;">${b.html}</div>`;
  }
}

const GAP: Partial<Record<XaMailBlock["kind"], number>> = { lead: 12, change: 22, identity: 0, waits: 20, status: 20, headline: 8, page: 24, primary: 20, art: 0, period: 24, figure: 20, changes: 20, sentence: 16, rule: 24, when: 24, rows: 20, quote: 20, choices: 20, link: 12, html: 20 };

/** The card body. Also what the preview frames, so preview and mail never drift. */
export function renderXaMailBody(mail: XaMail): string {
  const rows = mail.blocks.map((b, i) => `<tr><td style="padding-top:${i ? GAP[b.kind] ?? 16 : 0}px;">${block(b, mail.brand)}</td></tr>`).join("");
  const card = table(`<tr><td style="padding:36px 40px 32px;">${table(rows)}</td></tr>`, `max-width:640px;background:${X.surface};border-radius:16px;`, "100%");
  const links = [...(mail.settings ? [mail.settings] : []), ...(mail.footerLinks ?? [])].map(link => ` · <a href="${url(link.url)}" style="color:${X.faint};text-decoration:underline;">${e(link.label)}</a>`).join("");
  const footer = `<p style="margin:20px 0 0;text-align:center;font-size:12px;line-height:18px;color:${X.faint};">${e(mail.footer)}${links}</p>`;
  return table(`<tr><td align="center" style="padding:32px 16px 40px;font-family:${X.font};color:${X.text};">${card}${footer}</td></tr>`, `background:${X.canvas};`);
}

export function renderXaMailHtml(mail: XaMail): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light">${EMAIL_FONT_LINKS}<title>${e(mail.subject)}</title><style>@media (max-width:520px){.xa-card>tbody>tr>td,.xa-card>tr>td{padding:28px 22px 24px!important}}</style></head><body style="margin:0;padding:0;background:${X.canvas};">${mail.preheader ? `<div style="display:none;max-height:0;overflow:hidden;">${e(mail.preheader)}</div>` : ""}${renderXaMailBody(mail).replace('width="100%" style="border-collapse:separate;max-width:640px;', 'class="xa-card" width="100%" style="border-collapse:separate;max-width:640px;')}</body></html>`;
}

export function renderXaMailText(mail: XaMail): string {
  const lines: string[] = [mail.subject, ""];
  for (const b of mail.blocks) {
    switch (b.kind) {
      case "identity": lines.push(b.business); break;
      case "waits": lines.push(b.label); break;
      case "headline": lines.push(b.text, ...(b.lede ? [b.lede] : [])); break;
      case "page": lines.push(`${b.page.address}: ${b.page.title}`, b.page.change, ...(b.page.note ? [b.page.note] : [])); break;
      case "primary": lines.push(`${b.action.label}: ${b.action.url}`, ...(b.note ? [b.note] : [])); break;
      case "art": break;
      case "period": lines.push(b.text); break;
      case "figure": lines.push(`${b.value} ${b.label}`, ...(b.detail ? [b.detail] : [])); break;
      case "changes": lines.push(b.label, ...b.rows.map(r => `${r.date}  ${r.text} (${r.who})`)); break;
      case "sentence": lines.push(b.text); break;
      case "lead": lines.push(b.quiet ? `${b.text} ${b.quiet}` : b.text); break;
      case "change": lines.push(b.label, `${b.text}${b.date ? ` (${b.date})` : ""}`, ...(b.link ? [`${b.link.label}: ${b.link.url}`] : [])); break;
      case "rule": break;
      case "status": lines.push(b.label); break;
      case "when": lines.push(`${b.day}, ${b.time}`, ...(b.detail ? [b.detail] : [])); break;
      case "rows": lines.push(...b.rows.map(r => `${r.label}: ${r.value}`)); break;
      case "quote": lines.push(b.label, b.text); break;
      case "choices": lines.push(...(b.label ? [b.label] : []), ...b.items.map(item => `${item.label}: ${item.url}`)); break;
      case "link": lines.push(`${b.action.label}: ${b.action.url}`); break;
      case "html": lines.push(b.text); break;
    }
    lines.push("");
  }
  lines.push([mail.footer, ...[...(mail.settings ? [mail.settings] : []), ...(mail.footerLinks ?? [])].map(link => `${link.label}: ${link.url}`)].join(" · "));
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/* ---------- E1 · Waits for you ---------- */

export interface WaitsForYouInput {
  business: string;
  logoUrl?: string | null;
  /** The decision's own title, phrased as the question, e.g. "Close for Thanksgiving, Nov 26–27?" */
  question: string;
  /** The inbox line; defaults to the question. */
  subject?: string;
  /** Who prepared it, as recorded by the source. Never inferred from branding. */
  actor: RecordedActor | null;
  /** The agency running the business, when there is one ("North Studio via Strelva"). */
  agencyName?: string | null;
  page?: XaMailPage;
  /** The signed /api/approve link that existing issuance created for this owner and revision. */
  review: string;
  /** Access, money and leaving need the owner signed in; the note under the pill says so. */
  signInRequired: boolean;
  /** Only when the source has a real reversal, e.g. "You can undo it any time from Home." */
  undoNote?: string;
  settingsUrl: string;
}

export function waitsForYouEmail(input: WaitsForYouInput): XaMail {
  const { name } = actorPresentation(input.actor);
  const lede = name
    ? `${name} prepared this for ${input.business}. Nothing goes live until you say yes.`
    : `This is ready for ${input.business}. Nothing goes live until you say yes.`;
  return {
    subject: input.subject ?? input.question,
    preheader: lede,
    fromName: input.agencyName ? `${input.agencyName} via Strelva` : "Strelva",
    blocks: [
      { kind: "identity", business: input.business, logoUrl: input.logoUrl },
      { kind: "waits", label: "Waits for you" },
      { kind: "headline", text: input.question, lede },
      ...(input.page ? [{ kind: "page" as const, page: input.page }] : []),
      { kind: "primary", action: { label: "Review and say yes", url: input.review },
        note: input.signInRequired ? "This one needs you signed in. Strelva asks before anything changes." : "Opens on your phone without signing in. You confirm there." },
      ...(input.undoNote ? [{ kind: "rule" as const }, { kind: "sentence" as const, text: input.undoNote, muted: true }] : []),
    ],
    footer: [input.business, BRAND_CREDIT.replace(/\.$/, "")].join(" · "),
    settings: { label: "Email settings", url: input.settingsUrl },
  };
}

/* ---------- E3 · The Monday email ---------- */

export interface MondayEmailInput {
  business: string;
  agencyName?: string | null;
  /** "Nov 9–15". */
  period: string;
  /** "Week of Nov 9", for the subject. */
  weekOf: string;
  /** The one number the week is about, with what it counts and where it came from. */
  figure: { value: number; label: string; detail?: string };
  changes: readonly XaMailChange[];
  /** One plain sentence about checks in the owner's words, e.g. "Every check on harbordental.com passed." Never a path or an internal count. */
  checks?: string;
  /**
   * Where "See it" opens: the System of the change that mattered (the first of
   * `changes`), built by the sender from that change's systemId. Required so a
   * caller can't fall back to `open`; null when the change has no System, and
   * then the email has no "See it".
   */
  seeUrl: string | null;
  open: XaMailAction;
  settingsUrl: string;
}

/** "3 new patients · 11 returning" said as a sentence: "3 new patients, 11 returning." */
function detailSentence(detail: string | undefined): string | undefined {
  const text = detail?.split(/\s+·\s+/).map(part => part.trim()).filter(Boolean).join(", ");
  if (!text) return undefined;
  const sentence = text.charAt(0).toUpperCase() + text.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

/**
 * E3 (lane results, October 16): one sentence for the week, the one change
 * that mattered with whoever acted and a link to see it, anything else that
 * changed, the checks in one sentence, one ink pill. No hero number and no
 * clay beside it; the subject still carries the week's number for the inbox.
 */
export function mondayEmail(input: MondayEmailInput): XaMail {
  const value = input.figure.value.toLocaleString("en-US");
  const runner = input.agencyName ? `${input.agencyName} runs ${input.business}'s website with Strelva.` : `${input.business} runs on Strelva.`;
  const [mattered, ...rest] = input.changes;
  return {
    subject: `${input.business}, ${input.weekOf.charAt(0).toLowerCase()}${input.weekOf.slice(1)}: ${value} ${input.figure.label}`,
    preheader: input.figure.detail,
    fromName: input.agencyName ? `${input.agencyName} via Strelva` : "Strelva",
    blocks: [
      { kind: "identity", business: input.business },
      { kind: "period", text: input.period },
      { kind: "lead", text: `${value} ${input.figure.label} this week.`, quiet: detailSentence(input.figure.detail) },
      ...(mattered
        ? [{ kind: "change" as const, label: "The change that mattered", text: xaChangeSentence(mattered), date: mattered.date, ...(input.seeUrl ? { link: { label: "See it", url: input.seeUrl } } : {}) }]
        : [{ kind: "sentence" as const, text: "Nothing changed this week. Everything ran as it was." }]),
      ...(rest.length ? [{ kind: "changes" as const, label: "Also changed", rows: rest }] : []),
      ...(input.checks ? [{ kind: "sentence" as const, text: input.checks }] : []),
      { kind: "primary", action: input.open, align: "start" },
    ],
    footer: `This comes every Monday. ${runner}`,
    settings: { label: "Email settings", url: input.settingsUrl },
  };
}
