import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { WorkspaceResultsView, type WorkspaceResultsState } from "@/experience/places/WorkspaceResults";
import { StNotice, StPage } from "@/components/ui/strelva/Kit";
import { resolveRange, type RangeKey } from "@/lib/analytics/period";
import type { SiteResults } from "@/products/websites/linked-results";

/** Fictional records only. This rehearsal exercises the production presentation. */
const WORKSPACE = "5e000000-0000-4000-8000-000000000010";
const SITE = { tenantId: "juniper", tenantStableId: "5e000000-0000-4000-8000-0000000000b2", siteName: "Juniper Bakery" };
export function L13Results({ state: name, mode, range: selected }: { state?: string; mode?: string; range?: string }) {
  const range: RangeKey = selected === "week" || selected === "month" ? selected : "live";
  const window = resolveRange(range);
  const days = Math.min(7, Math.round((window.to.getTime() - window.from.getTime()) / 86400000) + 1);
  const visits = [32, 35, 28, 39, 49, 43, 64].slice(-days);
  const total = visits.reduce((sum, value) => sum + value, 0);
  const stats: NonNullable<SiteResults["stats"]> = { range: window, pageViews: total, pageViewsPrior: 250, pageViewsDelta: total - 250, actions: 23, actionsPrior: 19, actionsDelta: 4, bookingClicks: 15, bookingClicksPrior: 12, phoneClicks: 8, phoneClicksPrior: 7, hasData: true,
    series: visits.map((pageViews, index) => ({ date: new Date(window.to.getTime() - (days - index - 1) * 86400000).toISOString().slice(0, 10), pageViews, bookingClicks: index === 0 ? 15 : 0, phoneClicks: index === 0 ? 8 : 0 })) };
  const site: SiteResults = { ...SITE, stats, anomaly: null, visitorSeries: visits, milestone: null,
    searchPerf: { status: "ok", clicks: 38, impressions: 640, ctr: 38 / 640, position: 4.2, topQueries: [{ query: "bakery buffalo ny", clicks: 21, impressions: 290, position: 4.2 }, { query: "custom cakes buffalo", clicks: 9, impressions: 200, position: 6.8 }, { query: "juniper bakery", clicks: 8, impressions: 150, position: 1 }] },
    gaPerf: { status: "ok", users: 214, sessions: 238, pageviews: 290, topSources: [{ source: "google / organic", sessions: 150 }, { source: "(direct)", sessions: 88 }], topPages: [{ path: "/", views: 175 }, { path: "/cakes", views: 115 }] },
    aiVisibility: { service: "bakery", mentionedCount: 2, total: 4, mentionedQueries: ["Where can I order a custom cake in Buffalo?", "Which bakery has sourdough?"], newlyAppeared: ["Which bakery has sourdough?"], hasData: true, checkedAt: "2026-10-08T12:00:00Z" },
    health: { url: "https://juniper.example", scannedAt: "2026-10-08T06:00:00Z", overallScore: 84, grade: "B", categories: [], prioritizedIssues: [{ message: "Two images on the menu page have no description", category: "accessibility", priority: "medium" }] },
  };
  const state: WorkspaceResultsState = name === "loading" ? { kind: "loading" } : name === "permission" ? { kind: "permission" } : name === "error" ? { kind: "error" } : { kind: "ready", data: {
    sites: name === "empty" ? [] : name === "unavailable" ? [{ ...site, stats: null, searchPerf: { ...site.searchPerf!, status: "unavailable" }, gaPerf: { ...site.gaPerf!, status: "unavailable" }, aiVisibility: { ...site.aiVisibility!, hasData: false }, health: null }] : name === "disconnected" ? [{ ...site, searchPerf: null, gaPerf: null }] : [site],
    denied: name === "denied" ? [{ ...SITE, tenantId: "juniper-east", siteName: "Juniper East" }] : [],
  } };
  return <div data-workspace-theme="linen" data-workspace-mode={mode === "dark" ? "dark" : "light"}><StrelvaShell signedIn={false} appBase="/preview/strelva" active="home" title="Results" businessContext="Juniper Bakery" systemsReleased>
    <StPage><StNotice>Local rehearsal · fictional bakery results. This is presentation proof, not measured customer outcomes or connected Google accounts.</StNotice></StPage>
    <WorkspaceResultsView workspaceId={WORKSPACE} state={state} range={range} />
  </StrelvaShell></div>;
}
