import { requireDashboardView } from "@/lib/dashboard-auth";
import { getWeeklyBrief, getWeeklyBriefs } from "@/lib/weekly-brief";
import { getDailyMetrics, getActivity, getSearchData } from "@/lib/storage";
import { getGoal } from "@/lib/goals";
import { buildProofCards } from "@/lib/proof";
import { detectTrafficAnomaly } from "@/lib/anomaly";
import { getLatestSnapshots } from "@/lib/visibility/snapshots";
import { buildCompetitorBenchmark } from "@/lib/competitor-benchmark";
import { buildAiVisibilityScorecard } from "@/lib/ai-visibility-scorecard";
import { getSearchConsolePerf, getGa4Perf } from "@/lib/analytics";
import { buildMilestone } from "@/lib/milestone";
import { EngagementTracker } from "@/components/dashboard/EngagementTracker";
import { MilestonePanel } from "@/components/dashboard/MilestonePanel";
import { WeeklyBriefClient } from "@/components/dashboard/WeeklyBriefClient";
import { SiteHealthCard } from "@/components/dashboard/SiteHealthCard";
import { TrafficSourcesPanel } from "@/components/dashboard/TrafficSourcesPanel";
import { withClientFallbackRoot } from "@/lib/client-fallback";

// Reports = the written recaps (the anti-churn proof surface). The weekly recap
// leads with a plain verdict and carries the full brief depth — proof cards,
// competitor benchmark, the 90-day milestone, search + AI-visibility. The LIVE /
// rolling numbers live on the separate Analytics surface; this is the narrative.
// (Monthly recap + a recap archive land in the next pieces of this epic.)
export default async function ReportsPage() {
  const { tenant, clientFallbackRoot } = await requireDashboardView();

  const [brief, history, dailyMetrics, activity, goal, snapshots, searchData, searchPerf, gaPerf, milestone] =
    await Promise.all([
      getWeeklyBrief(tenant).catch(() => null),
      getWeeklyBriefs(tenant).catch(() => []),
      getDailyMetrics(tenant, 30).catch(() => []),
      getActivity(tenant, { actor: "ai" }).catch(() => []),
      getGoal(tenant).catch(() => null),
      getLatestSnapshots(tenant, 2).catch(() => []),
      getSearchData(tenant).catch(() => null),
      getSearchConsolePerf(tenant).catch(() => null),
      getGa4Perf(tenant).catch(() => null),
      buildMilestone(tenant).catch(() => null),
    ]);

  const proofCards = buildProofCards(activity, dailyMetrics);
  const anomaly = detectTrafficAnomaly(dailyMetrics);
  const benchmark = buildCompetitorBenchmark(snapshots[0] ?? null);
  const aiVisibility = buildAiVisibilityScorecard(snapshots[0] ?? null, snapshots[1] ?? null);
  const connectHref = withClientFallbackRoot(clientFallbackRoot, "/dashboard/integrations");

  return (
    <>
      <EngagementTracker event="report-view" />
      <div className="flex h-full flex-col">
        {milestone && (
          <div className="shrink-0 px-4 pt-5 sm:px-8 sm:pt-7">
            <div className="mx-auto w-full max-w-5xl">
              <MilestonePanel milestone={milestone} />
            </div>
          </div>
        )}
        <div className="min-h-0 flex-1">
          <WeeklyBriefClient
            brief={brief}
            history={history}
            dailyMetrics={dailyMetrics}
            proofCards={proofCards}
            goal={goal}
            anomaly={anomaly}
            benchmark={benchmark}
            aiVisibility={aiVisibility}
            searchData={searchData}
            searchPerf={searchPerf}
            gaPerf={gaPerf}
            analyticsConnectHref={connectHref}
            footerSlot={
              <div className="space-y-8">
                <TrafficSourcesPanel ga={gaPerf} connectHref={connectHref} />
                <details className="group rounded-2xl border border-glass-border bg-glass">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted">Site health</p>
                      <p className="mt-1 text-[13px] text-gray-muted">
                        The daily check of your live site: speed, security, SEO, accessibility.
                      </p>
                    </div>
                    <span className="shrink-0 text-[12px] font-medium text-accent group-open:hidden">Show</span>
                    <span className="hidden shrink-0 text-[12px] font-medium text-accent group-open:inline">Hide</span>
                  </summary>
                  <div className="px-4 pb-4">
                    <SiteHealthCard />
                  </div>
                </details>
              </div>
            }
          />
        </div>
      </div>
    </>
  );
}
