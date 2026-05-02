import { NextResponse } from "next/server";
import { generateAllReports } from "@/lib/reports";
import { generateWeeklyBrief } from "@/lib/weekly-brief";

function reportToHtml(summary: string, siteName: string, dashboardUrl: string): string {
  const paragraphs = summary
    .split("\n\n")
    .filter(Boolean)
    .map((p) => `<p style="margin: 0 0 16px; line-height: 1.6; color: #1a1a1a;">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");

  return `<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 0; background: #f5f4f2; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <div style="max-width: 520px; margin: 0 auto; padding: 40px 24px;">
    <div style="background: #fff; border-radius: 12px; padding: 32px; border: 1px solid #e8e6e3;">
      <p style="font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #7c9a8e; margin: 0 0 24px; font-weight: 600;">Weekly Update</p>
      ${paragraphs}
      <p style="margin: 24px 0 0;">
        <a href="${dashboardUrl}" style="display: inline-block; color: #5d7f70; font-size: 14px; font-weight: 600; text-decoration: none;">
          View in dashboard &rarr;
        </a>
      </p>
      <hr style="border: none; border-top: 1px solid #e8e6e3; margin: 24px 0;">
      <p style="font-size: 12px; color: #999; margin: 0;">
        Sent by Scaffold Web for ${siteName}
      </p>
    </div>
  </div>
</body>
</html>`;
}

export async function GET() {
  // Auth handled by middleware (CRON_SECRET check)

  const allReports = await generateAllReports();
  const reports = allReports.filter((r) => r.tenant.subscriptionStatus !== "cancelled");
  const sent: string[] = [];
  const skipped = allReports.length - reports.length;
  const errors: string[] = [];

  for (const report of reports) {
    try {
      const email = report.tenant.ownerEmail;
      if (!email) continue;

      const subject = report.pageViews.thisWeek > 0
        ? `${report.pageViews.thisWeek} people found you this week`
        : `Your weekly site update`;

      const appUrl = process.env.NEXT_PUBLIC_APP_URL
        || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://scaffoldweb.com");
      const html = reportToHtml(report.summary, report.tenant.siteName, `${appUrl}/dashboard`);
      await generateWeeklyBrief(report.tenant.id);

      if (process.env.RESEND_API_KEY) {
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);
        const domain = report.tenant.resendDomain || process.env.RESEND_DOMAIN || "updates.scaffoldweb.com";

        await resend.emails.send({
          from: `${report.tenant.siteName} <report@${domain}>`,
          to: email,
          subject,
          html,
          text: report.summary,
        });
        sent.push(report.tenant.id);
      } else {
        console.log(`[Weekly report dev] "${subject}" -> ${email}`);
        console.log(report.summary);
        sent.push(report.tenant.id);
      }

      // Slack notification
      if (process.env.SLACK_WEBHOOK_URL) {
        fetch(process.env.SLACK_WEBHOOK_URL, {
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
  }

  // Notify Slack if any tenants failed
  if (errors.length > 0 && process.env.SLACK_WEBHOOK_URL) {
    fetch(process.env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `⚠ Weekly report cron: ${errors.length} tenant(s) failed — ${errors.join(", ")}`,
      }),
    }).catch(() => {});
  }

  return NextResponse.json({ processed: sent.length, failed: errors.length, sent, errors, skipped, total: allReports.length });
}
