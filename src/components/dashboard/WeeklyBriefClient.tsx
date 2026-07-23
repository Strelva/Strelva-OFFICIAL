"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { TrendingUp, TrendingDown, MousePointerClick, Star, FileText, Sparkles, ExternalLink, MessageCircle, ShieldCheck, ArrowUpRight } from "lucide-react";
import type { WeeklyBrief, SearchData } from "@/lib/types";
import { buildVerdict } from "@/lib/weekly-verdict";
import { TrendChart } from "@/components/dashboard/TrendChart";
import type { DailyMetric } from "@/lib/storage";
import type { ProofCard } from "@/lib/proof";
import { metricVerdicts } from "@/lib/proof";
import type { Goal } from "@/lib/goals";
import type { TrafficAnomaly } from "@/lib/anomaly";
import type { CompetitorBenchmark } from "@/lib/competitor-benchmark";
import type { AiVisibilityScorecard as AiVisibilityScorecardData } from "@/lib/ai-visibility-scorecard";
import type { SearchPerf, GaPerf } from "@/lib/analytics";
import { useDashboardOptional } from "./DashboardContext";
import { GoalCard } from "./GoalCard";
import { SearchAnalyticsPanel } from "./SearchAnalyticsPanel";
import { AiVisibilityScorecard } from "./AiVisibilityScorecard";
import { StatTile } from "./StatTile";

interface WeeklyBriefClientProps {
  brief: WeeklyBrief | null;
  history?: WeeklyBrief[];
  dailyMetrics?: DailyMetric[];
  proofCards?: ProofCard[];
  goal?: Goal | null;
  anomaly?: TrafficAnomaly | null;
  benchmark?: CompetitorBenchmark | null;
  /** "You in AI answers" scorecard — the AI-search visibility wedge, owner-facing. */
  aiVisibility?: AiVisibilityScorecardData | null;
  searchData?: SearchData | null;
  /** Live Search Console performance for this tenant. */
  searchPerf?: SearchPerf | null;
  /** Live GA4 performance for this tenant. */
  gaPerf?: GaPerf | null;
  /** Where the Search & Analytics panel's Connect Google CTA points. */
  analyticsConnectHref?: string;
  /** Extra content rendered at the bottom of the report scroll (e.g. the site-health
   *  section on the merged Analytics surface), so every number stays in one scroll. */
  footerSlot?: ReactNode;
  /** "this week" (default) or "this month" — labels the period on the tiles so
   *  this same component renders the weekly brief and the monthly recap. */
  periodLabel?: string;
  /** The trend-chart caption (default "Last 30 days"); the monthly recap passes
   *  the calendar month so the chart matches its window. */
  chartLabel?: string;
}

/** "#3" / "map pack" / "not ranked" — a compact rank pill. */
function rankLabel(rank: number | null, inPack: boolean): string {
  if (rank !== null) return `#${rank}`;
  if (inPack) return "map pack";
  return "not ranked";
}

function formatWeekRange(start: string, end: string): string {
  const startDate = new Date(start + "T00:00:00");
  const endDate = new Date(end + "T00:00:00");
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${startDate.toLocaleDateString("en-US", options)} - ${endDate.toLocaleDateString("en-US", options)}`;
}

export function WeeklyBriefClient({ brief, history = [], dailyMetrics = [], proofCards = [], goal = null, anomaly = null, benchmark = null, aiVisibility = null, searchData = null, searchPerf = null, gaPerf = null, analyticsConnectHref, footerSlot, periodLabel = "this week", chartLabel }: WeeklyBriefClientProps) {
  const dashboard = useDashboardOptional();
  const connectHref =
    analyticsConnectHref || dashboard?.dashboardHref("/dashboard/integrations") || "/dashboard/integrations";

  if (!brief) {
    return (
      <div className="h-full overflow-y-auto animate-route-enter px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto w-full max-w-5xl">
          <div className="mb-5 max-w-2xl">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted mb-2">
              Your weekly report
            </p>
            <h1 className="font-display text-[28px] sm:text-[32px] font-medium text-warm-black tracking-[-0.02em]">
              Your first weekly report is still warming up
            </h1>
            <p className="text-[14px] sm:text-[15px] text-gray-muted mt-3 leading-relaxed">
              The Today view already shows the short version. Your first full report lands at the end of your first week, then a fresh one arrives every week. It builds once there is enough visitor, click, and site-change activity for a real summary.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl dashboard-panel p-4">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-dim text-accent">
                <TrendingUp className="h-4 w-4" strokeWidth={1.5} />
              </div>
              <h2 className="text-[14px] font-medium text-warm-black">See what&apos;s working</h2>
              <p className="mt-1 text-[12px] leading-relaxed text-gray-fg">
                Weekly reports turn visits, clicks, reviews, and updates into plain English.
              </p>
            </div>
            <div className="rounded-xl dashboard-panel p-4">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-dim text-accent">
                <MessageCircle className="h-4 w-4" strokeWidth={1.5} />
              </div>
              <h2 className="text-[14px] font-medium text-warm-black">Tell Strelva what to change</h2>
              <p className="mt-1 text-[12px] leading-relaxed text-gray-fg">
                Ask for a small update, like new hours, a service tweak, or a timely announcement.
              </p>
            </div>
            <div className="rounded-xl dashboard-panel p-4">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-dim text-accent">
                <ShieldCheck className="h-4 w-4" strokeWidth={1.5} />
              </div>
              <h2 className="text-[14px] font-medium text-warm-black">Stay in control</h2>
              <p className="mt-1 text-[12px] leading-relaxed text-gray-fg">
                When something needs your review, it opens in Needs You from Ask Strelva before it goes live.
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href={dashboard?.dashboardHref("/dashboard") || "/dashboard"}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-accent px-5 text-[13px] font-medium text-on-accent transition-colors hover:bg-accent/85"
            >
              <TrendingUp className="h-4 w-4" strokeWidth={1.5} />
              Open dashboard
            </Link>
            <Link
              href={dashboard?.dashboardHref("/dashboard/chat") || "/dashboard/chat"}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-glass-border bg-glass px-5 text-[13px] font-medium text-warm-black transition-colors hover:bg-gray-bg"
            >
              <MessageCircle className="h-4 w-4" strokeWidth={1.5} />
              Ask Strelva for a small change
            </Link>
            <a
              href={dashboard?.siteUrl || dashboard?.dashboardHref("/dashboard/site") || "/dashboard/site"}
              target={dashboard?.siteUrl ? "_blank" : undefined}
              rel={dashboard?.siteUrl ? "noopener noreferrer" : undefined}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-glass-border bg-glass px-5 text-[13px] font-medium text-warm-black transition-colors hover:bg-gray-bg"
            >
              <ExternalLink className="h-4 w-4" strokeWidth={1.5} />
              View your live site
            </a>
          </div>

          {/* Reports gets richer once Google is connected — but the connect ask
              itself lives on Analytics / Google Business (one canonical place), so
              here we only nudge quietly instead of restacking the same connect card.
              Once Google IS connected, show the real search panel. */}
          {searchPerf?.status === "ok" || gaPerf?.status === "ok" ? (
            <div className="mt-8">
              <SearchAnalyticsPanel search={searchPerf} ga={gaPerf} connectHref={connectHref} />
            </div>
          ) : (
            <Link
              href={connectHref}
              className="mt-8 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent transition-colors hover:text-warm-black"
            >
              Connect Google to make your reports richer &rarr;
            </Link>
          )}
          {aiVisibility && (
            <div className="mt-8">
              <AiVisibilityScorecard data={aiVisibility} />
            </div>
          )}
          {footerSlot && <div className="mt-8">{footerSlot}</div>}
        </div>
      </div>
    );
  }

  const topServices = brief.topServices ?? [];
  const topSearchQueries = brief.topSearchQueries ?? [];
  const staleSections = brief.staleSections ?? [];
  const verdicts = metricVerdicts(brief.stats);

  // Full Search Console query list — the exact phrases people typed to find the
  // site. Sorted by clicks, capped so the table stays scannable. When empty we
  // fall back to the single Search Signal tile below.
  const searchRows = [...(searchData?.queries ?? [])]
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, 15);

  return (
    <div className="flex flex-col h-full animate-route-enter">
      <header className="shrink-0 px-4 sm:px-8 pt-5 sm:pt-7 pb-5 border-b border-glass-border">
        <div className="max-w-5xl">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted mb-2">
            {formatWeekRange(brief.weekStart, brief.weekEnd)}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="max-w-xl font-display text-[28px] font-medium leading-snug text-warm-black tracking-[-0.01em] sm:text-[32px]">
                {buildVerdict(
                  brief.stats,
                  periodLabel === "this month" ? { periodNoun: "month", priorPhrase: "from last month" } : undefined
                )}
              </h1>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-glass-border bg-glass px-3 py-1.5 text-[12px] text-gray-fg">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Managed
            </span>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-5 sm:py-8">
        <div className="max-w-5xl space-y-6">
          {/* Anomaly heads-up — a meaningful break in the traffic trend, with a why + a fix */}
          {anomaly && (
            <div
              className={`rounded-xl border p-4 sm:p-5 animate-fade-in-up ${
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
                    href={dashboard?.dashboardHref("/dashboard/chat") || "/dashboard/chat"}
                    className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-accent transition-colors hover:text-warm-black"
                  >
                    Ask Strelva to handle it &rarr;
                  </Link>
                </div>
              </div>
            </div>
          )}

          <div
            className="max-w-3xl text-[16px] text-gray-fg leading-relaxed animate-fade-in-up"
            style={{ animationDelay: "50ms" }}
          >
            {brief.summary}
          </div>

          {dailyMetrics.length >= 2 && (
            <div className="animate-fade-in-up" style={{ animationDelay: "75ms" }}>
              <TrendChart metrics={dailyMetrics} label={chartLabel} />
            </div>
          )}

          <div
            className="grid grid-cols-2 xl:grid-cols-4 gap-3 animate-fade-in-up"
            style={{ animationDelay: "100ms" }}
          >
            <StatTile
              countUp
              label={`People found you ${periodLabel}`}
              value={brief.stats.pageViews}
              delta={brief.stats.pageViewsDelta ?? 0}
              deltaLabel={periodLabel === "this month" ? "vs last month" : "vs last week"}
              icon={<TrendingUp className="h-4 w-4" strokeWidth={1.5} />}
            />
            <StatTile
              countUp
              label="Customer actions"
              value={brief.stats.bookingClicks + (brief.stats.phoneClicks ?? 0)}
              delta={(brief.stats.bookingClicksDelta ?? 0) + (brief.stats.phoneClicksDelta ?? 0)}
              deltaLabel={periodLabel === "this month" ? "vs last month" : "vs last week"}
              detail={(brief.stats.phoneClicks ?? 0) > 0 ? "Booked or called you" : undefined}
              icon={<MousePointerClick className="h-4 w-4" strokeWidth={1.5} />}
            />
            <StatTile
              countUp
              label="Reviews"
              value={brief.stats.reviewsReceived}
              icon={<Star className="h-4 w-4" strokeWidth={1.5} />}
            />
            <StatTile
              countUp
              label="Site updates"
              value={brief.stats.contentUpdates}
              icon={<FileText className="h-4 w-4" strokeWidth={1.5} />}
            />
          </div>

          {/* What this means — the verdict on each number, in plain English */}
          <div className="space-y-2 animate-fade-in-up" style={{ animationDelay: "108ms" }}>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-muted">
              What this means
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {verdicts.map((v, i) => (
                <div key={`${v.key}-${i}`} className="rounded-xl border border-glass-border bg-glass p-4">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        v.tone === "good" ? "bg-success" : v.tone === "attention" ? "bg-warning" : "bg-gray-faint"
                      }`}
                    />
                    <p className="text-[12px] font-medium text-warm-black">{v.label}</p>
                  </div>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-gray-fg">{v.verdict}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Live Search Console + GA4 for this tenant — what Google shows about
              how people find and move through the site. */}
          <div className="animate-fade-in-up" style={{ animationDelay: "112ms" }}>
            <SearchAnalyticsPanel search={searchPerf} ga={gaPerf} connectHref={connectHref} />
          </div>

          {/* Weekly goal + progress */}
          <div className="animate-fade-in-up" style={{ animationDelay: "118ms" }}>
            <GoalCard goal={goal} stats={brief.stats} />
          </div>

          {/* Before/after proof — site changes that moved the needle */}
          {proofCards.length > 0 && (
            <div className="space-y-2 animate-fade-in-up" style={{ animationDelay: "128ms" }}>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-muted">
                Proof it&apos;s working
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {proofCards.map((c, i) => (
                  <div key={`${c.changedAt}-${i}`} className="rounded-xl border border-success/25 bg-success-dim/40 p-4">
                    <div className="flex items-center gap-2">
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-success" strokeWidth={2} />
                      <p className="text-[14px] font-semibold text-warm-black">{c.headline}</p>
                    </div>
                    <p className="mt-2 text-[12px] text-gray-muted">
                      {c.beforeAvg} &rarr; {c.afterAvg} visitors/day on average
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* You in AI answers — the AI-search visibility wedge, owner-facing */}
          {aiVisibility && (
            <div className="animate-fade-in-up" style={{ animationDelay: "134ms" }}>
              <AiVisibilityScorecard data={aiVisibility} />
            </div>
          )}

          {/* Where you rank vs competitors, from the latest visibility scan */}
          {benchmark && (
            <div className="space-y-2 animate-fade-in-up" style={{ animationDelay: "138ms" }}>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-muted">
                Where you rank
              </p>
              <div className="rounded-xl border border-glass-border bg-glass p-4 sm:p-5">
                <p className="text-[14px] font-medium text-warm-black">{benchmark.headline}</p>
                <div className="mt-4 space-y-3.5">
                  {benchmark.rows.map((row, i) => (
                    <div key={`${row.query}-${i}`} className="border-t border-glass-border pt-3 first:border-t-0 first:pt-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-[13px] font-medium text-warm-black">&ldquo;{row.query}&rdquo;</p>
                        <span
                          className={`shrink-0 text-[11px] font-semibold uppercase tracking-[0.06em] ${
                            row.youLead ? "text-success" : "text-warning0"
                          }`}
                        >
                          {row.youLead ? "You lead" : "Behind"}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-dim px-2.5 py-1 text-[11px] font-medium text-warm-black">
                          You <span className="text-accent">{rankLabel(row.yourRank, row.yourInPack)}</span>
                        </span>
                        {row.competitors.map((c, i) => (
                          <span
                            key={`${c.name}-${i}`}
                            className="inline-flex items-center gap-1.5 rounded-full border border-gray-border px-2.5 py-1 text-[11px] text-gray-muted"
                          >
                            <span className="max-w-[120px] truncate text-warm-black">{c.name}</span>
                            <span>{rankLabel(c.rank, c.inPack)}</span>
                          </span>
                        ))}
                      </div>
                      {row.aiAnswerMentioned !== null && (
                        <p className="mt-2 text-[12px] leading-relaxed text-gray-muted">
                          When people ask AI for this:{" "}
                          {row.aiAnswerMentioned ? (
                            <span className="font-medium text-success">you get named</span>
                          ) : (
                            <span className="text-warm-black">you&apos;re not named yet</span>
                          )}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* What people search to find you — the full Search Console query list */}
          {searchRows.length > 0 && (
            <div className="space-y-2 animate-fade-in-up" style={{ animationDelay: "142ms" }}>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-muted">
                What people search to find you
              </p>
              <div className="overflow-hidden rounded-xl border border-glass-border bg-glass">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-glass-border text-[11px] uppercase tracking-wide text-gray-muted">
                      <th scope="col" className="px-4 py-2.5 font-medium">Search</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">Visits</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">Times shown</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchRows.map((q, i) => (
                      <tr key={`${q.query}-${i}`} className="border-t border-glass-border first:border-t-0">
                        <td className="px-4 py-2.5 text-warm-black">{q.query}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-fg">{q.clicks.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-fg">{q.impressions.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[12px] leading-relaxed text-gray-muted">
                The exact phrases people typed into Google before they landed on your site. Visits are the times they clicked through.
              </p>
            </div>
          )}

          {brief.nextAction && (
            <div
              className="rounded-xl border border-accent/20 bg-accent-dim/40 p-4 sm:p-5 animate-fade-in-up"
              style={{ animationDelay: "125ms" }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-accent" strokeWidth={1.5} />
                <h2 className="text-[12px] font-medium text-accent uppercase tracking-wide">
                  This week I&apos;d suggest
                </h2>
              </div>
              <p className="text-[14px] font-medium text-warm-black">
                {brief.nextAction.title}
              </p>
              <p className="text-[13px] text-gray-fg mt-1">
                {brief.nextAction.description}
              </p>
            </div>
          )}

          {(topServices.length > 0 || topSearchQueries.length > 0 || staleSections.length > 0) && (
            <div
              className="grid gap-3 md:grid-cols-3 animate-fade-in-up"
              style={{ animationDelay: "140ms" }}
            >
              {topServices[0] && (
                <div className="rounded-xl border border-glass-border bg-glass p-4">
                  <p className="text-[11px] font-medium text-gray-muted uppercase tracking-wide">
                    Top Service
                  </p>
                  <p className="text-[14px] font-medium text-warm-black mt-2">
                    {topServices[0].name}
                  </p>
                  <p className="text-[12px] text-gray-muted mt-1">
                    {topServices[0].clicks} clicks {periodLabel}
                  </p>
                </div>
              )}
              {searchRows.length === 0 && topSearchQueries[0] && (
                <div className="rounded-xl border border-glass-border bg-glass p-4">
                  <p className="text-[11px] font-medium text-gray-muted uppercase tracking-wide">
                    Search Signal
                  </p>
                  <p className="text-[14px] font-medium text-warm-black mt-2">
                    {topSearchQueries[0].query}
                  </p>
                  <p className="text-[12px] text-gray-muted mt-1">
                    {topSearchQueries[0].clicks} clicks from search
                  </p>
                </div>
              )}
              {staleSections[0] && (
                <div className="rounded-xl border border-glass-border bg-glass p-4">
                  <p className="text-[11px] font-medium text-gray-muted uppercase tracking-wide">
                    Could use a refresh
                  </p>
                  <p className="text-[14px] font-medium text-warm-black mt-2 capitalize">
                    {staleSections[0].section}
                  </p>
                  <p className="text-[12px] text-gray-muted mt-1">
                    {staleSections[0].daysSinceUpdate} days since update
                  </p>
                </div>
              )}
            </div>
          )}

          {brief.highlights.length > 0 && (
            <div
              className="animate-fade-in-up"
              style={{ animationDelay: "150ms" }}
            >
              <h2 className="text-[13px] font-medium text-gray-muted uppercase tracking-wide mb-3">
                Highlights
              </h2>
              <ul className="grid gap-2 md:grid-cols-2">
                {brief.highlights.map((highlight, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 rounded-lg border border-glass-border bg-glass px-3 py-2.5 text-[13px] text-gray-fg"
                  >
                    <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-accent mt-1.5" />
                    {highlight}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {history.length > 1 && (
            <div
              className="animate-fade-in-up"
              style={{ animationDelay: "200ms" }}
            >
              <h2 className="text-[13px] font-medium text-gray-muted uppercase tracking-wide mb-3">
                Brief History
              </h2>
              <div className="space-y-2">
                {history.slice(1).map((item, i) => (
                  <details
                    key={`${item.id}-${i}`}
                    className="rounded-xl border border-glass-border bg-surface-raised px-4 py-3"
                  >
                    <summary className="cursor-pointer text-[13px] font-medium text-warm-black">
                      {formatWeekRange(item.weekStart, item.weekEnd)}
                    </summary>
                    <p className="text-[13px] text-gray-fg mt-3 leading-relaxed">
                      {item.summary}
                    </p>
                  </details>
                ))}
              </div>
            </div>
          )}

          {footerSlot && <div>{footerSlot}</div>}
        </div>
      </div>
    </div>
  );
}
