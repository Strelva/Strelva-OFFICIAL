import type { ComponentProps } from "react";
import { XA_PLACE_LABELS } from "@/platform/presentation/place-labels";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { XaButtonLink, XaLabel, XaRow, XaRows, XaSays, XaStatus, XaSystemTile, XaTextLink } from "@/components/ui/strelva/Xa";
import type { RangeKey } from "@/lib/analytics/period";
import type { SiteResults, WorkspaceResults } from "@/products/websites/client";
import { placeHomeHref, type PlaceState } from "./WorkspacePlace";
import { ResultsRetry } from "./ResultsRetry";
import { XaFigure, XaLinkSegmented, XaNote, XaPlace, XaPlaceHead, XaPlaceLoading, XaPlaceNotMember, XaPlaceTrouble, xaShortDate } from "./XaPlace";
import place from "./xa-place.module.css";
import styles from "./workspace-results.module.css";

/**
 * Results (lane xs-leads): one big number for the window, the days under it,
 * then what people searched and where they came from; health shows only as
 * an exception. Presentation only: all counts keep their selected window and
 * original source.
 */
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
/** A page's name as an owner says it, never its path. */
export function pageName(path: string): string {
  const clean = path.split(/[?#]/)[0]!.replace(/\/+$/, "");
  if (!clean) return "Home page";
  const last = decodeURIComponent(clean.split("/").pop() || "").replace(/[-_]+/g, " ").trim();
  return last ? last.charAt(0).toUpperCase() + last.slice(1) : "Home page";
}

function SiteHealth({ site }: { site: SiteResults }) {
  const health = site.health;
  const issues = health?.prioritizedIssues ?? [];
  return <section id="site-health" className={place.stack} aria-labelledby={`health-${site.tenantId}`}>
    <XaLabel as="h2" id={`health-${site.tenantId}`}>Site health</XaLabel>
    {!health ? <XaNote pebble><XaStatus kind="draft" size="sm">Not checked yet</XaStatus> Strelva hasn&apos;t finished a check of {site.siteName} yet. The daily check covers speed, security, search and accessibility.</XaNote>
      : issues.length ? <>
        <XaStatus kind="waits">{issues.length === 1 ? "1 thing to fix" : `${Math.min(issues.length, 5)} things to fix`}</XaStatus>
        <XaRows label="What to fix">{issues.slice(0, 5).map((issue, index) => <XaRow key={index} title={issue.message} />)}</XaRows>
        <p className={place.quiet}>Grade {health.grade} · {Math.round(health.overallScore)} out of 100 · checked {xaShortDate(health.scannedAt)}</p>
      </> : <>
        <XaStatus kind="live">Nothing needs fixing</XaStatus>
        <p className={place.quiet}>Grade {health.grade} · {Math.round(health.overallScore)} out of 100 · checked {xaShortDate(health.scannedAt)}</p>
      </>}
  </section>;
}

function Visits({ site }: { site: SiteResults }) {
  const stats = site.stats;
  if (!stats) return <XaPlaceTrouble role="status" title={`Visits for ${site.siteName} couldn't be read right now.`} quiet="Nothing is lost; counting continues." />;
  const series = stats.series;
  const max = Math.max(1, ...series.map(day => day.pageViews));
  return <section className={styles.visits} aria-label={`Visits, ${stats.range.label}`}>
    {stats.hasData ? <XaFigure value={count(stats.pageViews)} label={`visits to ${site.siteName}`} note={`${stats.range.label} · ${change(stats.pageViewsDelta, stats.range.priorLabel)}`} />
      : <XaFigure value="0" label={`visits to ${site.siteName} so far`} note="It starts filling in as people find you." />}
    {series.length > 1 && stats.pageViews >= 5 ? <figure className={styles.chartFigure}>
      <div className={styles.chart} role="img" aria-label={`Daily visits for ${stats.range.label}: ${series.map(day => `${day.date}: ${day.pageViews}`).join(", ")}`}>
        {series.map(day => <span key={day.date} className={styles.bar} style={{ height: `${Math.max(2, day.pageViews / max * 100)}%` }} title={`${xaShortDate(day.date)}: ${count(day.pageViews)} visits`} />)}
      </div>
      <figcaption className={styles.chartLabels}><span>{xaShortDate(series[0]!.date)}</span><span>{xaShortDate(series[series.length - 1]!.date)}</span></figcaption>
    </figure> : <p className={place.quiet}>Not enough visits yet to draw the days. This fills in as more people find you.</p>}
    <p className={place.body}>{stats.hasData ? <>{count(stats.actions)} people clicked to book or call: {count(stats.bookingClicks)} to book, {count(stats.phoneClicks)} to call. {change(stats.actionsDelta, stats.range.priorLabel)}.</> : "No clicks to book or call yet in this window."}</p>
    <p className={place.quiet}>Visits can include repeat visits. A click doesn&apos;t confirm a booking or an answered call.</p>
    {stats.range.key === "live" && site.anomaly ? <XaSays><b>{site.anomaly.headline}</b> {site.anomaly.why} {site.anomaly.suggestion}</XaSays> : null}
  </section>;
}

function Searched({ site, connectHref }: { site: SiteResults; connectHref: string }) {
  const search = site.searchPerf;
  return <section className={place.stack} aria-labelledby={`search-${site.tenantId}`}>
    <XaLabel as="h2" id={`search-${site.tenantId}`}>What people searched · Google, last 4 weeks</XaLabel>
    {search?.status === "ok" ? <>
      <p className={place.body}>{count(search.clicks)} clicks from {count(search.impressions)} times you showed up, {(search.ctr * 100).toFixed(1)}% of the time. Average rank {search.position.toFixed(1)}.</p>
      {search.topQueries.length ? <XaRows label="Search queries">{search.topQueries.slice(0, 5).map((query, index) => <XaRow key={index} title={query.query} detail={`Rank ${query.position.toFixed(1)}`} meta={`${count(query.clicks)} clicks`} />)}</XaRows>
        : <p className={place.quiet}>Google is connected. No search queries have been reported yet.</p>}
    </> : search?.status === "unavailable" ? <XaNote pebble>Search results couldn&apos;t be read right now. Your Google connection is kept.</XaNote>
      : <XaNote>Google search isn&apos;t connected. <XaTextLink href={connectHref}>Connect Google</XaTextLink></XaNote>}
  </section>;
}

function Sources({ site, connectHref }: { site: SiteResults; connectHref: string }) {
  const ga = site.gaPerf;
  const sources = ga?.status === "ok" ? ga.topSources.filter(source => source.sessions > 0) : [];
  const pages = ga?.status === "ok" ? ga.topPages.filter(page => page.views > 0) : [];
  return <section className={place.stack} aria-labelledby={`sources-${site.tenantId}`}>
    <XaLabel as="h2" id={`sources-${site.tenantId}`}>Where visitors came from · last 4 weeks</XaLabel>
    {ga?.status === "ok" ? <>
      <p className={place.body}>{count(ga.users)} visitors made {count(ga.sessions)} visits and viewed {count(ga.pageviews)} pages.</p>
      {sources.length ? <XaRows label="Visitor sources">{sources.slice(0, 6).map((source, index) => <XaRow key={index} title={source.source === "(direct)" ? "Typed your address or used a bookmark" : source.source} meta={`${count(source.sessions)} visits`} />)}</XaRows> : <p className={place.quiet}>No visitor sources have been reported yet.</p>}
      {pages.length ? <><XaLabel as="h3">Where they landed</XaLabel><XaRows label="Where they landed">{pages.slice(0, 5).map((page, index) => <XaRow key={index} title={pageName(page.path)} meta={`${count(page.views)} views`} />)}</XaRows></> : null}
    </> : ga?.status === "unavailable" ? <XaNote pebble>Visitor sources couldn&apos;t be read right now. Your Google connection is kept.</XaNote>
      : <XaNote>Visitor sources aren&apos;t connected. <XaTextLink href={connectHref}>Connect Google</XaTextLink></XaNote>}
  </section>;
}

function SiteResultsView({ workspaceId, site }: { workspaceId: string; site: SiteResults }) {
  // Google is connected by the owner with their own account, on the Google place.
  const connectHref = `/workspace/google?workspaceId=${encodeURIComponent(workspaceId)}`;
  const answers = site.aiVisibility;
  const milestone = site.milestone;
  return <div className={place.columns}>
    <div className={place.sectionGap}>
      <Visits site={site} />
      <Searched site={site} connectHref={connectHref} />
      <Sources site={site} connectHref={connectHref} />
    </div>
    <aside className={place.rail} aria-label={`More about ${site.siteName}`}>
      <SiteHealth site={site} />
      {answers ? <section className={place.stack} aria-label="You in answers">
        <XaLabel as="h2">You in answers{answers.checkedAt ? ` · checked ${xaShortDate(answers.checkedAt)}` : ""}</XaLabel>
        {!answers.hasData ? <p className={place.quiet}>No sampled answers are available yet.</p> : <>
          <p className={place.body}>Strelva asked {answers.total} questions about {answers.service}. {answers.mentionedCount === 1 ? "1 answer named you." : `${answers.mentionedCount} answers named you.`}</p>
          {answers.mentionedQueries.length ? <XaRows label="Answers that named you">{answers.mentionedQueries.map(query => <XaRow key={query} title={query} detail={answers.newlyAppeared.includes(query) ? <XaStatus kind="live" size="sm">New since the previous check</XaStatus> : undefined} />)}</XaRows> : null}
          <p className={place.quiet}>Answers vary by person and moment. This sample is a direction, not a fixed rank.</p>
        </>}
      </section> : null}
      {milestone ? <section className={place.stack} aria-label="Since you started">
        <XaLabel as="h2">Since you started · {milestone.periodLabel}</XaLabel>
        {milestone.state === "building" ? <p className={place.quiet}>{milestone.buildingNote}</p> : <>
          <p className={place.body}>{milestone.headline}</p>
          <XaRows label="Since you started">{milestone.metrics.map(metric => <XaRow key={metric.key} title={metric.label} meta={metric.now}
            detail={<>{metric.then !== null ? `Previously ${metric.then} · ` : metric.trackingSince ? `Tracking since ${metric.trackingSince} · ` : null}{metric.caption}</>} />)}</XaRows>
        </>}
      </section> : null}
    </aside>
  </div>;
}

export type WorkspaceResultsState = PlaceState<WorkspaceResults> | { kind: "loading" };
type ShellChrome = Partial<Omit<ComponentProps<typeof StrelvaShell>, "children">>;

export function WorkspaceResultsView({ workspaceId, state, range, chrome, hrefFor = resultsHref }: { workspaceId: string; state: WorkspaceResultsState; range: RangeKey; chrome?: ShellChrome; hrefFor?: (workspaceId: string, range: RangeKey) => string }) {
  const data = state.kind === "ready" ? state.data : null;
  const custom = data?.sites.find(site => site.stats?.range.key === "custom")?.stats?.range;
  const ready = state.kind === "ready";
  const art = <XaSystemTile kind="website" size={56} />;
  return <StrelvaShell title="Results" workspaceId={workspaceId} active="system" {...chrome}>
    <XaPlace label="Results">
      <XaPlaceHead art={art} title="Results" back={{ href: placeHomeHref(workspaceId), label: `Back to ${XA_PLACE_LABELS.today}` }}
        status={<span>Who found your site, who acted, and how the site is holding up.{range === "custom" ? ` · ${custom?.label || "Custom window"}` : ""}</span>}
        aside={ready ? <XaLinkSegmented label="Time window" options={RANGES.map(item => ({ href: hrefFor(workspaceId, item.key), label: item.label, current: range === item.key }))} /> : <XaButtonLink size="sm" href={`/workspace/recaps?workspaceId=${encodeURIComponent(workspaceId)}`}>Recaps</XaButtonLink>} />
      {state.kind === "loading" ? <XaPlaceLoading label="Loading results" />
        : state.kind === "permission" ? <XaPlaceNotMember />
          : state.kind === "error" ? <XaPlaceTrouble title="Results couldn't load." quiet="Nothing is lost. Visits are still counted." action={<ResultsRetry />} />
            : <>
              {data?.denied.length ? <XaNote pebble>Your account can&apos;t open {data.denied.map(site => site.siteName).join(", ")} yet, so {data.denied.length === 1 ? "it isn't" : "they aren't"} shown. Ask the owner to finish adding you.</XaNote> : null}
              {data && !data.sites.length && !data.denied.length ? <XaPlaceTrouble role="status" pose="waving" title="No site is connected to this business yet." quiet="Results start once a website is connected or published here." /> : null}
              {data?.sites.map(site => <section key={site.tenantId} aria-label={site.siteName} className={place.stack}>
                {data.sites.length > 1 ? <XaLabel as="h2">{site.siteName}</XaLabel> : null}
                <SiteResultsView workspaceId={workspaceId} site={site} />
              </section>)}
            </>}
    </XaPlace>
  </StrelvaShell>;
}
