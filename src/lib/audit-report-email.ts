/**
 * Prospect-facing "your site health report is ready" email. Sent when someone
 * runs the gated full audit on the marketing site. This is a CLIENT/prospect
 * send, so it is gated behind `emailSendingPaused()` — dormant (returns false,
 * no-op) until client email is switched on. The on-page "View full report" link
 * delivers the report in the meantime, so the flow works with sends off.
 *
 * Deliberately a LINK, not a PDF attachment: the report lives at reportUrl
 * (the hosted one-pager), which the recipient views in-browser and prints to PDF.
 */

import { emailSendingPaused } from "./email-enabled";
import { renderEmailHtml, renderEmailText, type EmailOptions } from "./email/layout";
import { findingsFromCategories } from "./lead-audit";
import type { AuditResult } from "./audit/types";

function displayHost(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

/** One tidy line for the email table: the first whole sentence of the fix's
 *  "why", plus its quantified impact set off with a middot (never a mid-word cut
 *  or a doubled paren). */
function fixLine(impact: string | undefined, issue: string, quantified?: string): string {
  const source = (impact || issue).replace(/\s+/g, " ").trim();
  let text = source.split(/(?<=[.!?])\s/)[0] || source;
  if (text.length > 140) text = `${text.slice(0, 139).trimEnd()}…`;
  return quantified ? `${text} · ${quantified}` : text;
}

/** The report email's content, as primitives the shared layout renders (heading,
 *  paragraphs, a rows table, a button) — never hand-rolled markup. Exported so
 *  the exact email can be rendered for review. */
export function buildAuditReportEmailOptions(
  lead: { name: string; url: string },
  result: AuditResult,
  reportUrl: string,
): EmailOptions {
  const host = displayHost(lead.url);
  const findings = findingsFromCategories(result.categories);
  const highCount = findings.filter((f) => f.priority === "high").length;
  const greeting = lead.name ? `Hi ${lead.name.split(/\s+/)[0]},` : "Hi,";

  // The top few fixes as a label/value table — the substance a prospect wants to
  // see before clicking through. The full ranked list lives in the report.
  const topFixes = findings.slice(0, 4);
  const rows =
    findings.length === 0
      ? [{ label: "Overall grade", value: `${result.grade} · ${result.overallScore}/100 — no priority issues found` }]
      : [
          { label: "Overall grade", value: `${result.grade} · ${result.overallScore}/100` },
          ...topFixes.map((f) => ({ label: f.name, value: fixLine(f.impact, f.issue, f.quantified) })),
        ];

  const summary =
    findings.length === 0
      ? `We ran a full audit on ${host} and it scored ${result.grade} (${result.overallScore}/100) — it already covers the fundamentals we check.`
      : `We ran a full audit on ${host}. It scored ${result.grade} (${result.overallScore}/100), with ${findings.length} thing${findings.length === 1 ? "" : "s"} worth fixing${highCount ? `, ${highCount} high-impact` : ""}. Here are the ones to start with:`;

  return {
    preheader: `Grade ${result.grade} (${result.overallScore}/100) for ${host}`,
    heading: "Your site health report is ready",
    paragraphs: [greeting, summary],
    rows,
    button: { label: "View full report", url: reportUrl },
    footerNote: `Your full report lists every issue with the exact fix. You requested this audit at strelva.com/audit.`,
  };
}

/**
 * Send the report email to the prospect. Returns true only if a real send went
 * out (so the caller can honestly tell the user "we emailed it to you"), false
 * when paused or on any failure. Fail-soft: never throws.
 */
export async function sendAuditReportEmail(params: {
  lead: { name: string; email: string; url: string };
  result: AuditResult;
  reportUrl: string;
}): Promise<boolean> {
  if (emailSendingPaused()) return false;
  if (!process.env.RESEND_API_KEY) return false;

  const opts = buildAuditReportEmailOptions(params.lead, params.result, params.reportUrl);
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromDomain = process.env.RESEND_DOMAIN || "updates.strelva.com";
    const host = displayHost(params.lead.url);

    const result = await resend.emails.send({
      from: `Strelva <hello@${fromDomain}>`,
      to: params.lead.email,
      subject: `Your site health report — ${host}`,
      html: renderEmailHtml(opts),
      text: renderEmailText(opts),
    });
    if (result.error || !result.data?.id) {
      throw new Error(result.error?.message || "Resend did not return an email id.");
    }
    return true;
  } catch (err) {
    console.error("[audit-report-email] send failed:", err);
    return false;
  }
}
