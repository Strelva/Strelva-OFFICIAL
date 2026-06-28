import { requireDashboardView } from "@/lib/dashboard-auth";
import { getWeeklyBrief, getWeeklyBriefs } from "@/lib/weekly-brief";
import { getDailyMetrics } from "@/lib/storage";
import { EngagementTracker } from "@/components/dashboard/EngagementTracker";
import { WeeklyBriefClient } from "@/components/dashboard/WeeklyBriefClient";

export default async function ReportsPage() {
  const { tenant } = await requireDashboardView();

  // Degrade to the empty state on a transient backend error rather than
  // escalating a recoverable null into the full error boundary.
  const [brief, history, dailyMetrics] = await Promise.all([
    getWeeklyBrief(tenant).catch(() => null),
    getWeeklyBriefs(tenant).catch(() => []),
    getDailyMetrics(tenant, 30).catch(() => []),
  ]);

  return (
    <>
      <EngagementTracker event="report-view" />
      <WeeklyBriefClient brief={brief} history={history} dailyMetrics={dailyMetrics} />
    </>
  );
}
