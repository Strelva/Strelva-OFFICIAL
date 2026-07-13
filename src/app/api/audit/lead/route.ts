import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getRedis } from "@/lib/redis";
import { isRateLimitedWindowedAsync } from "@/lib/rate-limit";
import { runAudit } from "@/lib/audit/checks";
import { computeOverallScore, scoreToGrade } from "@/lib/audit/scoring";
import type { AuditResult } from "@/lib/audit/types";
import { saveAuditReport } from "@/lib/audit-report-store";
import { sendAuditReportEmail } from "@/lib/audit-report-email";
import { sendSlackNotification } from "@/lib/slack";

/**
 * Gated full-audit lead capture for the marketing site. One call does the whole
 * flow: validate name+email+url, run the deep audit, persist the report under a
 * shareable id, notify the operator (Slack), and send the prospect their report
 * email (dormant while client email is paused). Returns the grade + category
 * summary + the report link — NOT the itemized findings, which live in the
 * report (the reason the email is worth opening). This is the audit-lead pipe,
 * distinct from the /access-request build-request pipe.
 */

const MAX_LEADS_PER_DAY = 8;
const REPORT_BASE_URL = (process.env.AUDIT_REPORT_BASE_URL ?? "https://strelva.com").replace(/\/$/, "");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const redis = getRedis();
  if (redis) {
    const limited = await isRateLimitedWindowedAsync(`audit-lead:${ip}`, MAX_LEADS_PER_DAY, 86400000);
    if (limited) {
      return NextResponse.json(
        { error: "You've run several audits today. Please try again tomorrow." },
        { status: 429 },
      );
    }
  }

  let body: { name?: string; email?: string; url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = String(body.name ?? "").trim().slice(0, 120);
  const email = String(body.email ?? "").trim().slice(0, 160);
  const rawUrl = String(body.url ?? "").trim();

  if (!name) return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  if (!rawUrl) return NextResponse.json({ error: "A site URL is required." }, { status: 400 });

  let url = rawUrl;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "That doesn't look like a valid URL." }, { status: 400 });
  }

  try {
    const categories = await runAudit(url);
    const overallScore = computeOverallScore(categories);
    const grade = scoreToGrade(overallScore);
    const result: AuditResult = {
      url,
      scannedAt: new Date().toISOString(),
      overallScore,
      grade,
      categories,
    };

    const lead = { name, email, url };
    const reportId = await saveAuditReport(result, lead);
    const reportUrl = reportId ? `${REPORT_BASE_URL}/api/audit/report/${reportId}` : null;

    // Operator notification (fire-and-forget; a Slack blip never fails the lead).
    const host = url.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
    void sendSlackNotification({
      text: `New audit lead\n*${name}* <${email}>\n${host} — grade ${grade} (${overallScore}/100)${reportUrl ? `\nReport: ${reportUrl}` : ""}`,
    });

    // Prospect email — real send only when client email is switched on.
    const emailed = reportUrl
      ? await sendAuditReportEmail({ lead, result, reportUrl })
      : false;

    return NextResponse.json({
      reportId,
      reportUrl,
      url,
      overallScore,
      grade,
      categories: categories.map((c) => ({ name: c.name, slug: c.slug, score: c.score })),
      emailed,
    });
  } catch (err) {
    Sentry.captureException(err, { tags: { feature: "audit-lead" }, extra: { url } });
    return NextResponse.json({ error: "The audit failed to run. Please try again." }, { status: 500 });
  }
}
