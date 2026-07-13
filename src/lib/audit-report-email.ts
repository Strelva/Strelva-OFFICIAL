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

function buildOptions(
  lead: { name: string; url: string },
  result: AuditResult,
  reportUrl: string,
): EmailOptions {
  const host = displayHost(lead.url);
  const findings = findingsFromCategories(result.categories);
  const highCount = findings.filter((f) => f.priority === "high").length;
  const issuesLine =
    findings.length === 0
      ? "We didn't find any priority issues — your site already covers the fundamentals."
      : `${findings.length} issue${findings.length === 1 ? "" : "s"} worth fixing${highCount ? `, ${highCount} of them high-impact` : ""}.`;

  const greeting = lead.name ? `Hi ${lead.name.split(/\s+/)[0]},` : "Hi,";

  return {
    preheader: `Grade ${result.grade} (${result.overallScore}/100) for ${host}`,
    heading: "Your site health report is ready",
    paragraphs: [
      greeting,
      `We ran a full audit on ${host}. Here's the headline, and your complete report with every issue and how to fix it is one click away.`,
      issuesLine,
    ],
    rows: [{ label: "Overall grade", value: `${result.grade} — ${result.overallScore}/100` }],
    button: { label: "View full report", url: reportUrl },
    footerNote: "You requested this audit at strelva.com/audit.",
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

  const opts = buildOptions(params.lead, params.result, params.reportUrl);
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
