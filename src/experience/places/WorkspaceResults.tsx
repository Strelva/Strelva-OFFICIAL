import { MousePointerClick, Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/dashboard/StatTile";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { SearchAnalyticsPanel } from "@/components/dashboard/SearchAnalyticsPanel";
import { TrafficSourcesPanel } from "@/components/dashboard/TrafficSourcesPanel";
import { MilestonePanel } from "@/components/dashboard/MilestonePanel";
import { AiVisibilityScorecard } from "@/components/dashboard/AiVisibilityScorecard";
import { periodHeadline, type RangeKey } from "@/lib/analytics/period";
import type { SiteResults, WorkspaceResults } from "@/products/websites/linked-results";
import { NoSiteCard, SiteHeading, WorkspacePlace, whenLabel, type PlaceState } from "./WorkspacePlace";

/**
 * Results and health of the website, in the workspace: the home of
 * /dashboard/analytics and /dashboard/health. Live numbers for the chosen
 * window, Google search and visitor sources, AI answers, the milestone and
 * the latest site check. Server-rendered; the window is a plain link.
 */

const RANGES: Array<{ key: Exclude<RangeKey, "custom">; label: string }> = [
  { key: "live", label: "Live" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
];

export function resultsHref(workspaceId: string, range: RangeKey = "live", window?: { from: string; to: string }): string {
  const params = new URLSearchParams({ workspaceId });
  if (range !== "live") params.set("range", range);
  if (range === "custom" && window) {
    params.set("from", window.from);
    params.set("to", window.to);
  }
  return `/workspace/results?${params}`;
}

function SiteHealth({ site }: { site: SiteResults }) {
  const health = site.health;
  return (
    <Card padding="md" id="site-health" className="scroll-mt-6">
      <h3 className="text-sm font-medium">Site health</h3>
      {!health ? (
        <p className="mt-2 text-sm leading-6 text-gray-muted">Strelva hasn&apos;t finished a check of {site.siteName} yet. The daily check covers speed, security, search and accessibility.</p>
      ) : (
        <>
          <p className="mt-2 text-sm leading-6">Grade {health.grade} · {Math.round(health.overallScore)} out of 100 · checked {whenLabel(health.scannedAt)}</p>
          {health.prioritizedIssues?.length ? (
            <ul className="mt-3 grid gap-1 text-sm leading-6 text-gray-muted">
              {health.prioritizedIssues.slice(0, 5).map((issue, index) => <li key={index} className="flex gap-2"><span aria-hidden="true">·</span><span>{issue.message}</span></li>)}
            </ul>
          ) : <p className="mt-2 text-sm text-gray-muted">Nothing needs fixing from the latest check.</p>}
        </>
      )}
    </Card>
  );
}

function SiteResultsView({ workspaceId, site }: { workspaceId: string; site: SiteResults }) {
  const connectHref = `/workspace?view=help&workspaceId=${encodeURIComponent(workspaceId)}`;
  const stats = site.stats;
  const showAnomaly = stats?.range.key === "live" && site.anomaly;
  return (
    <div className="grid gap-4">
      {!stats ? (
        <Card padding="lg" role="status"><p className="text-sm leading-6 text-gray-muted">Visits for {site.siteName} couldn&apos;t be read right now. Nothing is lost; counting continues.</p></Card>
      ) : (
        <>
          <p className="font-display text-[22px] leading-snug">{periodHeadline(stats)}</p>
          {showAnomaly && site.anomaly ? (
            <Card padding="md" role="status">
              <p className="text-sm font-medium">{site.anomaly.headline}</p>
              <p className="mt-1 text-sm leading-6 text-gray-muted">{site.anomaly.why}</p>
              <p className="mt-2 text-sm leading-6"><span className="font-medium">Do this:</span> {site.anomaly.suggestion}</p>
            </Card>
          ) : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <StatTile label="People found you" value={stats.hasData ? stats.pageViews : "—"} delta={stats.hasData ? stats.pageViewsDelta : undefined} deltaLabel={stats.range.priorLabel}
              detail={stats.hasData ? "Searches and visits to your site" : "Starts filling in as people find you"} icon={<Users className="h-4 w-4" strokeWidth={1.5} />} />
            <StatTile label="Customer actions" value={stats.hasData ? stats.actions : "—"} delta={stats.hasData ? stats.actionsDelta : undefined} deltaLabel={stats.range.priorLabel}
              detail={!stats.hasData ? "Booked or called you" : stats.phoneClicks > 0 ? `${stats.bookingClicks} clicked to book · ${stats.phoneClicks} called` : "Clicked to book or called you"}
              icon={<MousePointerClick className="h-4 w-4" strokeWidth={1.5} />} />
          </div>
          <TrendChart metrics={stats.series} label={stats.range.key === "live" ? "Live · last 7 days" : stats.range.label} />
        </>
      )}
      {site.searchPerf?.status !== "ok" && site.gaPerf?.status !== "ok" ? (
        <Card padding="md">
          <h3 className="text-sm font-medium">Google search and visitor sources aren&apos;t connected</h3>
          <p className="mt-1 text-sm leading-6 text-gray-muted">One Google connection shows who finds you on Google and where visitors come from. Ask Strelva to connect it.</p>
        </Card>
      ) : (
        <>
          <SearchAnalyticsPanel search={site.searchPerf} ga={site.gaPerf} connectHref={connectHref} />
          <TrafficSourcesPanel ga={site.gaPerf} connectHref={connectHref} />
        </>
      )}
      {site.aiVisibility ? <AiVisibilityScorecard data={site.aiVisibility} /> : null}
      {site.milestone ? <MilestonePanel milestone={site.milestone} visitorSeries={site.visitorSeries} /> : null}
      <SiteHealth site={site} />
    </div>
  );
}

export function WorkspaceResultsView({ workspaceId, state, range }: { workspaceId: string; state: PlaceState<WorkspaceResults>; range: RangeKey }) {
  const data = state.kind === "ready" ? state.data : null;
  return (
    <WorkspacePlace workspaceId={workspaceId} eyebrow="Website" title="Results and health" wide
      intro="Who found your site, who acted, and how the site is holding up. Weekly and monthly recaps are under Recaps."
      state={state} denied={data?.denied.map((site) => site.siteName)}
      errorTitle="Results couldn't load" errorBody="Nothing is lost. Visits are still counted. Reload the page to try again.">
      <nav aria-label="Time window" className="mt-8 inline-flex rounded-lg border border-gray-border p-0.5">
        {RANGES.map((item) => (
          <a key={item.key} href={resultsHref(workspaceId, item.key)} aria-current={range === item.key ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${range === item.key ? "bg-warm-black text-warm-white" : "text-gray-muted hover:text-warm-black"}`}>{item.label}</a>
        ))}
      </nav>
      <a className="ml-4 text-sm text-gray-muted underline-offset-4 hover:underline" href={`/workspace/recaps?workspaceId=${encodeURIComponent(workspaceId)}`}>Recaps</a>
      {data && data.sites.length === 0 && data.denied.length === 0 ? <NoSiteCard body="Results start once Strelva runs a website for this business." /> : null}
      {data?.sites.map((site) => (
        <section key={site.tenantId} className="mt-8" aria-labelledby={`site-${site.tenantId}`}>
          <SiteHeading id={`site-${site.tenantId}`} name={site.siteName} multiple={data.sites.length > 1} />
          <SiteResultsView workspaceId={workspaceId} site={site} />
        </section>
      ))}
    </WorkspacePlace>
  );
}
