import { NextResponse } from "next/server";
import { recordHeartbeat } from "@/lib/heartbeat";
import { mapPool } from "@/lib/concurrency";
import { recordMailSend } from "@/lib/storage/mail-log";
import { alertOnce } from "@/lib/monitoring";
import { generateAllReports, buildReportSubject, buildReportHeading } from "@/lib/reports";
import { getTenantDashboardUrl } from "@/lib/tenant-urls";
import { generateWeeklyBrief } from "@/lib/weekly-brief";
import { EMAIL_DOMAIN } from "@/lib/brand";
import { sanitizeEmailSubjectText } from "@/lib/invite-email";
import { emailSendingPaused } from "@/lib/email-enabled";
import { renderEmailHtml, renderEmailText } from "@/lib/email/layout";
import type { EmailRow } from "@/lib/email/layout";
import { isReportDue, markReportSent } from "@/lib/report-cadence";
import { requireCronRequest } from "@/lib/cron-auth";

// Cap matches the platform function ceiling — this cron iterates tenants and
// would otherwise die mid-batch at scale on a lower default.
export const maxDuration = 300;

// The upstream summary (Gemini output or the deterministic fallback in
// reports.ts) is a plain-text string with blank lines between paragraphs. Split
// it into the paragraph list the shared layout expects. The layout escapes each
// paragraph, so tenant-authored content (service names, search queries) that the
// summary echoes can't inject markup into the owner's email.
function reportSummaryParagraphs(summary: string): string[] {
  return summary
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function reportToHtml(heading: string, summary: string, siteName: string, dashboardUrl: string, analyticsRows: EmailRow[]): string {
  const paragraphs = reportSummaryParagraphs(summary);
  return renderEmailHtml({
    preheader: paragraphs[0],
    // Verdict-first h1 (from buildReportHeading) — the plain verdict the body
    // proves, never the generic "Your weekly report" label.
    heading,
    paragraphs,
    // Compact Search & Analytics block — only present when a Google surface read
    // "ok" (buildAnalyticsRows returns []), so unconnected tenants omit it.
    rows: analyticsRows.length ? analyticsRows : undefined,
    button: { label: "See your full report", url: dashboardUrl },
    footerNote: `Sent for ${siteName}`,
  });
}

function reportToText(heading: string, summary: string, dashboardUrl: string, analyticsRows: EmailRow[]): string {
  return renderEmailText({
    heading,
    paragraphs: reportSummaryParagraphs(summary),
    rows: analyticsRows.length ? analyticsRows : undefined,
    button: { label: "See your full report", url: dashboardUrl },
  });
}

export async function GET(request: Request) {
  const denied = requireCronRequest(request);
  if (denied) return denied;

  // Global email kill-switch: while sending is paused (domain cutover / test
  // tenants) the report's only purpose — the email — can't go out, so skip the
  // whole run rather than build reports nothing sends.
  if (emailSendingPaused()) {
    console.warn("[weekly-report] skipped — email sending paused (EMAIL_SENDING_ENABLED != true)");
    return NextResponse.json({ status: "skipped", reason: "email_sending_paused" });
  }

  const { reports: allReports, skipped: generationSkips } = await generateAllReports();

  // Track skipped tenants with a reason so "why did X never get a receipt?" is
  // answerable from this response. Seed with tenants skipped during generation
  // (missing owner email, inactive, generation failure).
  const skippedReasons: { tenantId: string; reason: string; detail?: string }[] = generationSkips.map(
    (s) => ({ tenantId: s.tenantId, reason: s.reason, detail: s.detail }),
  );

  const activeReports = allReports.filter((r) => {
    if (r.tenant.subscriptionStatus === "cancelled") {
      skippedReasons.push({ tenantId: r.tenant.id, reason: "subscription_cancelled" });
      return false;
    }
    return true;
  });

  // Cadence gate: the cron runs weekly, but most tenants are on a MONTHLY
  // report (default) — only tenants explicitly flipped to "weekly" get a report
  // every run. Persisted last-sent per tenant prevents a second send inside the
  // same cycle. Tenants not due this run are recorded as a skip reason so "why
  // no report?" stays answerable. (See src/lib/report-cadence.ts for the tier
  // decision — tiers aren't code-enforced, so cadence is a per-tenant override.)
  const now = new Date();
  const dueDecisions = await Promise.all(
    activeReports.map(async (r) => ({ report: r, decision: await isReportDue(r.tenant.id, now) })),
  );
  const reports = dueDecisions
    .filter(({ report, decision }) => {
      if (!decision.send) {
        skippedReasons.push({
          tenantId: report.tenant.id,
          reason: "cadence_not_due",
          detail: decision.cadence,
        });
        return false;
      }
      return true;
    })
    .map(({ report }) => report);

  const sent: string[] = [];
  const errors: string[] = [];

await mapPool(reports, 8, async (report) => {
    try {
      const email = report.tenant.ownerEmail;
      if (!email) {
        skippedReasons.push({ tenantId: report.tenant.id, reason: "missing_owner_email" });
        return;
      }

      // Verdict-first subject + heading — lead with the proof, frame a quiet
      // week as steady (never empty), stay honest before tracking data lands.
      const subject = buildReportSubject(report);
      const heading = buildReportHeading(report);

      const html = reportToHtml(
        heading,
        report.summary,
        report.tenant.siteName,
        getTenantDashboardUrl(report.tenant, "/dashboard/reports"),
        report.analyticsRows,
      );
      const text = reportToText(
        heading,
        report.summary,
        getTenantDashboardUrl(report.tenant, "/dashboard/reports"),
        report.analyticsRows,
      );
      await generateWeeklyBrief(report.tenant.id);

      if (process.env.RESEND_API_KEY) {
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);
        const domain = report.tenant.resendDomain || process.env.RESEND_DOMAIN || EMAIL_DOMAIN;

        // Resend v6 returns { data, error } and does NOT throw on a failed send
        // (e.g. unverified from-domain). Check error so failures aren't silently
        // counted as successes.
        const { data, error } = await resend.emails.send({
          from: `${sanitizeEmailSubjectText(report.tenant.siteName)} <report@${domain}>`,
          to: email,
          subject,
          html,
          text,
        });
        if (error) {
          const reason = error.message || error.name || "Unknown Resend error";
          console.error(`[weekly-report] Resend rejected send for tenant ${report.tenant.id}:`, error);
          errors.push(`${report.tenant.id}: ${reason}`);
          await recordMailSend(report.tenant.id, "weekly_report", { ok: false, error: reason, to: email });
          return;
        }
        sent.push(report.tenant.id);
        await recordMailSend(report.tenant.id, "weekly_report", { ok: true, messageId: data?.id, to: email });
      } else {
        console.log(`[Weekly report dev] "${subject}" -> ${email}`);
        console.log(report.summary);
        sent.push(report.tenant.id);
        await recordMailSend(report.tenant.id, "weekly_report", { ok: true, to: email });
      }

      // Persist last-sent so the cadence gate can throttle the next run. Only
      // reached on a successful send (the Resend-error path returns above).
      await markReportSent(report.tenant.id);

      // Slack notification. Await it: on Vercel the serverless function can
      // freeze the moment the response is returned, so a fire-and-forget fetch
      // may never flush. Failure here must never fail the route, so swallow.
      if (process.env.SLACK_WEBHOOK_URL) {
        await fetch(process.env.SLACK_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: `Weekly report sent to ${report.tenant.ownerName} (${report.tenant.siteName}): ${report.pageViews.thisWeek} views, ${report.bookingClicks.thisWeek} clicks`,
          }),
        }).catch(() => {});
      }
    } catch (err) {
      const msg = `${report.tenant.id}: ${err instanceof Error ? err.message : "Unknown error"}`;
      console.error(`[weekly-report] Failed for tenant ${report.tenant.id}:`, err);
      errors.push(msg);
    }
  });

  // Notify Slack if any tenants failed or were skipped for a reportable reason.
  // Surfacing skips (e.g. missing owner email) makes "why didn't X get a
  // receipt?" answerable without digging through logs.
  const reportableSkips = skippedReasons.filter((s) => s.reason !== "inactive");
  if ((errors.length > 0 || reportableSkips.length > 0) && process.env.SLACK_WEBHOOK_URL) {
    const lines: string[] = [];
    if (errors.length > 0) {
      lines.push(`${errors.length} tenant(s) failed — ${errors.join(", ")}`);
    }
    if (reportableSkips.length > 0) {
      lines.push(
        `${reportableSkips.length} skipped — ${reportableSkips
          .map((s) => `${s.tenantId} (${s.reason}${s.detail ? `: ${s.detail}` : ""})`)
          .join(", ")}`,
      );
    }
    // Await so the summary actually flushes before the function freezes on
    // Vercel. Failure must not fail the route, so swallow.
    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `⚠ Weekly report cron: ${lines.join(" | ")}`,
      }),
    }).catch(() => {});
  }

  // The weekly report is the retention engine. If a large share of the
  // tenants we attempted to email failed, that is a systemic problem
  // (Resend key/domain reputation) — alert loudly rather than let it show
  // up as an angry "I never got my report" weeks later.
  const attempted = sent.length + errors.length;
  if (attempted >= 3 && errors.length / attempted > 0.2) {
    await alertOnce(
      "weekly_report_high_unsent_rate",
      "high",
      { attempted, failed: errors.length, sent: sent.length, sample: errors.slice(0, 5) },
      6 * 3600
    );
  }

  await recordHeartbeat("weekly-report", { ok: errors.length === 0, processed: sent.length, failed: errors.length });

  return NextResponse.json({
    processed: sent.length,
    failed: errors.length,
    skipped: skippedReasons.length,
    sent,
    errors,
    skippedReasons,
    total: sent.length + errors.length + skippedReasons.length,
  });
}
