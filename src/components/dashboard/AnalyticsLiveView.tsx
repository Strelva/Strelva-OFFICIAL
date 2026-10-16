import { XaSays, XaTextLink } from "@/components/ui/strelva/Xa";
import { DashPage } from "./xa/DashboardXa";
import { AnalyticsRangeSelector } from "./AnalyticsRangeSelector";
import { SearchAnalyticsPanel } from "./SearchAnalyticsPanel";
import { TrafficSourcesPanel } from "./TrafficSourcesPanel";
import { MilestonePanel } from "./MilestonePanel";
import { AiVisibilityScorecard } from "./AiVisibilityScorecard";
import { SiteHealthCard } from "./SiteHealthCard";
import type { PeriodStats } from "@/lib/analytics/period";
import type { DailyMetric } from "@/lib/storage/analytics-store";
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
 * The trend, inline in the sentence (October 16): a small line the height of
 * the text, never a chart card. The numbers live in the words around it; this
 * only shows the shape. Screen readers get the shape in words.
 */
export function InlineSpark({ series }: { series: readonly DailyMetric[] }) {
  const values = series.map((day) => day.pageViews);
  if (values.length < 2) return null;
  const width = 64, height = 16, max = Math.max(...values), min = Math.min(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => `${((index / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ((value - min) / span) * (height - 4)).toFixed(1)}`).join(" ");
  const peak = series[values.indexOf(max)];
  const peakDay = peak ? new Date(`${peak.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
  return <svg role="img" aria-label={`Visits by day, most on ${peakDay}: ${max.toLocaleString()}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="mx-1 inline-block align-[-2px]">
    <polyline points={points} fill="none" stroke="var(--st-accent)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

/**
 * The LIVE analytics surface. Every number is computed from the selected
 * window (via the range selector), so it can never contradict itself or the
 * anomaly. October 16: no hero number and no chart card. The page names
 * itself; Pebble says what happened, with the trend inline in the sentence,
 * and what to do next. The written recaps live in Recaps, not here.
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
  const when = stats.range.key === "live" || stats.range.key === "week" ? "this week" : stats.range.key === "month" ? "this month" : "in these days";
  // The anomaly is a rolling "right now" signal (last 7d vs baseline), so it only
  // belongs on the rolling range; a dated window tells its own story.
  const showAnomaly = stats.range.key === "live" && anomaly;
  const googleConnected = searchPerf?.status === "ok" || gaPerf?.status === "ok";
  const people = `${stats.pageViews.toLocaleString()} ${stats.pageViews === 1 ? "person" : "people"}`;
  const change = stats.pageViewsPrior > 0 && stats.pageViewsDelta !== 0
    ? `, ${stats.pageViewsDelta > 0 ? "up" : "down"} from ${stats.pageViewsPrior.toLocaleString()} before`
    : "";
  const actions = stats.actions === 0 ? "No one clicked to book or called yet."
    : `${stats.bookingClicks.toLocaleString()} clicked to book and ${stats.phoneClicks.toLocaleString()} called.`;

  return (
    <DashPage title="Visits." actions={<AnalyticsRangeSelector current={stats.range.key} />} label="Visitors">
      {!stats.hasData ? (
        // Empty: one sentence and the one thing to do. No zero, no card.
        googleConnected
          ? <XaSays>No one has visited {when} yet. As people find you, Strelva says who came and what they did.</XaSays>
          : <XaSays links={[<XaTextLink key="connect" href={connectHref}>Connect Google</XaTextLink>]}>No one has visited {when} yet. Connect Google and Strelva can also show what people search before they find you.</XaSays>
      ) : (
        <XaSays links={showAnomaly && anomaly ? [<XaTextLink key="ask" href={chatHref}>Ask Strelva to do it</XaTextLink>] : undefined}>
          {people} found you {when}<InlineSpark series={stats.series} />{change}. {actions}{showAnomaly && anomaly ? <> {anomaly.why} {anomaly.suggestion}</> : null}
        </XaSays>
      )}

      {/* Search (Search Console) and visitor sources (GA4) share one Google connection. */}
      {stats.hasData && !googleConnected ? (
        <XaSays links={[<XaTextLink key="connect" href={connectHref}>Connect Google</XaTextLink>]}>
          Connect Google to see what people search before they find you and where your visitors come from. One connection covers both.
        </XaSays>
      ) : googleConnected ? (
        <>
          <SearchAnalyticsPanel search={searchPerf} ga={gaPerf} connectHref={connectHref} />
          <TrafficSourcesPanel ga={gaPerf} connectHref={connectHref} />
        </>
      ) : null}
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
