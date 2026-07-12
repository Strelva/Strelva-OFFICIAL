import { requireDashboardView } from "@/lib/dashboard-auth";
import { getDailyMetrics } from "@/lib/storage";
import { detectTrafficAnomaly } from "@/lib/anomaly";
import { getLatestSnapshots } from "@/lib/visibility/snapshots";
import { buildAiVisibilityScorecard } from "@/lib/ai-visibility-scorecard";
import { getSearchConsolePerf, getGa4Perf } from "@/lib/analytics";
import { buildMilestone } from "@/lib/milestone";
import { resolveRange, computePeriodStats } from "@/lib/analytics/period";
import { EngagementTracker } from "@/components/dashboard/EngagementTracker";
import { AnalyticsLiveView } from "@/components/dashboard/AnalyticsLiveView";
import { withClientFallbackRoot } from "@/lib/client-fallback";

// Analytics = the LIVE / rolling surface. A range selector (Live · this week ·
// this month · custom) drives every number, all computed live from the daily
// metric series, so the headline can never disagree with the chart or anomaly.
// The written weekly/monthly recaps (the AI narrative) live in Reports, not here.
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenant, clientFallbackRoot } = await requireDashboardView();

  const sp = await searchParams;
  const asStr = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const range = resolveRange(asStr(sp.range), asStr(sp.from), asStr(sp.to));

  // Each read is guarded: this runs in a route render, so an unguarded throw
  // (a Redis/Google blip) would 500 the page. Degrade to safe defaults.
  const [stats, dailyMetrics, snapshots, searchPerf, gaPerf, milestone] = await Promise.all([
    computePeriodStats(tenant, range),
    // The anomaly is a rolling "right now" signal, so it always reads the last
    // 30 days regardless of the selected window.
    getDailyMetrics(tenant, 30).catch(() => []),
    getLatestSnapshots(tenant, 2).catch(() => []),
    getSearchConsolePerf(tenant).catch(() => null),
    getGa4Perf(tenant).catch(() => null),
    buildMilestone(tenant).catch(() => null),
  ]);

  const anomaly = detectTrafficAnomaly(dailyMetrics);
  const aiVisibility = buildAiVisibilityScorecard(snapshots[0] ?? null, snapshots[1] ?? null);
  const connectHref = withClientFallbackRoot(clientFallbackRoot, "/dashboard/integrations");
  const chatHref = withClientFallbackRoot(clientFallbackRoot, "/dashboard/chat");

  return (
    <>
      <EngagementTracker event="report-view" />
      <AnalyticsLiveView
        stats={stats}
        anomaly={anomaly}
        connectHref={connectHref}
        chatHref={chatHref}
        searchPerf={searchPerf}
        gaPerf={gaPerf}
        milestone={milestone}
        visitorSeries={dailyMetrics.map((m) => m.pageViews)}
        aiVisibility={aiVisibility}
      />
    </>
  );
}
