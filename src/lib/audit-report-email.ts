/**
 * Prospect-facing "your site health report is ready" email. Sent when someone
 * runs the gated full audit on the marketing site. This is a PROSPECT send (no
 * tenant, no lifecycle), sent through the shared prospect audience boundary —
 * separate from the client lifecycle gate so it can flow while lifecycle email
 * stays paused. The on-page "View
 * full report" link also delivers the report, so the flow works either way.
 *
 * Deliberately a LINK, not a PDF attachment: the report lives at reportUrl
 * (the hosted one-pager), which the recipient views in-browser and prints to PDF.
 */

import { type EmailOptions, type EmailHighlight } from "./email/layout";
import { sendEmail } from "./email/send";
import { findingsFromCategories } from "./lead-audit";
import type { AuditResult } from "./audit/types";

function displayHost(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

const GRADE_TONE: Record<AuditResult["grade"], EmailHighlight["tone"]> = {
  A: "positive",
  B: "positive",
  C: "warning",
  D: "critical",
  F: "critical",
};

/** One crisp line for a bulleted fix: the first whole sentence of its "why",
 *  no invented numbers (the anonymous audit strips those upstream). */
function bulletText(impact: string | undefined, issue: string): string {
  const source = (impact || issue).replace(/\s+/g, " ").trim();
  const first = source.split(/(?<=[.!?])\s/)[0] || source;
  return first.length > 110 ? `${first.slice(0, 109).trimEnd()}…` : first;
}

/** The report email's content, as primitives the shared layout renders (heading,
 *  paragraphs, a grade card, a bulleted list, a button) — never hand-rolled
 *  markup. The grade + score headline, then the top few issues (names + a plain
 *  "why", no invented figures). The full ranked list + exact fixes live in the
 *  report. Exported so the exact email can be rendered for review. */
export function buildAuditReportEmailOptions(
  lead: { name: string; url: string },
  result: AuditResult,
  reportUrl: string,
): EmailOptions {
  const host = displayHost(lead.url);
  const findings = findingsFromCategories(result.categories);
  const highCount = findings.filter((f) => f.priority === "high").length;
  const greeting = lead.name ? `Hi ${lead.name.split(/\s+/)[0]},` : "Hi,";

  const note =
    findings.length === 0
      ? "No priority issues — the fundamentals are covered."
      : `${findings.length} issue${findings.length === 1 ? "" : "s"} worth fixing${highCount ? `, ${highCount} high-impact` : ""}.`;

  const bullets = findings.slice(0, 3).map((f) => ({ title: f.name, text: bulletText(f.impact, f.issue) }));

  return {
    preheader: `${result.grade} · ${result.overallScore}/100 for ${host}`,
    heading: "Your site health report is ready",
    paragraphs: [
      greeting,
      `We ran a full audit on ${host}. Here's the headline — your full report has every issue with the exact fix.`,
    ],
    highlight: {
      value: result.grade,
      label: `${result.overallScore} out of 100`,
      note,
      tone: GRADE_TONE[result.grade],
    },
    bullets: bullets.length ? bullets : undefined,
    button: { label: "See the full report", url: reportUrl },
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
  const opts = buildAuditReportEmailOptions(params.lead, params.result, params.reportUrl);
  try {
    const host = displayHost(params.lead.url);
    return await sendEmail({
      audience: "prospect",
      to: params.lead.email,
      subject: `Your site health report — ${host}`,
      options: opts,
    });
  } catch (err) {
    console.error("[audit-report-email] send failed:", err);
    return false;
  }
}
