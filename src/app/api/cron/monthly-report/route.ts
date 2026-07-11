import { NextResponse } from "next/server";
import { recordHeartbeat } from "@/lib/heartbeat";
import { mapPool } from "@/lib/concurrency";
import { recordMailSend } from "@/lib/storage/mail-log";
import { alertOnce } from "@/lib/monitoring";
import { getAllTenants } from "@/lib/tenants";
import { generateMonthlyRecap } from "@/lib/weekly-brief";
import { getTenantDashboardUrl } from "@/lib/tenant-urls";
import { EMAIL_DOMAIN } from "@/lib/brand";
import { sanitizeEmailSubjectText } from "@/lib/invite-email";
import { emailSendingPaused } from "@/lib/email-enabled";
import { renderEmailHtml, renderEmailText } from "@/lib/email/layout";
import { getRedis } from "@/lib/redis";
import type { WeeklyBrief } from "@/lib/types";

// Iterates tenants; matches the platform function ceiling so it can't die
// mid-batch at scale.
export const maxDuration = 300;

// Send-once-per-month marker so a re-run (retry / manual trigger) inside the
// same month never double-emails a tenant. Set only after a confirmed send.
function sentKey(tenantId: string, monthKey: string): string {
  return `reb:monthly-recap-sent:${tenantId}:${monthKey}`;
}

// Verdict-first, honest heading from the month's numbers.
function buildMonthlyHeading(recap: WeeklyBrief): string {
  const month = new Date(`${recap.weekStart}T00:00:00`).toLocaleDateString("en-US", { month: "long" });
  const views = recap.stats.pageViews;
  if (views === 0) return `Your ${month} recap: a steady month`;
  const people = `${views.toLocaleString()} ${views === 1 ? "person" : "people"} found you`;
  const delta = recap.stats.pageViewsDelta;
  if (delta > 0) return `${people} in ${month}, up from the month before`;
  return `${people} in ${month}. Here's your recap`;
}

function recapParagraphs(summary: string): string[] {
  return summary.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

export async function GET() {
  await recordHeartbeat("monthly-report").catch(() => {});

  // The recap is GENERATED regardless (the on-screen Reports surface needs it);
  // only the EMAIL send is gated on the pause switch. So a paused run still
  // refreshes every tenant's monthly recap, it just doesn't email it.
  const paused = emailSendingPaused();

  const now = new Date();
  // The recap covers the PREVIOUS calendar month; key the dedup marker to it.
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  const monthName = prev.toLocaleDateString("en-US", { month: "long" });

  const tenants = (await getAllTenants().catch(() => [])).filter(
    (t) => t.active !== false && t.subscriptionStatus !== "cancelled" && !!t.ownerEmail,
  );

  const sent: string[] = [];
  const errors: string[] = [];
  const skipped: { tenantId: string; reason: string }[] = [];
  const redis = getRedis();

  await mapPool(tenants, 8, async (tenant) => {
    try {
      // Always refresh the recap so the Reports surface is current.
      const recap = await generateMonthlyRecap(tenant.id);

      // Send gates: pause switch, then the once-per-month dedup marker.
      if (paused) {
        skipped.push({ tenantId: tenant.id, reason: "email_paused" });
        return;
      }
      if (redis) {
        const already = await redis.get(sentKey(tenant.id, monthKey)).catch(() => null);
        if (already) {
          skipped.push({ tenantId: tenant.id, reason: "already_sent" });
          return;
        }
      }

      const heading = buildMonthlyHeading(recap);
      const paragraphs = recapParagraphs(recap.summary);
      const dashboardUrl = getTenantDashboardUrl(tenant, "/dashboard/reports");

      const html = renderEmailHtml({
        preheader: paragraphs[0],
        heading,
        paragraphs,
        button: { label: "See your full recap", url: dashboardUrl },
        footerNote: `Your ${monthName} recap for ${tenant.siteName}`,
      });
      const text = renderEmailText({ heading, paragraphs, button: { label: "See your full recap", url: dashboardUrl } });

      if (process.env.RESEND_API_KEY) {
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);
        const domain = tenant.resendDomain || process.env.RESEND_DOMAIN || EMAIL_DOMAIN;
        const { data, error } = await resend.emails.send({
          from: `${sanitizeEmailSubjectText(tenant.siteName)} <report@${domain}>`,
          to: tenant.ownerEmail!,
          subject: `Your ${monthName} recap`,
          html,
          text,
        });
        if (error) {
          errors.push(`${tenant.id}: ${error.message ?? "send failed"}`);
          await recordMailSend(tenant.id, "monthly_report", { ok: false, error: error.message, to: tenant.ownerEmail! }).catch(() => {});
          return;
        }
        await recordMailSend(tenant.id, "monthly_report", { ok: true, messageId: data?.id, to: tenant.ownerEmail! }).catch(() => {});
      }

      // Mark sent only after a confirmed send (or a dry run without a key).
      if (redis) await redis.set(sentKey(tenant.id, monthKey), "1", { ex: 60 * 60 * 24 * 45 }).catch(() => {});
      sent.push(tenant.id);
    } catch (err) {
      errors.push(`${tenant.id}: ${err instanceof Error ? err.message : "error"}`);
    }
  });

  if (errors.length) {
    await alertOnce("monthly-report-errors", "medium", {
      month: monthKey,
      sample: errors.slice(0, 5).join("; "),
    }).catch(() => {});
  }

  return NextResponse.json({ status: "complete", month: monthKey, sent: sent.length, skipped: skipped.length, errors });
}
