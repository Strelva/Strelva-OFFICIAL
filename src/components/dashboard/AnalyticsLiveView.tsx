import Link from "next/link";
import { TrendingUp, TrendingDown, Users, MousePointerClick, BarChart3 } from "lucide-react";
import { StatTile } from "./StatTile";
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

  return (
    <div className="flex h-full flex-col animate-route-enter">
      <header className="shrink-0 border-b border-glass-border px-4 pb-5 pt-5 sm:px-8 sm:pt-7">
        <div className="max-w-5xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted">Analytics</p>
            <AnalyticsRangeSelector current={stats.range.key} />
          </div>
          <h1 className="max-w-2xl font-display text-[28px] font-medium leading-snug tracking-[-0.01em] text-warm-black sm:text-[32px]">
            {headline}
          </h1>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-8 sm:py-8">
        <div className="max-w-5xl space-y-6">
          {showAnomaly && anomaly && (
            <div
              className={`rounded-xl border p-4 sm:p-5 ${
                anomaly.type === "drop" ? "border-warning/30 bg-warning/10" : "border-success/25 bg-success-dim/40"
              }`}
            >
              <div className="flex items-start gap-2.5">
                {anomaly.type === "drop" ? (
                  <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-warning0" strokeWidth={2} />
                ) : (
                  <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-success" strokeWidth={2} />
                )}
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-warm-black">{anomaly.headline}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-gray-fg">{anomaly.why}</p>
                  <p className="mt-2 text-[13px] leading-relaxed text-gray-fg">
                    <span className="font-medium text-warm-black">Do this:</span> {anomaly.suggestion}
                  </p>
                  <Link
                    href={chatHref}
                    className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-accent transition-colors hover:text-warm-black"
                  >
                    Ask Strelva to handle it &rarr;
                  </Link>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <StatTile
              countUp
              label="People found you"
              value={stats.hasData ? stats.pageViews : "—"}
              delta={stats.hasData ? stats.pageViewsDelta : undefined}
              deltaLabel={stats.range.priorLabel}
              detail={stats.hasData ? "Searches and visits to your site" : "Starts filling in as people find you"}
              icon={<Users className="h-4 w-4" strokeWidth={1.5} />}
            />
            <StatTile
              countUp
              label="Customer actions"
              value={stats.hasData ? stats.actions : "—"}
              delta={stats.hasData ? stats.actionsDelta : undefined}
              deltaLabel={stats.range.priorLabel}
              detail={
                !stats.hasData
                  ? "Booked or called you"
                  : stats.phoneClicks > 0
                    ? `${stats.bookingClicks} clicked to book · ${stats.phoneClicks} called`
                    : "Clicked to book or called you"
              }
              icon={<MousePointerClick className="h-4 w-4" strokeWidth={1.5} />}
            />
          </div>

          {/* Reconcile the "Live" pill with the window name so the chart title
              doesn't read "LAST 7 DAYS" under a "Live" selection. */}
          <TrendChart metrics={stats.series} label={stats.range.key === "live" ? "Live · last 7 days" : stats.range.label} />

          {/* Only when Google IS connected — otherwise the unified connect card
              below already carries the "connect" ask, and this line duplicated it
              outside any card. When connected, this is the honest zero-traffic note. */}
          {!stats.hasData && (searchPerf?.status === "ok" || gaPerf?.status === "ok") && (
            <p className="text-[14px] leading-relaxed text-gray-muted">
              No traffic in this window yet. As more people find you, this fills in.
            </p>
          )}

          {/* Both search performance (GSC) and visitor sources (GA4) run off the
              SAME Google connection. When neither is connected, show ONE unified
              connect card instead of two near-identical "Connect Google" prompts
              stacked; once either has data, show the real panels. */}
          {searchPerf?.status !== "ok" && gaPerf?.status !== "ok" ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-glass-border bg-glass p-8 text-center">
              <div className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-glass-border bg-glass text-accent-text">
                <div
                  aria-hidden
                  className="absolute inset-0 rounded-2xl opacity-60"
                  style={{ background: "radial-gradient(circle at 50% 35%, var(--color-accent-dim), transparent 70%)" }}
                />
                <BarChart3 className="relative h-5 w-5" strokeWidth={1.5} />
              </div>
              <h3 className="font-display text-[19px] leading-tight text-warm-black">
                Connect Google to unlock your analytics
              </h3>
              <p className="mt-2 max-w-md text-[13px] leading-relaxed text-gray-muted">
                One connection powers both your search performance (who finds you on Google) and where
                your visitors come from. Strelva reads it for you — nothing to set up.
              </p>
              <Link
                href={connectHref}
                className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-[13px] font-medium text-on-accent transition-colors hover:bg-accent/85"
              >
                Connect Google
              </Link>
            </div>
          ) : (
            <>
              <SearchAnalyticsPanel search={searchPerf} ga={gaPerf} connectHref={connectHref} />
              <TrafficSourcesPanel ga={gaPerf} connectHref={connectHref} />
            </>
          )}
          {aiVisibility && <AiVisibilityScorecard data={aiVisibility} />}
          {milestone && <MilestonePanel milestone={milestone} visitorSeries={visitorSeries} />}

          <details id="site-health" open className="group scroll-mt-6 rounded-2xl border border-glass-border bg-glass">
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
      </div>
    </div>
  );
}
