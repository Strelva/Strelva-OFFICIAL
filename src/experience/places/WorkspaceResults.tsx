import { StCopy, StEmpty, StHead, StMono, StNotice, StPage, StPillLink, StRow, StRows, StSection, StSkeleton, StSplit, StState, StTable, StTextButton } from "@/components/ui/strelva/Kit";
import type { RangeKey } from "@/lib/analytics/period";
import type { SiteResults, WorkspaceResults } from "@/products/websites/client";
import { placeHomeHref, whenLabel, type PlaceState } from "./WorkspacePlace";
import { ResultsRetry } from "./ResultsRetry";
import styles from "./workspace-results.module.css";

/** Presentation only: all counts keep their selected window and original source. */
const RANGES: Array<{ key: Exclude<RangeKey, "custom">; label: string }> = [
  { key: "live", label: "Live" }, { key: "week", label: "This week" }, { key: "month", label: "This month" },
];

export function resultsHref(workspaceId: string, range: RangeKey = "live", window?: { from: string; to: string }): string {
  const params = new URLSearchParams({ workspaceId });
  if (range !== "live") params.set("range", range);
  if (range === "custom" && window) { params.set("from", window.from); params.set("to", window.to); }
  return `/workspace/results?${params}`;
}

const count = (value: number) => value.toLocaleString("en-US");
function change(value: number, priorLabel: string): string {
  return value === 0 ? `Unchanged ${priorLabel}` : `${value > 0 ? "Up" : "Down"} ${count(Math.abs(value))} ${priorLabel}`;
}

function SiteHealth({ site }: { site: SiteResults }) {
  const health = site.health;
  return <StSection title="Site health" id="site-health">
    {!health ? <StEmpty><StState kind="draft">Not checked yet</StState><StCopy>Strelva hasn&apos;t finished a check of {site.siteName} yet. The daily check covers speed, security, search and accessibility.</StCopy></StEmpty> : <>
      <StRows><StRow title={<StState kind={health.prioritizedIssues?.length ? "need" : "live"}>{health.prioritizedIssues?.length ? "Issues recorded" : "Nothing needs fixing from the latest check"}</StState>} detail={<>Grade <StMono>{health.grade}</StMono> · <StMono>{Math.round(health.overallScore)}</StMono> out of 100 · checked {whenLabel(health.scannedAt)}</>} />
        {health.prioritizedIssues?.slice(0, 5).map((issue, index) => <StRow key={index} title={issue.message} />)}
      </StRows>
    </>}
  </StSection>;
}

function VisitTrend({ site }: { site: SiteResults }) {
  const stats = site.stats;
  if (!stats) return <StNotice tone="critical">Visits for {site.siteName} couldn&apos;t be read right now. Nothing is lost; counting continues.</StNotice>;
  const series = stats.series;
  const max = Math.max(1, ...series.map(day => day.pageViews));
  return <StSection title="Visits" meta={stats.range.label}>
    <StRows label="Site visits and clicks">
      <StRow lead={<StMono size="value">{stats.hasData ? count(stats.pageViews) : "—"}</StMono>} title="Visits to your site" detail={stats.hasData ? change(stats.pageViewsDelta, stats.range.priorLabel) : "Starts filling in as people find you"} stackOnPhone={false} />
      <StRow lead={<StMono size="value">{stats.hasData ? count(stats.actions) : "—"}</StMono>} title="Booking-link and phone-link clicks" detail={stats.hasData ? `${count(stats.bookingClicks)} clicked to book · ${count(stats.phoneClicks)} clicked to call · ${change(stats.actionsDelta, stats.range.priorLabel)}` : "No clicks recorded in this window yet"} stackOnPhone={false} />
    </StRows>
    {series.length > 1 && stats.pageViews >= 5 ? <>
      <div className={styles.chart} role="img" aria-label={`Daily visits for ${stats.range.label}: ${series.map(day => `${day.date}: ${day.pageViews}`).join(", ")}`}>
        {series.map(day => <div key={day.date} className={styles.bar} style={{ height: `${day.pageViews / max * 100}%` }} title={`${day.date}: ${count(day.pageViews)} visits`} />)}
      </div>
      <div className={styles.chartLabels}><StMono>{series[0]?.date}</StMono><StMono>{series[series.length - 1]?.date}</StMono></div>
    </> : <StEmpty>Not enough traffic yet to chart. This fills in as more people find you.</StEmpty>}
    <StCopy muted>Visits can include repeat visits. A click doesn&apos;t confirm a booking or an answered call.</StCopy>
    {stats.range.key === "live" && site.anomaly ? <StNotice tone="need"><strong>{site.anomaly.headline}</strong><StCopy>{site.anomaly.why}</StCopy><StCopy>{site.anomaly.suggestion}</StCopy></StNotice> : null}
  </StSection>;
}

function SearchResults({ site, connectHref }: { site: SiteResults; connectHref: string }) {
  const search = site.searchPerf;
  return <StSection title="What people searched" meta="Google Search Console · last 4 weeks">
    {search?.status === "ok" ? <>
      <StCopy><StMono>{count(search.clicks)}</StMono> clicks · <StMono>{count(search.impressions)}</StMono> impressions · <StMono>{(search.ctr * 100).toFixed(1)}%</StMono> click rate · average rank <StMono>{search.position.toFixed(1)}</StMono></StCopy>
      {search.topQueries.length ? <StTable label="Search queries" columns={[{ key: "query", label: "Search" }, { key: "clicks", label: "Clicks", mono: true }, { key: "position", label: "Rank", mono: true }]} rows={search.topQueries.slice(0, 5).map((query, index) => ({ key: String(index), cells: { query: query.query, clicks: count(query.clicks), position: query.position.toFixed(1) } }))} /> : <StEmpty>Google is connected. No search queries have been reported yet.</StEmpty>}
    </> : search?.status === "unavailable" ? <StNotice>Search results couldn&apos;t be read right now. Your Google connection is kept.</StNotice> : <StEmpty>Google search isn&apos;t connected.<StTextButton href={connectHref}>Ask Strelva to connect Google</StTextButton></StEmpty>}
  </StSection>;
}

function VisitorSources({ site, connectHref }: { site: SiteResults; connectHref: string }) {
  const ga = site.gaPerf;
  return <StSection title="Where visitors came from" meta="Google Analytics · last 4 weeks">
    {ga?.status === "ok" ? <>
      <StCopy><StMono>{count(ga.users)}</StMono> visitors · <StMono>{count(ga.sessions)}</StMono> visits · <StMono>{count(ga.pageviews)}</StMono> page views</StCopy>
      {ga.topSources.filter(source => source.sessions > 0).length ? <StRows>{ga.topSources.filter(source => source.sessions > 0).slice(0, 6).map((source, index) => <StRow key={index} title={source.source === "(direct)" ? "Direct" : source.source} end={<StMono>{count(source.sessions)} visits</StMono>} />)}</StRows> : <StEmpty>No visitor sources have been reported yet.</StEmpty>}
      {ga.topPages.filter(page => page.views > 0).length ? <StSection title="Where they landed"><StRows>{ga.topPages.filter(page => page.views > 0).slice(0, 5).map((page, index) => <StRow key={index} title={<StMono tone="text">{page.path}</StMono>} end={<StMono>{count(page.views)} views</StMono>} />)}</StRows></StSection> : null}
    </> : ga?.status === "unavailable" ? <StNotice>Visitor sources couldn&apos;t be read right now. Your Google connection is kept.</StNotice> : <StEmpty>Visitor sources aren&apos;t connected.<StTextButton href={connectHref}>Ask Strelva to connect Google</StTextButton></StEmpty>}
  </StSection>;
}

function SiteResultsView({ workspaceId, site }: { workspaceId: string; site: SiteResults }) {
  const connectHref = `/workspace?view=help&workspaceId=${encodeURIComponent(workspaceId)}`;
  const answers = site.aiVisibility;
  const milestone = site.milestone;
  return <div className={styles.stack}>
    <StSplit aside={<SearchResults site={site} connectHref={connectHref} />}><VisitTrend site={site} /></StSplit>
    <SiteHealth site={site} />
    <VisitorSources site={site} connectHref={connectHref} />
    {answers ? <StSection title="You in answers" meta={answers.checkedAt ? `Checked ${whenLabel(answers.checkedAt)}` : undefined}>
      {!answers.hasData ? <StEmpty>No sampled answers are available yet.</StEmpty> : <>
        <StCopy>Strelva sampled <StMono>{answers.total}</StMono> questions about {answers.service}. Your business was named in <StMono>{answers.mentionedCount}</StMono> answers.</StCopy>
        {answers.mentionedQueries.length ? <StRows>{answers.mentionedQueries.map(query => <StRow key={query} title={query} end={answers.newlyAppeared.includes(query) ? <StState kind="live">New since the previous check</StState> : undefined} />)}</StRows> : null}
        <StCopy muted>Answers vary by person and moment. This sample is a directional read, not a fixed rank.</StCopy>
      </>}
    </StSection> : null}
    {milestone ? <StSection title="Since you started" meta={milestone.periodLabel}>
      {milestone.state === "building" ? <StEmpty>{milestone.buildingNote}</StEmpty> : <><StCopy>{milestone.headline}</StCopy><StRows>{milestone.metrics.map(metric => <StRow key={metric.key} lead={<StMono size="value">{metric.now}</StMono>} title={metric.label} detail={<>{metric.then !== null ? <>Previously <StMono>{metric.then}</StMono> · </> : metric.trackingSince ? <>Tracking since <StMono>{metric.trackingSince}</StMono> · </> : null}{metric.caption}</>} stackOnPhone={false} />)}</StRows></>}
    </StSection> : null}
  </div>;
}

export type WorkspaceResultsState = PlaceState<WorkspaceResults> | { kind: "loading" };
export function WorkspaceResultsView({ workspaceId, state, range }: { workspaceId: string; state: WorkspaceResultsState; range: RangeKey }) {
  const data = state.kind === "ready" ? state.data : null;
  const custom = data?.sites.find(site => site.stats?.range.key === "custom")?.stats?.range;
  return <main className={styles.paper} data-dashboard data-workspace-theme="linen"><StPage>
    <StHead crumb={{ label: "Back to Home", href: placeHomeHref(workspaceId) }} title="Results and health" meta="Who found your site, who acted, and how the site is holding up." actions={<StTextButton href={`/workspace/recaps?workspaceId=${encodeURIComponent(workspaceId)}`}>Recaps</StTextButton>} />
    {state.kind === "loading" ? <><StSkeleton label="Loading results" width="65%" /><StSkeleton /><StSkeleton width="80%" /></> : state.kind === "permission" ? <StNotice tone="critical"><strong>This belongs to another business</strong><StCopy>Your account isn&apos;t a member of this business. Ask its owner to invite you, or open your own workspace.</StCopy><StTextButton href="/workspace">Open your workspace</StTextButton></StNotice> : state.kind === "error" ? <StNotice tone="critical"><strong>Results couldn&apos;t load</strong><StCopy>Nothing is lost. Visits are still counted. Reload the page to try again.</StCopy><ResultsRetry /></StNotice> : <>
      <nav className={styles.actions} aria-label="Time window">{RANGES.map(item => <StPillLink key={item.key} href={resultsHref(workspaceId, item.key)} current={range === item.key} variant="soft">{item.label}{range === item.key ? " · selected" : ""}</StPillLink>)}{range === "custom" ? <StMono>{custom?.label || "Custom window"}</StMono> : null}</nav>
      {data?.denied.length ? <StNotice>Your account can&apos;t open {data.denied.map(site => site.siteName).join(", ")} yet, so {data.denied.length === 1 ? "it isn't" : "they aren't"} shown. Ask the owner to finish adding you.</StNotice> : null}
      {data && !data.sites.length && !data.denied.length ? <StEmpty><strong>No site is connected to this business yet</strong>Results start once Strelva runs a website for this business.</StEmpty> : null}
      {data?.sites.map(site => <section key={site.tenantId} aria-label={site.siteName} className={styles.stack}>{data.sites.length > 1 ? <StSection title={site.siteName}><SiteResultsView workspaceId={workspaceId} site={site} /></StSection> : <SiteResultsView workspaceId={workspaceId} site={site} />}</section>)}
    </>}
  </StPage></main>;
}
