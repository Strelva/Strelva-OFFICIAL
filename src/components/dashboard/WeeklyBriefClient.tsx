"use client";

import type { ReactNode } from "react";
import { XaAnswers, XaEmpty, XaRow, XaRows, XaSays, XaTextLink } from "@/components/ui/strelva/Xa";
import { DashPage, DashSection } from "./xa/DashboardXa";
import type { WeeklyBrief, SearchData } from "@/lib/types";
import { buildVerdict } from "@/lib/weekly-verdict";
import { TrendChart } from "@/components/dashboard/TrendChart";
import type { DailyMetric } from "@/lib/storage";
import type { ProofCard } from "@/lib/proof";
import type { Goal } from "@/lib/goals";
import type { TrafficAnomaly } from "@/lib/anomaly";
import type { CompetitorBenchmark } from "@/lib/competitor-benchmark";
import type { AiVisibilityScorecard as AiVisibilityScorecardData } from "@/lib/ai-visibility-scorecard";
import type { SearchPerf, GaPerf } from "@/lib/analytics";
import { useDashboardOptional } from "./DashboardContext";
import { GoalCard } from "./GoalCard";
import { SearchAnalyticsPanel } from "./SearchAnalyticsPanel";
import { AiVisibilityScorecard } from "./AiVisibilityScorecard";

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
  /** Weekly/Monthly switch, shown beside the headline when a monthly recap exists. */
  viewToggle?: ReactNode;
}

/** "#3" / "map pack" / "not ranked" — a compact rank pill. */
function rankLabel(rank: number | null, inPack: boolean): string {
  if (rank !== null) return `spot ${rank}`;
  if (inPack) return "in the map results";
  return "not in the results";
}

function formatWeekRange(start: string, end: string): string {
  const startDate = new Date(start + "T00:00:00");
  const endDate = new Date(end + "T00:00:00");
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${startDate.toLocaleDateString("en-US", options)} to ${endDate.toLocaleDateString("en-US", options)}`;
}

export function WeeklyBriefClient({ brief, history = [], dailyMetrics = [], proofCards = [], goal = null, anomaly = null, benchmark = null, aiVisibility = null, searchData = null, searchPerf = null, gaPerf = null, analyticsConnectHref, footerSlot, periodLabel = "this week", chartLabel, viewToggle }: WeeklyBriefClientProps) {
  const dashboard = useDashboardOptional();
  const connectHref =
    analyticsConnectHref || dashboard?.dashboardHref("/dashboard/integrations") || "/dashboard/integrations";
  const chatHref = dashboard?.dashboardHref("/dashboard/chat") || "/dashboard/chat";
  const googleConnected = searchPerf?.status === "ok" || gaPerf?.status === "ok";

  if (!brief) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="flex flex-col gap-10 px-4 pb-28 pt-8 md:px-[88px] md:pt-16">
          <XaEmpty pose="resting" title="Your first recap is on its way." job="Collecting this week's visits, bookings and changes"
            action={<XaTextLink href={chatHref}>Ask Strelva for a small change meanwhile</XaTextLink>}>
            It lands at the end of your first full week, here and by email: who found you, what they did, and what changed on your site.
          </XaEmpty>
          <div className="flex max-w-[880px] flex-col gap-10">
            {googleConnected ? <SearchAnalyticsPanel search={searchPerf} ga={gaPerf} connectHref={connectHref} />
              : <XaSays links={[<XaTextLink key="connect" href={connectHref}>Connect Google</XaTextLink>]}>Connect Google and your recaps also show what people searched to find you.</XaSays>}
            {aiVisibility ? <AiVisibilityScorecard data={aiVisibility} /> : null}
            {footerSlot ?? null}
          </div>
        </div>
      </div>
    );
  }

  const topServices = brief.topServices ?? [];
  const topSearchQueries = brief.topSearchQueries ?? [];
  const staleSections = brief.staleSections ?? [];

  // Full Search Console query list, sorted by clicks, capped so it stays scannable.
  const searchRows = [...(searchData?.queries ?? [])]
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, 15);

  return (
    <DashPage
      title={buildVerdict(brief.stats, periodLabel === "this month" ? { periodNoun: "month", priorPhrase: "from last month" } : undefined)}
      quiet={`${formatWeekRange(brief.weekStart, brief.weekEnd)}, written by Strelva.`}
      actions={viewToggle}
      label="Recap"
    >
      {anomaly ? (
        <XaSays links={[<XaTextLink key="ask" href={chatHref}>Ask Strelva to do it</XaTextLink>]}>
          {anomaly.headline} {anomaly.why} {anomaly.suggestion}
        </XaSays>
      ) : null}

      <p className="m-0 max-w-[680px] text-[17px] leading-[1.6] text-[var(--st-text-body)]">{brief.summary}</p>

      {dailyMetrics.length >= 2 ? <TrendChart metrics={dailyMetrics} label={chartLabel} /> : null}

      {brief.nextAction ? (
        <XaSays links={[<XaTextLink key="ask" href={chatHref}>Ask Strelva to do it</XaTextLink>]}>This week I&apos;d suggest: {brief.nextAction.title.replace(/\.$/, "")}. {brief.nextAction.description}</XaSays>
      ) : null}

      <SearchAnalyticsPanel search={searchPerf} ga={gaPerf} connectHref={connectHref} />

      <GoalCard goal={goal} stats={brief.stats} />

      {proofCards.length > 0 ? (
        <DashSection label="Proof it's working">
          <XaRows label="Proof it's working">
            {proofCards.map((c, i) => <XaRow key={`${c.changedAt}-${i}`} title={c.headline} detail={`${c.beforeAvg} to ${c.afterAvg} visitors a day on average`} />)}
          </XaRows>
        </DashSection>
      ) : null}

      {aiVisibility ? <AiVisibilityScorecard data={aiVisibility} /> : null}

      {benchmark ? (
        <DashSection label="Where you rank">
          <p className="m-0 text-[15px] text-[var(--st-text)]">{benchmark.headline}</p>
          <XaRows label="Where you rank">
            {benchmark.rows.map((row, i) => (
              <XaRow key={`${row.query}-${i}`} title={<>&ldquo;{row.query}&rdquo;</>}
                detail={`You: ${rankLabel(row.yourRank, row.yourInPack)}${row.competitors.length ? ` · ${row.competitors.map((c) => `${c.name}: ${rankLabel(c.rank, c.inPack)}`).join(" · ")}` : ""}${row.aiAnswerMentioned === null ? "" : row.aiAnswerMentioned ? " · AI answers name you" : " · AI answers don't name you yet"}`}
                tone={row.youLead ? undefined : "waits"}
                meta={row.youLead ? "You lead" : "Behind"} />
            ))}
          </XaRows>
        </DashSection>
      ) : null}

      {searchRows.length > 0 ? (
        <DashSection label="What people searched before they found you">
          <XaRows label="What people searched">
            {searchRows.map((q, i) => <XaRow key={`${q.query}-${i}`} title={q.query} detail={`Shown ${q.impressions.toLocaleString()} times`} meta={`${q.clicks.toLocaleString()} ${q.clicks === 1 ? "visit" : "visits"}`} />)}
          </XaRows>
        </DashSection>
      ) : null}

      {topServices[0] || (searchRows.length === 0 && topSearchQueries[0]) || staleSections[0] ? (
        <DashSection label="Also worth knowing">
          <XaAnswers labelWidth={180} rows={[
            ...(topServices[0] ? [["Most-clicked service", `${topServices[0].name}, ${topServices[0].clicks} clicks ${periodLabel}`] as const] : []),
            ...(searchRows.length === 0 && topSearchQueries[0] ? [["Top search", `${topSearchQueries[0].query}, ${topSearchQueries[0].clicks} clicks`] as const] : []),
            ...(staleSections[0] ? [["Could use a refresh", `${staleSections[0].section.charAt(0).toUpperCase()}${staleSections[0].section.slice(1)}, unchanged for ${staleSections[0].daysSinceUpdate} days`] as const] : []),
          ]} />
        </DashSection>
      ) : null}

      {brief.highlights.length > 0 ? (
        <DashSection label="Highlights">
          <ul className="m-0 flex max-w-[680px] list-none flex-col gap-2 p-0">
            {brief.highlights.map((highlight, i) => <li key={i} className="text-[15px] leading-[1.5] text-[var(--st-text-body)]">{highlight}</li>)}
          </ul>
        </DashSection>
      ) : null}

      {history.length > 1 ? (
        <DashSection label="Earlier recaps">
          <div className="flex flex-col">
            {history.slice(1).map((item, i) => (
              <details key={`${item.id}-${i}`} className="group border-t border-[var(--st-line)] py-3 first:border-t-0">
                <summary className="cursor-pointer list-none text-[15px] font-medium text-[var(--st-text)] outline-none focus-visible:underline">
                  {formatWeekRange(item.weekStart, item.weekEnd)}
                  <span className="ml-2 text-[13px] font-normal text-[var(--st-text-3)] group-open:hidden">Read</span>
                </summary>
                <p className="m-0 mt-2 max-w-[680px] text-[15px] leading-[1.55] text-[var(--st-text-body)]">{item.summary}</p>
              </details>
            ))}
          </div>
        </DashSection>
      ) : null}

      {footerSlot ? <div>{footerSlot}</div> : null}
    </DashPage>
  );
}
