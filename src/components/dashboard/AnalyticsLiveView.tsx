import { XaSays, XaTextLink } from "@/components/ui/strelva/Xa";
import { DashNote, DashPage } from "./xa/DashboardXa";
import { TrendChart } from "./TrendChart";
import { AnalyticsRangeSelector } from "./AnalyticsRangeSelector";
import { SearchAnalyticsPanel } from "./SearchAnalyticsPanel";
import { TrafficSourcesPanel } from "./TrafficSourcesPanel";
import { MilestonePanel } from "./MilestonePanel";
import { AiVisibilityScorecard } from "./AiVisibilityScorecard";
import { SiteHealthCard } from "./SiteHealthCard";
import { periodHeadline, type PeriodStats } from "@/lib/analytics/period";
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
  const headline = periodHeadline(stats);
  // The anomaly is a rolling "right now" signal (last 7d vs baseline), so it only
  // belongs on the Live range; a dated window tells its own story via the delta.
  const showAnomaly = stats.range.key === "live" && anomaly;

  const actionsLine = !stats.hasData ? "Bookings and calls show up here as people find you."
    : stats.actions === 0 ? "No one clicked to book or called in these days."
      : `${stats.actions.toLocaleString()} clicked to book or called${stats.phoneClicks > 0 ? ` (${stats.bookingClicks} booked, ${stats.phoneClicks} called)` : ""}${stats.actionsDelta > 0 ? `, up ${stats.range.priorLabel}` : stats.actionsDelta < 0 ? `, down ${stats.range.priorLabel}` : ""}.`;
  const googleConnected = searchPerf?.status === "ok" || gaPerf?.status === "ok";

  return (
    <DashPage title={headline} quiet={actionsLine} actions={<AnalyticsRangeSelector current={stats.range.key} />} label="Visitors">
      {showAnomaly && anomaly ? (
        <DashNote tone={anomaly.type === "drop" ? "waits" : "live"} links={[<XaTextLink key="ask" href={chatHref}>Ask Strelva to handle it</XaTextLink>]}>
          {anomaly.headline} {anomaly.why} {anomaly.suggestion}
        </DashNote>
      ) : null}

      {/* The chart's window name follows the range, so "Live" never sits over "last 7 days". */}
      <TrendChart metrics={stats.series} label={stats.range.key === "live" ? "Last 7 days" : stats.range.label} />

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
