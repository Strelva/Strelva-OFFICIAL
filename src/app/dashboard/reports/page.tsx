import { requireDashboardView } from "@/lib/dashboard-auth";
import { getWeeklyBrief, getWeeklyBriefs, getMonthlyRecap, getMonthlyRecaps } from "@/lib/weekly-brief";
import { getDailyMetrics, getActivity, getSearchData } from "@/lib/storage";
import { getGoal } from "@/lib/goals";
import { buildProofCards } from "@/lib/proof";
import { getLatestSnapshots } from "@/lib/visibility/snapshots";
import { buildCompetitorBenchmark } from "@/lib/competitor-benchmark";
import { buildAiVisibilityScorecard } from "@/lib/ai-visibility-scorecard";
import { getSearchConsolePerf, getGa4Perf } from "@/lib/analytics";
import { EngagementTracker } from "@/components/dashboard/EngagementTracker";
import { WeeklyBriefClient } from "@/components/dashboard/WeeklyBriefClient";
import { ReportsViewToggle } from "@/components/dashboard/ReportsViewToggle";
import { withClientFallbackRoot } from "@/lib/client-fallback";

// Reports = the written recaps (the anti-churn proof surface). A Weekly/Monthly
// toggle switches between the weekly brief and the monthly recap — same rich
// component, both narrative + proof + milestone. The LIVE / rolling numbers live
// on the separate Analytics surface; this is the story.
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenant, clientFallbackRoot } = await requireDashboardView();
  const sp = await searchParams;
  const viewParam = typeof sp.view === "string" ? sp.view : "weekly";

  const [weeklyBrief, weeklyHistory, monthlyRecap, monthlyHistory, dailyMetrics, activity, goal, snapshots, searchData, searchPerf, gaPerf] =
    await Promise.all([
      getWeeklyBrief(tenant).catch(() => null),
      getWeeklyBriefs(tenant).catch(() => []),
      getMonthlyRecap(tenant).catch(() => null),
      getMonthlyRecaps(tenant).catch(() => []),
      getDailyMetrics(tenant, 62).catch(() => []),
      getActivity(tenant, { actor: "ai" }).catch(() => []),
      getGoal(tenant).catch(() => null),
      getLatestSnapshots(tenant, 2).catch(() => []),
      getSearchData(tenant).catch(() => null),
      getSearchConsolePerf(tenant).catch(() => null),
      getGa4Perf(tenant).catch(() => null),
    ]);

  const hasMonthly = !!monthlyRecap;
  const hasWeekly = !!weeklyBrief;
  const view: "weekly" | "monthly" = viewParam === "monthly" && hasMonthly ? "monthly" : "weekly";
  const brief = view === "monthly" ? monthlyRecap : weeklyBrief;
  const history = view === "monthly" ? monthlyHistory : weeklyHistory;
  const periodLabel = view === "monthly" ? "this month" : "this week";

  // The chart matches the recap's window: the last 30 days for the weekly view,
  // the recap's calendar month (labelled) for the monthly view.
  const last30 = dailyMetrics.slice(-30);
  let chartMetrics = last30;
  let chartLabel: string | undefined = undefined;
  if (view === "monthly" && monthlyRecap) {
    chartMetrics = dailyMetrics.filter((d) => d.date >= monthlyRecap.weekStart && d.date <= monthlyRecap.weekEnd);
    chartLabel = new Date(`${monthlyRecap.weekStart}T00:00:00`).toLocaleDateString("en-US", { month: "long" });
  }

  const proofCards = buildProofCards(activity, last30);
  // The live traffic anomaly is a "right now" signal — it lives on Analytics.
  // Reports is the dated recap, so it doesn't carry a current-week alert.
  const benchmark = buildCompetitorBenchmark(snapshots[0] ?? null);
  const aiVisibility = buildAiVisibilityScorecard(snapshots[0] ?? null, snapshots[1] ?? null);
  const connectHref = withClientFallbackRoot(clientFallbackRoot, "/dashboard/integrations");

  return (
    <>
      <EngagementTracker event="report-view" />
      <div className="flex h-full flex-col">
        {(hasMonthly || hasWeekly) && (
          <div className="shrink-0 px-4 pt-5 sm:px-8 sm:pt-7">
            <div className="mx-auto w-full max-w-5xl space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted">Reports</p>
                {hasMonthly ? (
                  <ReportsViewToggle current={view} />
                ) : hasWeekly ? (
                  <p className="text-[12px] text-gray-muted">Your monthly recap will appear here after your first full month.</p>
                ) : null}
              </div>
            </div>
          </div>
        )}
        <div className="min-h-0 flex-1">
          <WeeklyBriefClient
            brief={brief}
            history={history}
            periodLabel={periodLabel}
            chartLabel={chartLabel}
            dailyMetrics={chartMetrics}
            proofCards={proofCards}
            goal={goal}
            benchmark={benchmark}
            aiVisibility={aiVisibility}
            searchData={searchData}
            searchPerf={searchPerf}
            gaPerf={gaPerf}
            analyticsConnectHref={connectHref}
          />
        </div>
      </div>
    </>
  );
}
