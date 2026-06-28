import { requireDashboardView } from "@/lib/dashboard-auth";
import { getWeeklyBrief, getWeeklyBriefs } from "@/lib/weekly-brief";
import { EngagementTracker } from "@/components/dashboard/EngagementTracker";
import { WeeklyBriefClient } from "@/components/dashboard/WeeklyBriefClient";

export default async function ReportsPage() {
  const { tenant } = await requireDashboardView();

  // Degrade to the empty state on a transient backend error rather than
  // escalating a recoverable null into the full error boundary.
  const [brief, history] = await Promise.all([
    getWeeklyBrief(tenant).catch(() => null),
    getWeeklyBriefs(tenant).catch(() => []),
  ]);

  return (
    <>
      <EngagementTracker event="report-view" />
      <WeeklyBriefClient brief={brief} history={history} />
    </>
  );
}
