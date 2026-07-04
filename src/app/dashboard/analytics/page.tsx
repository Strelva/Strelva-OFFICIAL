import { requireDashboardView } from "@/lib/dashboard-auth";
import { getWeeklyBrief, getWeeklyBriefs } from "@/lib/weekly-brief";
import { getDailyMetrics, getActivity, getSearchData } from "@/lib/storage";
import { getGoal } from "@/lib/goals";
import { buildProofCards } from "@/lib/proof";
import { detectTrafficAnomaly } from "@/lib/anomaly";
import { getLatestSnapshots } from "@/lib/visibility/snapshots";
import { buildCompetitorBenchmark } from "@/lib/competitor-benchmark";
import { getSearchConsolePerf, getGa4Perf } from "@/lib/analytics";
import { EngagementTracker } from "@/components/dashboard/EngagementTracker";
import { WeeklyBriefClient } from "@/components/dashboard/WeeklyBriefClient";
import { SiteHealthCard } from "@/components/dashboard/SiteHealthCard";
import { withClientFallbackRoot } from "@/lib/client-fallback";

// Analytics = the merged Reports + Health surface. The weekly report leads with a
// plain verdict (WeeklyBriefClient's buildVerdict) and carries the full data depth
// — 30-day metrics, proof, search panel. Site health drops in below it as a
// collapsible section via footerSlot, so every number lives in one scroll. No data
// is stripped: Reports and Health both render here, just consolidated.
export default async function AnalyticsPage() {
  const { tenant, clientFallbackRoot } = await requireDashboardView();

  // Degrade to the empty state on a transient backend error rather than
  // escalating a recoverable null into the full error boundary.
  const [brief, history, dailyMetrics, activity, goal, snapshots, searchData, searchPerf, gaPerf] = await Promise.all([
    getWeeklyBrief(tenant).catch(() => null),
    getWeeklyBriefs(tenant).catch(() => []),
    getDailyMetrics(tenant, 30).catch(() => []),
    getActivity(tenant, { actor: "ai" }).catch(() => []),
    getGoal(tenant).catch(() => null),
    getLatestSnapshots(tenant, 1).catch(() => []),
    getSearchData(tenant).catch(() => null),
    // Live Search Console + GA4 for THIS tenant. Fail-soft: these never throw and
    // always return a status, so a bad read degrades to the panel's connect nudge.
    getSearchConsolePerf(tenant).catch(() => null),
    getGa4Perf(tenant).catch(() => null),
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
        searchData={searchData}
        searchPerf={searchPerf}
        gaPerf={gaPerf}
        analyticsConnectHref={withClientFallbackRoot(clientFallbackRoot, "/dashboard/integrations")}
        footerSlot={
          <details className="group rounded-2xl border border-glass-border bg-glass">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4">
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted">
                  Site health
                </p>
                <p className="mt-1 text-[13px] text-gray-muted">
                  The daily check of your live site — speed, security, SEO, accessibility.
                </p>
              </div>
              <span className="shrink-0 text-[12px] font-medium text-accent group-open:hidden">Show</span>
              <span className="hidden shrink-0 text-[12px] font-medium text-accent group-open:inline">Hide</span>
            </summary>
            <div className="px-4 pb-4">
              <SiteHealthCard />
            </div>
          </details>
        }
      />
    </>
  );
}
