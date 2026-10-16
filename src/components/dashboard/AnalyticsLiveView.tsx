import { XaSays, XaTextLink } from "@/components/ui/strelva/Xa";
import { DashPage } from "./xa/DashboardXa";
import { TrendChart } from "./TrendChart";
import { AnalyticsRangeSelector } from "./AnalyticsRangeSelector";
import { SearchAnalyticsPanel } from "./SearchAnalyticsPanel";
import { TrafficSourcesPanel } from "./TrafficSourcesPanel";
import { MilestonePanel } from "./MilestonePanel";
import { AiVisibilityScorecard } from "./AiVisibilityScorecard";
import { SiteHealthCard } from "./SiteHealthCard";
import type { PeriodStats } from "@/lib/analytics/period";
import type { getSearchConsolePerf, getGa4Perf } from "@/lib/analytics";
import type { buildMilestone } from "@/lib/milestone";
import type { buildAiVisibilityScorecard } from "@/lib/ai-visibility-scorecard";
import type { detectTrafficAnomaly } from "@/lib/anomaly";

type SearchPerf = Awaited<ReturnType<typeof getSearchConsolePerf>> | null;
type GaPerf = Awaited<ReturnType<typeof getGa4Perf>> | null;
type Milestone = ReturnType<typeof buildMilestone> extends Promise<infer T> ? T : never;
type AiViz = ReturnType<typeof buildAiVisibilityScorecard>;
type Anomaly = ReturnType<typeof detectTrafficAnomaly>;

/**
 * The LIVE analytics surface. Every number — the headline verdict, the tiles,
 * the chart — is computed from the selected window (via the range selector), so
 * it can never contradict itself or the anomaly the way the old frozen weekly
 * brief did. The written weekly/monthly recaps live in Reports, not here.
 */
export function AnalyticsLiveView({
  stats,
  anomaly,
  connectHref,
  chatHref,
  searchPerf,
  gaPerf,
  milestone,
  visitorSeries,
  aiVisibility,
}: {
  stats: PeriodStats;
  anomaly: Anomaly;
  connectHref: string;
  chatHref: string;
  searchPerf: SearchPerf;
  gaPerf: GaPerf;
  milestone: Milestone | null;
  /** Stable daily-visitor series for the milestone growth sparkline — kept
   *  separate from the range-driven `stats.series` so it doesn't shift with the
   *  range selector (the "since you started" story is fixed). */
  visitorSeries?: number[];
  aiVisibility: AiViz | null;
}) {
  // One short verdict, then what the headline does not say: calls and bookings.
  const when = stats.range.key === "live" || stats.range.key === "week" ? "this week" : stats.range.key === "month" ? "this month" : "in these days";
  const headline = !stats.hasData ? "No visitors yet." : `${stats.pageViews.toLocaleString()} ${stats.pageViews === 1 ? "person" : "people"} found you ${when}.`;
  // The anomaly is a rolling "right now" signal (last 7d vs baseline), so it only
  // belongs on the rolling range; a dated window tells its own story.
  const showAnomaly = stats.range.key === "live" && anomaly;

  const actionsLine = !stats.hasData ? "Bookings and calls show up here as people find you."
    : stats.actions === 0 ? "No one clicked to book or called."
      : `${stats.bookingClicks.toLocaleString()} clicked to book and ${stats.phoneClicks.toLocaleString()} called.`;
  const googleConnected = searchPerf?.status === "ok" || gaPerf?.status === "ok";

  return (
    <DashPage title={headline} quiet={actionsLine} actions={<AnalyticsRangeSelector current={stats.range.key} />} label="Visitors">
      {showAnomaly && anomaly ? (
        <XaSays links={[<XaTextLink key="ask" href={chatHref}>Ask Strelva to do it</XaTextLink>]}>
          {anomaly.headline} {anomaly.why} {anomaly.suggestion}
        </XaSays>
      ) : null}

      {/* The chart is titled by the same words as the selected range. */}
      <TrendChart metrics={stats.series} label={stats.range.label} />

      {!stats.hasData && googleConnected ? (
        <p className="m-0 text-[15px] text-[var(--st-text-2)]">No visits in these days yet. As more people find you, this fills in.</p>
      ) : null}

      {/* Search (Search Console) and visitor sources (GA4) share one Google connection: one ask when neither is connected. */}
      {!googleConnected ? (
        <XaSays links={[<XaTextLink key="connect" href={connectHref}>Connect Google</XaTextLink>]}>
          Connect Google to see what people search before they find you and where your visitors come from. One connection covers both.
        </XaSays>
      ) : (
        <>
          <SearchAnalyticsPanel search={searchPerf} ga={gaPerf} connectHref={connectHref} />
          <TrafficSourcesPanel ga={gaPerf} connectHref={connectHref} />
        </>
      )}
      {aiVisibility && <AiVisibilityScorecard data={aiVisibility} />}
      {milestone && <MilestonePanel milestone={milestone} visitorSeries={visitorSeries} />}

      <section id="site-health" className="flex scroll-mt-6 flex-col gap-3" aria-labelledby="site-health-label">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="site-health-label" className="m-0 text-[13px] font-medium text-[var(--st-text-3)]">Site health</h2>
          <span className="text-[13px] text-[var(--st-text-3)]">Checked every day: speed, security, search basics, access</span>
        </div>
        <SiteHealthCard />
      </section>
    </DashPage>
  );
}
