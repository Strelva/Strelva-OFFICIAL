import { redirect } from "next/navigation";
import { getTenantFromHeaders } from "@/lib/tenant";
import { hasTenantAccess } from "@/lib/auth";
import { getClickCounts, getSectionTimestamps, getActivity, getContent, getWeeklyReports } from "@/lib/storage";
import { getTemplateForTenant } from "@/components/templates/registry";
import { detectStaleSections } from "@/lib/reports";
import { safeFetch } from "@/lib/utils";
import { ReportsClient } from "./ReportsClient";
import type { ContentSection } from "@/lib/types";

export default async function ReportsPage() {
  const tenant = await getTenantFromHeaders();
  const allowed = await hasTenantAccess(tenant);
  if (!allowed) redirect("/");

  const template = await getTemplateForTenant(tenant);
  const contentSections: ContentSection[] = template.contentSections as ContentSection[];

  const [pageViews, bookingClicks, timestamps, activity, settings, reportHistory] = await Promise.all([
    safeFetch(() => getClickCounts("page-view", tenant), { total: 0, thisWeek: 0, today: 0 }),
    safeFetch(() => getClickCounts("booking-click", tenant), { total: 0, thisWeek: 0, today: 0 }),
    safeFetch(() => getSectionTimestamps(tenant), {}),
    safeFetch(() => getActivity(tenant), []),
    safeFetch(() => getContent("settings", tenant), { siteName: "", siteTagline: "", siteDescription: "", footerTagline: "", copyrightText: "" }),
    safeFetch(() => getWeeklyReports(tenant, 12), []),
  ]);

  const staleSections = detectStaleSections(timestamps, contentSections);

  // Get recent activity (last 10 items)
  const recentActivity = activity
    .slice(0, 10)
    .map((a: { text: string; time: string; type?: string }) => ({
      text: a.text,
      time: a.time,
      type: a.type,
    }));

  return (
    <ReportsClient
      siteName={settings.siteName || "Your Business"}
      pageViews={pageViews}
      bookingClicks={bookingClicks}
      staleSections={staleSections}
      recentActivity={recentActivity}
      template={template.id}
      reportHistory={reportHistory}
    />
  );
}
