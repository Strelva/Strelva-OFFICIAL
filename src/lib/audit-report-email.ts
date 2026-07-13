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

/** The report email's content, as primitives the shared layout renders (heading,
 *  paragraphs, a rows table, a button) — never hand-rolled markup. A scorecard:
 *  the overall grade plus every category score. No invented dollar figures — we
 *  have no traffic data for the site, so the honest signal is the scores. The
 *  ranked issues + exact fixes live in the full report. Exported so the exact
 *  email can be rendered for review. */
export function buildAuditReportEmailOptions(
  lead: { name: string; url: string },
  result: AuditResult,
  reportUrl: string,
): EmailOptions {
  const host = displayHost(lead.url);
  const findings = findingsFromCategories(result.categories);
  const greeting = lead.name ? `Hi ${lead.name.split(/\s+/)[0]},` : "Hi,";

  const summary =
    findings.length === 0
      ? `We audited ${host}. It scored ${result.grade} — ${result.overallScore} out of 100, and already covers the fundamentals we check. Here's how each area did:`
      : `We audited ${host}. It scored ${result.grade} — ${result.overallScore} out of 100, with ${findings.length} thing${findings.length === 1 ? "" : "s"} worth fixing. Here's how each area scored:`;

  // Every subsection score — the honest, data-free signal. Overall first, then
  // each category worst-first so the weakest areas lead.
  const rows = [
    { label: "Overall", value: `${result.grade} · ${result.overallScore} / 100` },
    ...[...result.categories]
      .sort((a, b) => a.score - b.score)
      .map((c) => ({ label: c.name, value: `${c.score} / 100` })),
  ];

  return {
    preheader: `${result.grade} · ${result.overallScore}/100 for ${host}`,
    heading: "Your site health report is ready",
    paragraphs: [greeting, summary],
    rows,
    button: { label: "See the full report", url: reportUrl },
    footerNote: `The full report ranks every issue with the exact fix. You requested this audit at strelva.com/audit.`,
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
