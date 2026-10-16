import { BRAND_CREDIT, type OwnerBrand } from "@/platform/infra/agency-brand";
import { escapeEmailHtml } from "./escape";
import { PAPER_EMAIL as t } from "./paper-tokens";

/** "ink" is the same as "primary": the XA one primary, the ink pill. */
export interface PaperAction { label: string; url: string; style?: "primary" | "ink" | "soft" | "text" | "date" }
export type PaperBlock =
  | { kind: "paragraph"; text: string; muted?: boolean }
  | { kind: "label"; text: string }
  | { kind: "draft"; label: string; text: string; note?: string; surface?: boolean }
  | { kind: "actions"; actions: readonly PaperAction[]; full?: boolean }
  | { kind: "rows"; rows: readonly { label: string; value: string; tone?: "live" | "need" }[] }
  | { kind: "metrics"; rows: readonly { value: string; label: string; note?: string }[] }
  | { kind: "decision"; category: string; title: string; detail: string; actions: readonly PaperAction[] }
  | { kind: "file"; name: string; detail: string }
  | { kind: "possibility"; title: string; detail: string; action: PaperAction }
  | { kind: "rule" }
  /** XA · E3: the one number an email is about, in DM Sans, beside what it counts. */
  | { kind: "figure"; value: string; label: string; note?: string }
  /** XA · E3: Pebble and the Systems at the top. Decorative; `src` is an absolute https URL. */
  | { kind: "clay"; src: string; width: number; height: number }
  /** XA · E3 "What changed": a date, what happened, and whoever acted. */
  | { kind: "changes"; rows: readonly { date: string; text: string; who: string }[] }
  /** The one sentence a report leads with (replaces a hero figure): ink, then one quiet clause with a different fact. */
  | { kind: "lead"; text: string; quiet?: string }
  /** The one change that mattered: a label, the sentence naming whoever acted, when, and a text link to see it. */
  | { kind: "change"; label: string; text: string; date?: string; link?: PaperAction };

/** Presentation only. URLs are supplied by existing issuance/authorization paths.
 * Rendering never creates a signed link, claims an item or sends mail. */
export interface PaperEmail {
  subject: string;
  brand?: OwnerBrand;
  businessName?: string;
  sender: string;
  senderDetail: string;
  preheader?: string;
  footer: string;
  blocks: readonly PaperBlock[];
  clientBranded?: boolean;
  white?: boolean;
}

function paperIdentity(email: PaperEmail): string { return email.businessName || email.brand?.name || email.sender; }
function paperFooter(email: PaperEmail): string { return [email.footer, email.businessName || email.brand?.agencyId ? BRAND_CREDIT : ""].filter(Boolean).join(" "); }
const e = escapeEmailHtml;
function url(value: string): string {
  // Refuse active schemes and protocol-relative URLs, including hidden controls.
  if (/[\u0000-\u0020\u007f\\]/.test(value)) throw new Error("Unsafe email URL");
  if (value.startsWith("/") && !value.startsWith("//")) return e(value);
  const parsed = new URL(value);
  if (!["https:", "http:", "mailto:"].includes(parsed.protocol)) throw new Error("Unsafe email URL");
  return e(value);
}
const table = (body: string, style = "", width = "100%") => `<table role="presentation" cellpadding="0" cellspacing="0" border="0"${width ? ` width="${width}"` : ""} style="border-collapse:separate;${style}">${body}</table>`;
const text = (value: string, muted = false) => `<p style="margin:0;font-size:15px;line-height:24px;color:${muted ? t.muted : t.text};overflow-wrap:anywhere;">${e(value)}</p>`;
const label = (value: string) => `<p style="margin:0 0 8px;font-size:13px;line-height:20px;color:${t.muted};">${e(value)}</p>`;

function actions(items: readonly PaperAction[], full = false): string {
  return table(`<tr>${items.map((a, i) => {
    const primary = a.style === "primary" || a.style === "ink";
    const quiet = a.style === "text";
    const date = a.style === "date";
    const bg = primary ? t.action : quiet ? "transparent" : date ? t.surface : t.inset;
    return `<td ${full ? `width="${100 / items.length}%"` : ""} style="${i ? "padding-left:10px;" : ""}vertical-align:middle;">${table(`<tr><td align="center" bgcolor="${bg}" style="background:${bg};border-radius:${date ? "8px" : "999px"};${date ? `border:1px solid ${t.line};` : ""}"><a href="${url(a.url)}" style="display:block;padding:${quiet ? "8px 4px" : "12px 16px"};font-size:${quiet ? "14px" : "15px"};line-height:24px;font-weight:${quiet ? "400" : "600"};color:${primary ? t.onAction : quiet ? t.muted : t.text};text-decoration:none;border-radius:999px;">${e(a.label)}</a></td></tr>`, "", full ? "100%" : "")}</td>`;
  }).join("")}</tr>`, "", full ? "100%" : "");
}

function block(b: PaperBlock): string {
  switch (b.kind) {
    case "paragraph": return text(b.text, b.muted);
    case "label": return label(b.text);
    case "rule": return `<div style="height:1px;background:${t.line};"></div>`;
    case "figure": return table(`<tr><td valign="middle" style="padding:8px 18px 8px 0;font-family:${t.font};font-size:64px;line-height:64px;font-weight:300;letter-spacing:-2px;color:${t.text};white-space:nowrap;">${e(b.value)}</td><td valign="middle" style="padding:8px 0;"><p style="margin:0;font-size:18px;line-height:24px;font-weight:500;color:${t.text};overflow-wrap:anywhere;">${e(b.label)}</p>${b.note ? `<p style="margin:4px 0 0;font-size:14px;line-height:20px;color:${t.muted};overflow-wrap:anywhere;">${e(b.note)}</p>` : ""}</td></tr>`, "", "");
    case "actions": return actions(b.actions, b.full);
    case "draft": return table(`<tr><td style="padding:16px;background:${b.surface ? t.surface : t.inset};border-radius:12px;${b.surface ? `border:1px solid ${t.line};` : ""}">${label(b.label)}${text(b.text)}${b.note ? `<p style="margin:8px 0 0;font-size:12px;line-height:18px;color:${t.faint};">${e(b.note)}</p>` : ""}</td></tr>`);
    case "rows": return table(b.rows.map(r => `<tr><td style="padding:12px 16px;border-bottom:1px solid ${t.line};font-size:14px;line-height:20px;color:${t.muted};">${e(r.label)}</td><td align="right" style="padding:12px 16px;border-bottom:1px solid ${t.line};font-size:13px;line-height:20px;color:${r.tone ? t[r.tone] : t.text};overflow-wrap:anywhere;">${e(r.value)}</td></tr>`).join(""), `border-top:1px solid ${t.line};`);
    case "clay": return `<img src="${url(b.src)}" alt="" width="${b.width}" height="${b.height}" style="display:block;width:${b.width}px;max-width:100%;height:auto;border:0;">`;
    case "lead": return `<p style="margin:0;font-size:22px;line-height:30px;font-weight:500;letter-spacing:-0.3px;color:${t.text};overflow-wrap:anywhere;">${e(b.text)}${b.quiet ? `<span style="color:${t.muted};"> ${e(b.quiet)}</span>` : ""}</p>`;
    case "change": return `${label(b.label)}<p style="margin:0;font-size:16px;line-height:24px;color:${t.text};overflow-wrap:anywhere;">${e(b.text)}${b.date ? `<span style="color:${t.faint};"> · ${e(b.date)}</span>` : ""}${b.link ? ` <a href="${url(b.link.url)}" style="color:${t.text};font-weight:600;text-decoration:underline;">${e(b.link.label)}</a>` : ""}</p>`;
    case "changes": return table(b.rows.map(r => `<tr><td valign="top" width="64" style="padding:8px 12px 8px 0;font-size:14px;line-height:21px;color:${t.faint};white-space:nowrap;">${e(r.date)}</td><td valign="top" style="padding:8px 12px 8px 0;font-size:15px;line-height:21px;color:${t.text};overflow-wrap:anywhere;">${e(r.text)}</td><td valign="top" align="right" style="padding:8px 0;font-size:13px;line-height:21px;color:${t.muted};white-space:nowrap;">${e(r.who)}</td></tr>`).join(""));
    case "metrics": return table(b.rows.map(r => `<tr><td width="76" valign="top" style="padding:12px 16px 12px 0;border-bottom:1px solid ${t.line};font-family:${t.font};font-size:28px;line-height:32px;font-weight:300;">${e(r.value)}</td><td style="padding:12px 0;border-bottom:1px solid ${t.line};font-size:15px;line-height:22px;">${e(r.label)}${r.note ? `<div style="font-size:12px;line-height:18px;color:${t.faint};">${e(r.note)}</div>` : ""}</td></tr>`).join(""));
    case "decision": return table(`<tr><td style="padding:0 0 16px;border-bottom:1px solid ${t.line};">${label(`●  ${b.category}`)}<h2 style="margin:0 0 6px;font-size:16px;font-weight:600;line-height:24px;">${e(b.title)}</h2>${text(b.detail, true)}<div style="height:8px;"></div>${actions(b.actions)}</td></tr>`);
    case "file": return table(`<tr><td style="padding:16px;border:1px solid ${t.line};border-radius:12px;background:${t.surface};"><p style="margin:0;font-size:14px;line-height:20px;font-weight:500;overflow-wrap:anywhere;">${e(b.name)}</p><p style="margin:0;font-size:12px;line-height:18px;color:${t.faint};">${e(b.detail)}</p></td></tr>`);
    case "possibility": return table(`<tr><td style="padding:16px;border:1px solid ${t.line};border-radius:12px;background:${t.surface};"><h2 style="margin:0 0 6px;font-size:15px;line-height:22px;font-weight:600;">${e(b.title)}</h2>${text(b.detail, true)}<a href="${url(b.action.url)}" style="display:inline-block;padding:8px 0 0;color:${t.accent};font-size:14px;line-height:22px;font-weight:600;text-decoration:none;">${e(b.action.label)}</a></td></tr>`);
  }
}

/** Table layout and inline styles are also the source used by the preview. */
export function renderPaperEmailBody(email: PaperEmail): string {
  const bg = email.white ? t.surface : t.canvas;
  return table(`<tr><td align="center">${table(`<tr><td valign="top" style="padding:20px 20px 0;">
    <h1 style="margin:0 0 16px;font-size:22px;line-height:27px;letter-spacing:-0.3px;font-weight:600;color:${t.text};overflow-wrap:anywhere;">${e(email.subject)}</h1>
    <p style="margin:0 0 2px;font-size:${email.clientBranded ? "13" : "14"}px;line-height:20px;font-weight:${email.clientBranded ? "400" : "600"};color:${email.clientBranded ? t.faint : t.text};">${email.brand?.logoUrl && !email.businessName ? `<img src="${url(email.brand.logoUrl)}" alt="${e(email.brand.name)}" width="132" style="display:block;max-width:132px;margin-bottom:12px;">` : ""}${e(paperIdentity(email))}</p>
    ${email.senderDetail ? `<p style="margin:0;font-size:12px;line-height:18px;color:${t.faint};overflow-wrap:anywhere;">${e(email.senderDetail)}</p>` : ""}
    ${table(email.blocks.map(b => `<tr><td style="padding-top:16px;">${block(b)}</td></tr>`).join(""), "margin-top:8px;")}
    </td></tr><tr><td style="padding:28px 20px 24px;"><p style="margin:0;font-size:12px;line-height:18px;color:${t.faint};">${e(paperFooter(email))}</p></td></tr>`, `max-width:560px;width:100%;background:${bg};font-family:${t.font};color:${t.text};`, "560")}</td></tr>`, `background:${bg};`);
}

export function renderPaperEmailHtml(email: PaperEmail): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap" rel="stylesheet"><title>${e(email.subject)}</title></head><body style="margin:0;padding:0;background:${email.white ? t.surface : t.canvas};">${email.preheader ? `<div style="display:none;max-height:0;overflow:hidden;">${e(email.preheader)}</div>` : ""}${renderPaperEmailBody(email)}</body></html>`;
}

export function renderPaperEmailText(email: PaperEmail): string {
  const lines = [email.subject, paperIdentity(email), email.senderDetail, ""];
  for (const b of email.blocks) {
    switch (b.kind) {
      case "paragraph": case "label": lines.push(b.text); break;
      case "draft": lines.push(b.label, b.text, b.note ?? ""); break;
      case "actions": lines.push(...b.actions.map(a => `${a.label}: ${a.url}`)); break;
      case "rows": lines.push(...b.rows.map(r => `${r.label}: ${r.value}`)); break;
      case "metrics": lines.push(...b.rows.map(r => `${r.value} ${r.label}${r.note ? `: ${r.note}` : ""}`)); break;
      case "decision": lines.push(b.category, b.title, b.detail, ...b.actions.map(a => `${a.label}: ${a.url}`)); break;
      case "file": lines.push(b.name, b.detail); break;
      case "possibility": lines.push(b.title, b.detail, `${b.action.label}: ${b.action.url}`); break;
      case "rule": break;
      case "figure": lines.push(`${b.value} ${b.label}`, b.note ?? ""); break;
      case "clay": break;
      case "changes": lines.push(...b.rows.map(r => `${r.date}  ${r.text}${r.who ? ` (${r.who})` : ""}`)); break;
      case "lead": lines.push(b.quiet ? `${b.text} ${b.quiet}` : b.text); break;
      case "change": lines.push(b.label, `${b.text}${b.date ? ` (${b.date})` : ""}`, ...(b.link ? [`${b.link.label}: ${b.link.url}`] : [])); break;
    }
    lines.push("");
  }
  lines.push(paperFooter(email));
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
