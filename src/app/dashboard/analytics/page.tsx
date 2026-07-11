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

// Analytics = the merged Reports + Health surface. The weekly report leads with a
// plain verdict (WeeklyBriefClient's buildVerdict) and carries the full data depth
// — 30-day metrics, proof, search panel. Site health drops in below it as a
// collapsible section via footerSlot, so every number lives in one scroll. No data
// is stripped: Reports and Health both render here, just consolidated.
export default async function AnalyticsPage() {
  const { tenant, clientFallbackRoot } = await requireDashboardView();

  // Degrade to the empty state on a transient backend error rather than
  // escalating a recoverable null into the full error boundary.
  const [brief, history, dailyMetrics, activity, goal, snapshots, searchData, searchPerf, gaPerf, milestone] = await Promise.all([
    getWeeklyBrief(tenant).catch(() => null),
    getWeeklyBriefs(tenant).catch(() => []),
    getDailyMetrics(tenant, 30).catch(() => []),
    getActivity(tenant, { actor: "ai" }).catch(() => []),
    getGoal(tenant).catch(() => null),
    // Two snapshots: latest powers the benchmark + AI scorecard, previous gives
    // the week-over-week "new this week" trend. Reuses data already collected.
    getLatestSnapshots(tenant, 2).catch(() => []),
    getSearchData(tenant).catch(() => null),
    // Live Search Console + GA4 for THIS tenant. Fail-soft: these never throw and
    // always return a status, so a bad read degrades to the panel's connect nudge.
    getSearchConsolePerf(tenant).catch(() => null),
    getGa4Perf(tenant).catch(() => null),
    // The 90-day "prove it" recap: real then -> now deltas from stored history
    // (scans, reviews, traffic). Fail-soft so a blip drops the panel, never the page.
    buildMilestone(tenant).catch(() => null),
  ]);

  // Correlate AI changes with the traffic that followed → before/after proof.
  const proofCards = buildProofCards(activity, dailyMetrics);
  // Flag a meaningful break in the traffic trend (down 35%+ / up 100%+).
  const anomaly = detectTrafficAnomaly(dailyMetrics);
  // Where you rank vs competitors, from the latest visibility scan.
  const benchmark = buildCompetitorBenchmark(snapshots[0] ?? null);
  // "You in AI answers" scorecard — the AI-search wedge, surfaced to the owner.
  const aiVisibility = buildAiVisibilityScorecard(snapshots[0] ?? null, snapshots[1] ?? null);

  const connectHref = withClientFallbackRoot(clientFallbackRoot, "/dashboard/integrations");

  return (
    <>
      <EngagementTracker event="report-view" />
      {/* The 90-day "prove it" recap pins above the weekly brief as a sibling
          section. The brief owns the full-height scroll, so it stays in its own
          flex-1 region below and the milestone sits as a shrink-0 band on top —
          the brief component itself is untouched. */}
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
            {/* Where your visitors come from — GA4 traffic sources. Totals + top
                pages already render mid-brief in the Search & Analytics panel;
                this fills the missing "which channels" view in the same scroll. */}
            <TrafficSourcesPanel ga={gaPerf} connectHref={connectHref} />
            <details className="group rounded-2xl border border-glass-border bg-glass">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted">
                    Site health
                  </p>
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
