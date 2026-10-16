/**
 * The Care plan report email (XA, after design XA · E3 "Monday email").
 *
 * TEMPLATE ONLY. Rendering sends nothing. The one send path stays
 * `src/platform/infra/email/send.ts`, gated by `email/enabled.ts`, and
 * `sendCareReportRelease` holds every send unless care report email and client
 * email are both on. During the rollout both are off.
 *
 * Mail clients need tables and inline styles, so the LX look is written out
 * literally: paper canvas, one white card, one ink pill, clay for what was not
 * checked. DM Sans with tabular figures; never monospace. Light only.
 *
 * Like E3 it opens with one sentence for the month (lane results, October
 * 16: no hero number and no idle clay line-up), the one change that mattered
 * credited to the agency with its date and a link to its System, the agency's
 * note in its own words, what else changed with each exception saying why and
 * what clears it, and one sentence of site checks. Release numbers are the
 * agency's versioning and never reach the owner.
 */
import { escapeEmailHtml as e } from "@/platform/infra/email/escape";
import type { CareReportFacts } from "./contracts";
import { EMAIL_FONT_LINKS, emailTextLinkStyle } from "@/platform/infra/email/fonts";
import { careCheckException, careCheckReason, careLead, careMattered, careMonthLabel, careOtherChanges, careOutcomeLine, careShortDate, careSiteCheckSentence, careTimeLabel } from "./model";

const X = {
  canvas: "#edece7", surface: "#ffffff", line: "#e6e5e0", text: "#161715", body: "#3a3c38", muted: "#6b6f68", faint: "#81847d",
  ink: "#161715", onInk: "#ffffff", moss: "#2f5236", need: "#9c522c",
  font: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
} as const;

export interface CareReportMailInput {
  facts: CareReportFacts;
  /** The agency's current display name (a live brand read), never the stored snapshot's. */
  agencyName: string;
  businessName: string;
  /** The Release being sent. Recorded for delivery; never shown to the owner. */
  release: number;
  /** The signed-in or shared link the existing issuance authorized. */
  link: string;
  agencyNote?: string | null;
}

export interface CareReportMail { subject: string; preheader: string; html: string; text: string }

function safeUrl(value: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Unsafe email URL");
  return e(parsed.toString());
}

/** A System as the owner opens it, on the same origin as the report link (the path systemHref builds). */
function systemUrl(link: string, workspaceId: string, systemId: string): string {
  return new URL(`/workspace?${new URLSearchParams({ view: "system", system: systemId, workspaceId })}`, link).toString();
}

const table = (body: string, style = "") => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;${style}">${body}</table>`;

/** The subject the agency's client sees: "North Studio: Harbor Dental · October 2026 report". */
export function careReportMailSubject(agencyName: string, businessName: string, month: string): string {
  return `${agencyName}: ${businessName} · ${careMonthLabel(month)} report`;
}

export function renderCareReportMail(input: CareReportMailInput): CareReportMail {
  const { facts, agencyName, businessName } = input;
  const label = careMonthLabel(facts.month);
  const subject = careReportMailSubject(agencyName, businessName, facts.month);
  const note = input.agencyNote?.trim();
  const lead = careLead(facts, agencyName);
  const preheader = lead.text;
  const mattered = careMattered(facts, agencyName);
  // The change that mattered is not listed twice.
  const others = careOtherChanges(facts, mattered);
  const changes = others.slice(0, 6);
  const more = others.length - changes.length;
  const seeUrl = mattered ? systemUrl(input.link, facts.business.workspaceId, mattered.item.systemId) : null;
  const timeLine = facts.time.minutes > 0 ? `${agencyName} recorded ${careTimeLabel(facts.time.minutes)} of work for ${businessName}.` : null;
  const doneLine = facts.requests.doneCount > 0 ? `${facts.requests.doneCount} ${facts.requests.doneCount === 1 ? "request" : "requests"} done: ${facts.requests.done.slice(0, 3).map(item => item.request).join("; ")}${facts.requests.done.length > 3 ? "; and more" : ""}.` : null;

  const rows = changes.map((item, index) => {
    const exception = careCheckException(item.check);
    const reason = careCheckReason(item, agencyName);
    // Two columns, so the change keeps its width on a phone; an exception says its word and its reason under the change.
    return `<tr>
      <td valign="top" style="padding:10px 16px 10px 0;${index ? `border-top:1px solid ${X.line};` : ""}width:56px;font-size:14px;line-height:20px;color:${X.faint};font-variant-numeric:tabular-nums;white-space:nowrap;">${e(careShortDate(item.at))}</td>
      <td valign="top" style="padding:10px 0;${index ? `border-top:1px solid ${X.line};` : ""}font-size:15px;line-height:21px;color:${X.text};">${e(item.summary || item.systemName)}${exception && reason ? `<br><span style="font-size:14px;line-height:20px;color:${X.need};">${e(exception)}: ${e(reason)}</span>` : ""}</td>
    </tr>`;
  }).join("");
  const checks = careSiteCheckSentence(facts.siteChecks, businessName);

  const card = [
    `<p style="margin:0;font-size:22px;line-height:30px;font-weight:500;letter-spacing:-0.3px;color:${X.text};">${e(lead.text)}${lead.quiet ? `<span style="color:${X.muted};"> ${e(lead.quiet)}</span>` : ""}</p>`,
    mattered && seeUrl ? `<div style="margin:24px 0 0;padding-top:18px;border-top:1px solid ${X.line};"><p style="margin:0 0 6px;font-size:13px;line-height:18px;font-weight:500;color:${X.faint};">The change that mattered</p><p style="margin:0;font-size:16px;line-height:24px;color:${X.text};">${e(mattered.text)} <span style="white-space:nowrap;"><span style="color:${X.faint};">${e(careShortDate(mattered.at))} · </span><a href="${safeUrl(seeUrl)}" style="${emailTextLinkStyle(X.text)}">See it</a></span></p></div>` : "",
    note ? `<p style="margin:20px 0 4px;font-size:13px;line-height:18px;font-weight:500;color:${X.faint};">${e(agencyName)}'s note</p><p style="margin:0;font-size:15px;line-height:22px;color:${X.body};">${e(note)}</p>` : "",
    changes.length ? `<p style="margin:24px 0 0;font-size:13px;line-height:18px;font-weight:500;color:${X.faint};">${mattered ? "Also changed" : "What changed"}</p>` : "",
    changes.length ? table(rows, "margin-top:4px;") : mattered ? "" : `<p style="margin:24px 0 0;font-size:15px;line-height:22px;color:${X.muted};">Nothing changed this month.</p>`,
    more > 0 ? `<p style="margin:6px 0 0;font-size:14px;line-height:20px;color:${X.muted};">And ${more} more in the report.</p>` : "",
    doneLine ? `<p style="margin:16px 0 0;font-size:15px;line-height:22px;color:${X.body};">${e(doneLine)}</p>` : "",
    `<p style="margin:12px 0 0;font-size:15px;line-height:22px;color:${X.body};">${e(checks)}</p>`,
    `<p style="margin:12px 0 0;font-size:15px;line-height:22px;color:${X.body};">${e(careOutcomeLine(facts.outcomes))}</p>`,
    timeLine ? `<p style="margin:12px 0 0;font-size:15px;line-height:22px;color:${X.body};">${e(timeLine)}</p>` : "",
    table(`<tr><td align="center" bgcolor="${X.ink}" style="background:${X.ink};border-radius:999px;"><a href="${safeUrl(input.link)}" style="display:block;padding:15px 28px;font-family:${X.font};font-size:17px;line-height:22px;font-weight:600;color:${X.onInk};text-decoration:none;border-radius:999px;">Open the report</a></td></tr>`, "margin-top:28px;width:auto;"),
  ].join("");

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">${EMAIL_FONT_LINKS}<title>${e(subject)}</title></head>
<body style="margin:0;padding:0;background:${X.canvas};font-family:${X.font};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${e(preheader)}</div>
${table(`<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;border-collapse:collapse;">
    <tr><td style="padding:0 4px 20px;"><p style="margin:0;font-size:24px;line-height:30px;font-weight:600;letter-spacing:-0.4px;color:${X.text};">${e(businessName)}, ${e(label)}</p><p style="margin:6px 0 0;font-size:14px;line-height:20px;color:${X.muted};">${e(agencyName)} · Runs on Strelva</p></td></tr>
    <tr><td style="padding:36px 40px 40px;background:${X.surface};border-radius:16px;">${card}</td></tr>
    <tr><td align="center" style="padding:20px 8px 0;font-size:13px;line-height:19px;color:${X.faint};">${e(agencyName)} sent this when it shared ${e(businessName)}'s ${e(label.split(" ")[0]!)} report. ${e(agencyName)} runs ${e(businessName)}'s website with Strelva.</td></tr>
  </table>
</td></tr>`)}
</body></html>`;

  const text = [
    `${businessName}, ${label}`,
    `${agencyName} · Runs on Strelva`,
    "",
    lead.quiet ? `${lead.text} ${lead.quiet}` : lead.text,
    mattered && seeUrl ? `\nThe change that mattered\n${mattered.text} (${careShortDate(mattered.at)})\nSee it: ${seeUrl}` : "",
    note ? `\n${agencyName}'s note\n${note}` : "",
    "",
    ...(changes.length ? [mattered ? "Also changed" : "What changed", ...changes.map(item => `${careShortDate(item.at)}  ${item.summary || item.systemName}${careCheckException(item.check) ? `  (${careCheckException(item.check)}: ${careCheckReason(item, agencyName)})` : ""}`)] : mattered ? [] : ["Nothing changed this month."]),
    more > 0 ? `And ${more} more in the report.` : "",
    doneLine ?? "",
    checks,
    careOutcomeLine(facts.outcomes),
    timeLine ?? "",
    "",
    `Open the report: ${input.link}`,
  ].filter((line, index, all) => line !== "" || all[index - 1] !== "").join("\n");

  return { subject, preheader, html, text };
}
