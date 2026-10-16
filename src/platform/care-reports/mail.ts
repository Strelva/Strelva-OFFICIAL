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
 */
import { escapeEmailHtml as e } from "@/platform/infra/email/escape";
import type { CareReportFacts } from "./contracts";
import { CARE_CHECK_LABEL, careHeadline, careMonthLabel, careOutcomeLine, careReleaseLabel, careShortDate, careTimeLabel } from "./model";

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

const table = (body: string, style = "") => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;${style}">${body}</table>`;

/** The subject the agency's client sees: "North Studio: Harbor Dental · October 2026 report". */
export function careReportMailSubject(agencyName: string, businessName: string, month: string): string {
  return `${agencyName}: ${businessName} · ${careMonthLabel(month)} report`;
}

export function renderCareReportMail(input: CareReportMailInput): CareReportMail {
  const { facts, agencyName, businessName } = input;
  const label = careMonthLabel(facts.month);
  const subject = careReportMailSubject(agencyName, businessName, facts.month);
  const preheader = careHeadline(facts);
  const changes = facts.changes.items.slice(0, 6);
  const more = facts.changes.items.length - changes.length;
  const note = input.agencyNote?.trim();
  const timeLine = facts.time.minutes > 0 ? `${agencyName} recorded ${careTimeLabel(facts.time.minutes)} of work for ${businessName}.` : null;
  const doneLine = facts.requests.doneCount > 0 ? `${facts.requests.doneCount} ${facts.requests.doneCount === 1 ? "Request" : "Requests"} done: ${facts.requests.done.slice(0, 3).map(item => item.request).join("; ")}${facts.requests.done.length > 3 ? "; and more" : ""}.` : null;

  const rows = changes.map((item, index) => `<tr>
      <td valign="top" style="padding:10px 16px 10px 0;${index ? `border-top:1px solid ${X.line};` : ""}width:56px;font-size:14px;line-height:20px;color:${X.faint};font-variant-numeric:tabular-nums;white-space:nowrap;">${e(careShortDate(item.at))}</td>
      <td valign="top" style="padding:10px 12px 10px 0;${index ? `border-top:1px solid ${X.line};` : ""}font-size:15px;line-height:21px;color:${X.text};">${e(item.summary || item.systemName)}</td>
      <td valign="top" align="right" style="padding:10px 0;${index ? `border-top:1px solid ${X.line};` : ""}font-size:13px;line-height:20px;color:${item.check === "confirmed" ? X.muted : X.need};white-space:nowrap;">${e(item.check === "confirmed" ? "Checked live" : CARE_CHECK_LABEL[item.check].replace(" on the live site", ""))}</td>
    </tr>`).join("");

  const card = [
    `<p style="margin:0;font-size:14px;line-height:20px;color:${X.faint};">${e(label)} · ${e(careReleaseLabel(input.release))}</p>`,
    table(`<tr><td valign="middle" style="padding:20px 18px 0 0;width:1%;font-size:64px;line-height:64px;font-weight:300;letter-spacing:-2px;color:${X.text};font-variant-numeric:tabular-nums;white-space:nowrap;">${facts.changes.total}</td>
      <td valign="middle" style="padding-top:20px;"><p style="margin:0;font-size:18px;line-height:24px;color:${X.text};">${facts.changes.total === 1 ? "change made" : "changes made"} for ${e(businessName)}</p><p style="margin:4px 0 0;font-size:14px;line-height:20px;color:${X.muted};">${e(preheader)}</p></td></tr>`),
    note ? `<p style="margin:24px 0 0;padding:14px 16px;border-radius:12px;background:#f4f3ef;font-size:15px;line-height:22px;color:${X.body};"><b style="font-weight:600;color:${X.text};">${e(agencyName)}:</b> ${e(note)}</p>` : "",
    `<p style="margin:24px 0 0;padding-top:20px;border-top:1px solid ${X.line};font-size:13px;line-height:18px;font-weight:500;color:${X.faint};">What changed</p>`,
    changes.length ? table(rows, "margin-top:4px;") : `<p style="margin:8px 0 0;font-size:15px;line-height:22px;color:${X.muted};">No Releases were recorded this month.</p>`,
    more > 0 ? `<p style="margin:6px 0 0;font-size:14px;line-height:20px;color:${X.muted};">And ${more} more in the report.</p>` : "",
    doneLine ? `<p style="margin:16px 0 0;font-size:15px;line-height:22px;color:${X.body};">${e(doneLine)}</p>` : "",
    `<p style="margin:12px 0 0;font-size:15px;line-height:22px;color:${X.body};">${e(careOutcomeLine(facts.outcomes))}</p>`,
    timeLine ? `<p style="margin:12px 0 0;font-size:15px;line-height:22px;color:${X.body};">${e(timeLine)}</p>` : "",
    table(`<tr><td align="center" bgcolor="${X.ink}" style="background:${X.ink};border-radius:999px;"><a href="${safeUrl(input.link)}" style="display:block;padding:15px 28px;font-family:${X.font};font-size:17px;line-height:22px;font-weight:600;color:${X.onInk};text-decoration:none;border-radius:999px;">Open the report</a></td></tr>`, "margin-top:28px;width:auto;"),
  ].join("");

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${e(subject)}</title></head>
<body style="margin:0;padding:0;background:${X.canvas};font-family:${X.font};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${e(preheader)}</div>
${table(`<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;border-collapse:collapse;">
    <tr><td style="padding:0 4px 20px;"><p style="margin:0;font-size:24px;line-height:30px;font-weight:600;letter-spacing:-0.4px;color:${X.text};">${e(businessName)}, ${e(label)}</p><p style="margin:6px 0 0;font-size:14px;line-height:20px;color:${X.muted};">${e(agencyName)} · Runs on Strelva</p></td></tr>
    <tr><td style="padding:36px 40px 40px;background:${X.surface};border-radius:24px;">${card}</td></tr>
    <tr><td align="center" style="padding:20px 8px 0;font-size:13px;line-height:19px;color:${X.faint};">${e(agencyName)} sent this when it shared ${e(careReleaseLabel(input.release))} of ${e(businessName)}'s report. Runs on Strelva.</td></tr>
  </table>
</td></tr>`)}
</body></html>`;

  const text = [
    `${businessName}, ${label}`,
    `${agencyName} · Runs on Strelva`,
    "",
    `${facts.changes.total} ${facts.changes.total === 1 ? "change" : "changes"} made. ${preheader}.`,
    note ? `\n${agencyName}: ${note}` : "",
    "",
    "What changed",
    ...(changes.length ? changes.map(item => `${careShortDate(item.at)}  ${item.summary || item.systemName}  (${CARE_CHECK_LABEL[item.check]})`) : ["No Releases were recorded this month."]),
    more > 0 ? `And ${more} more in the report.` : "",
    doneLine ?? "",
    careOutcomeLine(facts.outcomes),
    timeLine ?? "",
    "",
    `Open the report: ${input.link}`,
  ].filter((line, index, all) => line !== "" || all[index - 1] !== "").join("\n");

  return { subject, preheader, html, text };
}
