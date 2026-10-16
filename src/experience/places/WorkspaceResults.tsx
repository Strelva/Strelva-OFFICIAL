import type { ComponentProps } from "react";
import { XA_PLACE_LABELS } from "@/platform/presentation/place-labels";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { XaButtonLink, XaLabel, XaRow, XaRows, XaSays, XaStatus, XaSystemTile, XaTextLink } from "@/components/ui/strelva/Xa";
import type { HandledReceipt } from "@/platform/needs-you/contracts";
import { systemHref } from "@/experience/systems/model";
import type { RangeKey } from "@/lib/analytics/period";
import type { SiteResults, WorkspaceResults } from "@/products/websites/client";
import { placeHomeHref, type PlaceState } from "./WorkspacePlace";
import { ResultsRetry } from "./ResultsRetry";
import { XaChangeLine, XaLead, XaLinkSegmented, XaNote, XaPlace, XaPlaceHead, XaPlaceLoading, XaPlaceNotMember, XaPlaceTrouble, xaShortDate } from "./XaPlace";
import place from "./xa-place.module.css";
import styles from "./workspace-results.module.css";

/**
 * Results (lane results, October 16): one sentence for the window, the one
 * change that mattered with whoever made it and a link to see it, then what
 * people searched and where they came from; health shows only as an
 * exception. No hero number and no bar chart. Presentation only: all counts
 * keep their selected window and original source.
 */
const RANGES: Array<{ key: Exclude<RangeKey, "custom">; label: string }> = [
  // The segment names the window the sentence covers ("Last 7 days" is the live window).
  { key: "live", label: "Last 7 days" }, { key: "week", label: "This week" }, { key: "month", label: "This month" },
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
/** Where a business usually shows up on Google, in words an owner uses (never "rank 2.1"). */
export function searchPlace(position: number): string {
  if (!Number.isFinite(position) || position <= 0) return "Not placed yet";
  const spot = Math.round(position);
  if (spot <= 1) return "Usually first";
  if (spot <= 3) return `Usually ${spot === 2 ? "2nd" : "3rd"}`;
  if (spot <= 6) return "Page 1, near the top";
  if (spot <= 10) return "Page 1, near the bottom";
  return `Page ${Math.ceil(spot / 10)}`;
}

/** Where visitors came from, in words. */
export function sourceName(source: string): string {
  const value = source.trim().toLowerCase();
  if (value === "(direct)" || value === "(direct) / (none)") return "Typed your address or used a bookmark";
  if (value.startsWith("google / organic") || value === "google") return "Google searches";
  if (value.includes("maps")) return "Google Maps";
  if (value.includes("facebook")) return "Facebook";
  if (value.includes("instagram")) return "Instagram";
  if (value.includes("bing")) return "Bing searches";
  return source.split(" / ")[0]!;
}

/** The one finding for the head: the change, then where most visits came from. */
export function resultsFinding(site: SiteResults): string | null {
  const stats = site.stats;
  if (!stats?.hasData) return null;
  const prior = stats.range.priorLabel.replace(/^vs /, "");
  const change = stats.pageViewsDelta === 0 ? `Visits held steady against ${prior}.` : `${stats.pageViewsDelta > 0 ? "Up" : "Down"} ${count(Math.abs(stats.pageViewsDelta))} visits from ${prior}.`;
  const top = site.gaPerf?.status === "ok" ? site.gaPerf.topSources.filter(source => source.sessions > 0).sort((a, b) => b.sessions - a.sessions)[0] : undefined;
  const query = site.searchPerf?.status === "ok" ? site.searchPerf.topQueries[0]?.query : undefined;
  const from = top ? sourceName(top.source) : null;
  if (!from) return change;
  if (from.startsWith("Typed")) return `${change} Most people typed your address or used a bookmark.`;
  return `${change} Most came from ${from === "Google searches" && query ? `Google searches like \u201c${query}\u201d` : from}.`;
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
        <ul className={place.facts} aria-label="What to fix">{issues.slice(0, 5).map((issue, index) => <li key={index}><span>{issue.message}</span></li>)}</ul>
        <p className={place.quiet}>Strelva checked {xaShortDate(health.scannedAt)}. It checks again every day.</p>
      </> : <XaStatus kind="live">Nothing needs fixing (checked {xaShortDate(health.scannedAt)})</XaStatus>}
  </section>;
}

/** "in the last 7 days", "this week", "between Oct 1 and Oct 9": the window as part of a sentence. */
export function resultsWindowPhrase(range: { key: string; label: string }): string {
  if (range.key === "live") return `in the ${range.label.toLowerCase()}`;
  if (range.key === "week") return "this week";
  if (range.key === "month") return "this month";
  const [from, to] = range.label.split(/\s+[\u2013-]\s+/);
  return to ? `between ${from} and ${to}` : `in ${range.label}`;
}

/**
 * Results' one sentence (lane results, October 16): the visits in the window
 * in ink, then one quiet clause with a different fact (the change against the
 * window before, then where most visits came from). Never the same number twice.
 */
export function resultsLead(site: SiteResults): { main: string; quiet: string } | null {
  const stats = site.stats;
  if (!stats) return null;
  const window = resultsWindowPhrase(stats.range);
  if (!stats.hasData) return { main: `No visits to ${site.siteName} were counted ${window}.`, quiet: "It starts filling in as people find you." };
  const prior = stats.range.priorLabel.replace(/^vs /, "");
  const moved = stats.pageViewsDelta === 0 ? `The same as ${prior}.` : `${count(Math.abs(stats.pageViewsDelta))} ${stats.pageViewsDelta > 0 ? "more" : "fewer"} than ${prior}.`;
  const finding = resultsFinding(site);
  const source = finding?.replace(/^[^.]*\.\s*/, "") ?? "";
  return { main: `${count(stats.pageViews)} ${stats.pageViews === 1 ? "visit" : "visits"} to ${site.siteName} ${window}.`, quiet: [moved, source].filter(Boolean).join(" ") };
}

/** The newest recorded change for this business, with whoever acted in its sentence, and where to see it. */
export interface ResultsChange { sentence: string; at: string; href: string }

/** Picks the change Results leads with from What changed (newest first). Undone changes are skipped. */
export function resultsChange(handled: readonly Pick<HandledReceipt, "sentence" | "at" | "systemId" | "undo">[] | null | undefined, workspaceId: string): ResultsChange | null {
  const row = handled?.find(item => item.undo.state !== "undone" && item.sentence.trim());
  if (!row) return null;
  const sentence = row.sentence.trim();
  return { sentence: /[.!?]$/.test(sentence) ? sentence : `${sentence}.`, at: row.at, href: row.systemId ? systemHref("", workspaceId, row.systemId) : placeHomeHref(workspaceId) };
}

function Visits({ site, latest }: { site: SiteResults; latest: ResultsChange | null | undefined }) {
  const stats = site.stats;
  if (!stats) return <XaPlaceTrouble role="status" title={`Visits for ${site.siteName} couldn't be read right now.`} quiet="Nothing is lost; counting continues." />;
  const lead = resultsLead(site)!;
  return <section className={styles.visits} aria-label={`Visits, ${stats.range.label}`}>
    <XaLead quiet={lead.quiet}>{lead.main}</XaLead>
    {stats.range.key === "live" && site.anomaly ? <XaSays><b>{site.anomaly.headline}</b> {site.anomaly.why} {site.anomaly.suggestion}</XaSays> : null}
    {latest ? <XaChangeLine label="The change that mattered" when={xaShortDate(latest.at)} href={latest.href}>{latest.sentence}</XaChangeLine>
      : latest === null ? <XaChangeLine label="The change that mattered">Nothing on {site.siteName} changed in the last 7 days.</XaChangeLine> : null}
    <p className={place.body}>{stats.hasData ? <>{count(stats.actions)} people clicked to book or call: {count(stats.bookingClicks)} to book, {count(stats.phoneClicks)} to call. {change(stats.actionsDelta, stats.range.priorLabel)}.</> : "No clicks to book or call yet in this window."}</p>
    <p className={place.quiet}>Visits can include repeat visits. A click doesn&apos;t confirm a booking or an answered call.</p>
  </section>;
}

function Searched({ site, connectHref }: { site: SiteResults; connectHref: string }) {
  const search = site.searchPerf;
  return <section className={place.stack} aria-labelledby={`search-${site.tenantId}`}>
    <XaLabel as="h2" id={`search-${site.tenantId}`}>What people searched · Google, last 4 weeks</XaLabel>
    {search?.status === "ok" ? <>
      <p className={place.body}>You showed up {count(search.impressions)} times and {count(search.clicks)} people clicked through. {searchPlace(search.position) === "Not placed yet" ? "" : `Across all searches you're ${searchPlace(search.position).replace(/^Usually /, "usually ").replace(/^Page/, "on page")}.`}</p>
      {search.topQueries.length ? <ul className={place.facts} aria-label="What people searched">{search.topQueries.slice(0, 5).map((query, index) => <li key={index}><span className={place.factMain}>{query.query}<small>{searchPlace(query.position)}</small></span><span>{count(query.clicks)} clicks</span></li>)}</ul>
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
      {sources.length ? <ul className={place.facts} aria-label="Visitor sources">{sources.slice(0, 6).map((source, index) => <li key={index}><span>{sourceName(source.source)}</span><span>{count(source.sessions)} visits</span></li>)}</ul> : <p className={place.quiet}>No visitor sources have been reported yet.</p>}
      {pages.length ? <><XaLabel as="h3">Where they landed</XaLabel><ul className={place.facts} aria-label="Where they landed">{pages.slice(0, 5).map((page, index) => <li key={index}><span>{pageName(page.path)}</span><span>{count(page.views)} views</span></li>)}</ul></> : null}
    </> : ga?.status === "unavailable" ? <XaNote pebble>Visitor sources couldn&apos;t be read right now. Your Google connection is kept.</XaNote>
      : <XaNote>Visitor sources aren&apos;t connected. <XaTextLink href={connectHref}>Connect Google</XaTextLink></XaNote>}
  </section>;
}

function SiteResultsView({ workspaceId, site, latest }: { workspaceId: string; site: SiteResults; latest: ResultsChange | null | undefined }) {
  // Google is connected by the owner with their own account, on the Google place.
  const connectHref = `/workspace/google?workspaceId=${encodeURIComponent(workspaceId)}`;
  const answers = site.aiVisibility;
  const milestone = site.milestone;
  return <div className={place.columns}>
    <div className={place.sectionGap}>
      <Visits site={site} latest={latest} />
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

/**
 * `latest` is the newest change from What changed (`resultsChange`). Left out
 * when it couldn't be read, so the line is absent rather than claiming that
 * nothing changed; `null` means it was read and nothing changed.
 */
export function WorkspaceResultsView({ workspaceId, state, range, chrome, hrefFor = resultsHref, latest }: { workspaceId: string; state: WorkspaceResultsState; range: RangeKey; chrome?: ShellChrome; hrefFor?: (workspaceId: string, range: RangeKey) => string; latest?: ResultsChange | null }) {
  const data = state.kind === "ready" ? state.data : null;
  const custom = data?.sites.find(site => site.stats?.range.key === "custom")?.stats?.range;
  const ready = state.kind === "ready";
  const art = <XaSystemTile kind="website" size={56} />;
  return <StrelvaShell title="Results" workspaceId={workspaceId} active="system" {...chrome}>
    <XaPlace label="Results">
      <XaPlaceHead art={art} title="Results" back={{ href: placeHomeHref(workspaceId), label: `Back to ${XA_PLACE_LABELS.today}` }}
        status={range === "custom" ? <span>{custom?.label || "Custom window"}</span> : undefined}
        aside={ready ? <XaLinkSegmented label="Time window" options={RANGES.map(item => ({ href: hrefFor(workspaceId, item.key), label: item.label, current: range === item.key }))} /> : <XaButtonLink size="sm" href={`/workspace/recaps?workspaceId=${encodeURIComponent(workspaceId)}`}>Recaps</XaButtonLink>} />
      {state.kind === "loading" ? <XaPlaceLoading label="Loading results" />
        : state.kind === "permission" ? <XaPlaceNotMember />
          : state.kind === "error" ? <XaPlaceTrouble title="Results couldn't load." quiet="Nothing is lost. Visits are still counted." action={<ResultsRetry />} />
            : <>
              {data?.denied.length ? <XaNote pebble>Your account can&apos;t open {data.denied.map(site => site.siteName).join(", ")} yet, so {data.denied.length === 1 ? "it isn't" : "they aren't"} shown. Ask the owner to finish adding you.</XaNote> : null}
              {data && !data.sites.length && !data.denied.length ? <XaPlaceTrouble role="status" pose="waving" title="No site is connected to this business yet." quiet="Results start once a website is connected or published here." /> : null}
              {data?.sites.map(site => <section key={site.tenantId} aria-label={site.siteName} className={place.stack}>
                {data.sites.length > 1 ? <XaLabel as="h2">{site.siteName}</XaLabel> : null}
                <SiteResultsView workspaceId={workspaceId} site={site} latest={data.sites.length === 1 ? latest : undefined} />
              </section>)}
            </>}
    </XaPlace>
  </StrelvaShell>;
}
