import { NextResponse } from "next/server";
import { recordHeartbeat } from "@/lib/heartbeat";
import { mapPool } from "@/lib/concurrency";
import { recordMailSend } from "@/lib/storage/mail-log";
import { alertOnce } from "@/lib/monitoring";
import { generateAllReports } from "@/lib/reports";
import { getTenantDashboardUrl } from "@/lib/tenant-urls";
import { generateWeeklyBrief } from "@/lib/weekly-brief";
import { EMAIL_DOMAIN } from "@/lib/brand";
import { sanitizeEmailSubjectText, escapeHtml } from "@/lib/invite-email";

function reportToHtml(summary: string, siteName: string, dashboardUrl: string): string {
  // The summary can echo tenant-authored content (service names, search queries)
  // via the deterministic fallback or the Gemini output, and siteName is
  // tenant-set — escape both before interpolating into HTML so a renamed service
  // like `<a href="evil">…</a>` can't become a live link in the owner's email
  // sent from Strelva's verified domain. Escape THEN convert newlines to <br>.
  const paragraphs = summary
    .split("\n\n")
    .filter(Boolean)
    .map((p) => `<p style="margin: 0 0 16px; line-height: 1.6; color: #1a1a1a;">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const safeSiteName = escapeHtml(siteName);

  return `<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 0; background: #f5f4f2; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <div style="max-width: 520px; margin: 0 auto; padding: 40px 24px;">
    <div style="background: #fff; border-radius: 12px; padding: 32px; border: 1px solid #e8e6e3;">
      <p style="font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: #7c9a8e; margin: 0 0 24px; font-weight: 700;">Weekly Update</p>
      <h1 style="font-size: 22px; line-height: 1.2; color: #1a1510; margin: 0 0 20px; font-weight: 700;">Your weekly report</h1>
      ${paragraphs}
      <p style="margin: 24px 0 0;">
        <a href="${dashboardUrl}" style="display: inline-block; color: #5d7f70; font-size: 18px; font-weight: 700; text-decoration: none;">
          View your weekly report &rarr;
        </a>
      </p>
      <hr style="border: none; border-top: 1px solid #e8e6e3; margin: 24px 0;">
      <p style="font-size: 13px; color: #77716a; margin: 0;">
        Sent by Strelva for ${safeSiteName}
      </p>
    </div>
  </div>
</body>
</html>`;
}

function reportToText(summary: string, dashboardUrl: string): string {
  return `${summary}\n\nView your weekly report: ${dashboardUrl}`;
}

export async function GET() {
  // Auth handled by proxy (CRON_SECRET check)

  const { reports: allReports, skipped: generationSkips } = await generateAllReports();

  // Track skipped tenants with a reason so "why did X never get a receipt?" is
  // answerable from this response. Seed with tenants skipped during generation
  // (missing owner email, inactive, generation failure).
  const skippedReasons: { tenantId: string; reason: string; detail?: string }[] = generationSkips.map(
    (s) => ({ tenantId: s.tenantId, reason: s.reason, detail: s.detail }),
  );

  const reports = allReports.filter((r) => {
    if (r.tenant.subscriptionStatus === "cancelled") {
      skippedReasons.push({ tenantId: r.tenant.id, reason: "subscription_cancelled" });
      return false;
    }
    return true;
  });

  const sent: string[] = [];
  const errors: string[] = [];

await mapPool(reports, 8, async (report) => {
    try {
      const email = report.tenant.ownerEmail;
      if (!email) {
        skippedReasons.push({ tenantId: report.tenant.id, reason: "missing_owner_email" });
        return;
      }

      const subject = report.pageViews.thisWeek > 0
        ? `${report.pageViews.thisWeek} people found you this week`
        : `Your weekly site update`;

      const html = reportToHtml(
        report.summary,
        report.tenant.siteName,
        getTenantDashboardUrl(report.tenant, "/dashboard/reports"),
      );
      const text = reportToText(
        report.summary,
        getTenantDashboardUrl(report.tenant, "/dashboard/reports"),
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
