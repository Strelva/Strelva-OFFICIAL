import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { getAllTenants, getTenantConfig } from "./tenants";
import { getClickCounts, getActivity, getSectionTimestamps, getContent } from "./storage";
import type { TenantConfig, ContentSection } from "./types";
import type { ActivityEntry } from "./storage";

export interface WeeklyReportData {
  tenant: TenantConfig;
  pageViews: { total: number; thisWeek: number };
  bookingClicks: { total: number; thisWeek: number };
  staleSections: { section: string; daysSinceUpdate: number }[];
  recentActivity: ActivityEntry[];
  summary: string;
}

const STALE_THRESHOLD_DAYS = 30;

export function detectStaleSections(
  timestamps: Record<string, string>,
  sections: string[],
): { section: string; daysSinceUpdate: number }[] {
  const now = Date.now();
  const stale: { section: string; daysSinceUpdate: number }[] = [];

  for (const section of sections) {
    const ts = timestamps[section];
    if (!ts) continue;
    const days = Math.floor((now - new Date(ts).getTime()) / 86_400_000);
    if (days >= STALE_THRESHOLD_DAYS) {
      stale.push({ section, daysSinceUpdate: days });
    }
  }

  return stale.sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate);
}

async function generateReportSummary(data: {
  siteName: string;
  ownerName: string;
  pageViews: { total: number; thisWeek: number };
  bookingClicks: { total: number; thisWeek: number };
  staleSections: { section: string; daysSinceUpdate: number }[];
  recentActivity: ActivityEntry[];
}): Promise<string> {
  const activitySummary = data.recentActivity
    .slice(0, 10)
    .map((a) => `- ${a.text}`)
    .join("\n");

  const staleSummary = data.staleSections
    .map((s) => `- ${s.section} (${s.daysSinceUpdate} days)`)
    .join("\n");

  const { text } = await generateText({
    model: google("gemini-2.5-flash"),
    prompt: `Write a short, warm weekly report email for ${data.ownerName} about their business website "${data.siteName}".

Stats this week:
- ${data.pageViews.thisWeek} people found the site (${data.pageViews.total} total)
- ${data.bookingClicks.thisWeek} booking clicks (${data.bookingClicks.total} total)

${staleSummary ? `Sections that haven't been updated in a while:\n${staleSummary}` : "All sections are up to date."}

${activitySummary ? `Recent site activity:\n${activitySummary}` : "No recent activity."}

Rules:
- 3-5 short paragraphs max
- Lead with the most interesting metric
- If sections are stale, suggest updating one specific section with a concrete idea
- Use "you" not "your site" — make it personal
- Sound like a helpful coworker texting an update, not a marketing email
- No subject line, no greeting, no sign-off — just the body
- Plain text, no markdown or HTML formatting`,
  });

  return text;
}

export async function generateWeeklyReport(
  tenantId: string,
): Promise<WeeklyReportData | null> {
  const tenant = await getTenantConfig(tenantId);
  if (!tenant || !tenant.active) return null;

  const contentSections: ContentSection[] = [
    "hero", "services", "story", "testimonials", "events",
    "providers", "contact", "settings", "faq",
  ];

  const [pageViews, bookingClicks, timestamps, activity, settings] =
    await Promise.all([
      getClickCounts("page-view", tenantId),
      getClickCounts("booking-click", tenantId),
      getSectionTimestamps(tenantId),
      getActivity(tenantId),
      getContent("settings", tenantId),
    ]);

  const staleSections = detectStaleSections(
    timestamps,
    contentSections,
  );

  const summary = await generateReportSummary({
    siteName: settings.siteName || tenant.siteName,
    ownerName: tenant.ownerName,
    pageViews,
    bookingClicks,
    staleSections,
    recentActivity: activity,
  });

  return {
    tenant,
    pageViews,
    bookingClicks,
    staleSections,
    recentActivity: activity,
    summary,
  };
}

export async function generateAllReports(): Promise<WeeklyReportData[]> {
  const tenants = await getAllTenants();
  const active = tenants.filter((t) => t.active && t.ownerEmail);
  const reports: WeeklyReportData[] = [];

  for (const tenant of active) {
    const report = await generateWeeklyReport(tenant.id);
    if (report) reports.push(report);
  }

  return reports;
}
