import { requireDashboardView } from "@/lib/dashboard-auth";
import { getWeeklyBrief, getWeeklyBriefs } from "@/lib/weekly-brief";
import { getDailyMetrics, getActivity } from "@/lib/storage";
import { getGoal } from "@/lib/goals";
import { buildProofCards } from "@/lib/proof";
import { detectTrafficAnomaly } from "@/lib/anomaly";
import { getLatestSnapshots } from "@/lib/visibility/snapshots";
import { buildCompetitorBenchmark } from "@/lib/competitor-benchmark";
import { EngagementTracker } from "@/components/dashboard/EngagementTracker";
import { WeeklyBriefClient } from "@/components/dashboard/WeeklyBriefClient";

export default async function ReportsPage() {
  const { tenant } = await requireDashboardView();

  // Degrade to the empty state on a transient backend error rather than
  // escalating a recoverable null into the full error boundary.
  const [brief, history, dailyMetrics, activity, goal, snapshots] = await Promise.all([
    getWeeklyBrief(tenant).catch(() => null),
    getWeeklyBriefs(tenant).catch(() => []),
    getDailyMetrics(tenant, 30).catch(() => []),
    getActivity(tenant, { actor: "ai" }).catch(() => []),
    getGoal(tenant).catch(() => null),
    getLatestSnapshots(tenant, 1).catch(() => []),
  ]);

  // Correlate AI changes with the traffic that followed → before/after proof.
  const proofCards = buildProofCards(activity, dailyMetrics);
  // Flag a meaningful break in the traffic trend (down 35%+ / up 100%+).
  const anomaly = detectTrafficAnomaly(dailyMetrics);
  // Where you rank vs competitors, from the latest visibility scan.
  const benchmark = buildCompetitorBenchmark(snapshots[0] ?? null);

  return (
    <>
      <EngagementTracker event="report-view" />
      <WeeklyBriefClient
        brief={brief}
        history={history}
        dailyMetrics={dailyMetrics}
        proofCards={proofCards}
        goal={goal}
        anomaly={anomaly}
        benchmark={benchmark}
      />
    </>
  );
}
