import { getDailyMetrics } from "@/lib/storage";
import { detectTrafficAnomaly } from "@/lib/anomaly";
import { getLatestSnapshots } from "@/lib/visibility/snapshots";
import { buildAiVisibilityScorecard } from "@/lib/ai-visibility-scorecard";
import { getGa4Perf, getSearchConsolePerf } from "@/lib/analytics";
import { buildMilestone } from "@/lib/milestone";
import { computePeriodStats, type PeriodStats, type ResolvedRange } from "@/lib/analytics/period";
import { getScanSummaries, type ScanSummary } from "@/lib/scan-store";
import { readLinkedSites, type LinkedSite, type LinkedSites } from "@/platform/owner-entry/linked-sites";
import type { WorkspaceActor } from "@/platform/workspaces/types";

/**
 * Results and health of each website System: the home of `/dashboard/analytics`
 * (and `/dashboard/health`, which already retires to it). Owner-entry spec §5.
 * The same live reads that page makes: the selected window's stats, the
 * rolling anomaly, Search Console and GA4 through `tenant_analytics_config`
 * (src/lib/analytics.ts reads Postgres first), the milestone, AI visibility,
 * plus the latest site scan as the health line.
 */

type SearchPerf = Awaited<ReturnType<typeof getSearchConsolePerf>>;
type GaPerf = Awaited<ReturnType<typeof getGa4Perf>>;
type Milestone = Awaited<ReturnType<typeof buildMilestone>>;

export interface SiteResults {
  tenantId: string;
  tenantStableId: string;
  siteName: string;
  /** Null: the traffic store couldn't be read. Never shown as zero visits. */
  stats: PeriodStats | null;
  anomaly: ReturnType<typeof detectTrafficAnomaly>;
  visitorSeries: number[];
  searchPerf: SearchPerf | null;
  gaPerf: GaPerf | null;
  milestone: Milestone | null;
  aiVisibility: ReturnType<typeof buildAiVisibilityScorecard> | null;
  health: ScanSummary | null;
}

export interface WorkspaceResults {
  sites: SiteResults[];
  denied: LinkedSite[];
}

export interface ResultDependencies {
  sites: (actor: WorkspaceActor, workspaceId: string) => Promise<LinkedSites>;
  stats: (tenantId: string, range: ResolvedRange) => Promise<PeriodStats>;
  daily: (tenantId: string) => ReturnType<typeof getDailyMetrics>;
  snapshots: (tenantId: string) => ReturnType<typeof getLatestSnapshots>;
  search: (tenantId: string) => Promise<SearchPerf>;
  ga: (tenantId: string) => Promise<GaPerf>;
  milestone: (tenantId: string) => Promise<Milestone>;
  scans: (tenantIds: string[]) => Promise<Record<string, ScanSummary | null>>;
}

const defaults: ResultDependencies = {
  sites: (actor, workspaceId) => readLinkedSites(actor, workspaceId),
  stats: (tenantId, range) => computePeriodStats(tenantId, range),
  // The anomaly is a rolling "right now" signal: always the last 30 days.
  daily: (tenantId) => getDailyMetrics(tenantId, 30),
  snapshots: (tenantId) => getLatestSnapshots(tenantId, 2),
  search: (tenantId) => getSearchConsolePerf(tenantId),
  ga: (tenantId) => getGa4Perf(tenantId),
  milestone: (tenantId) => buildMilestone(tenantId),
  scans: (tenantIds) => getScanSummaries(tenantIds),
};

/** Throws WorkspaceAccessError for anyone who isn't a direct member of this business. */
export async function readWorkspaceResults(actor: WorkspaceActor, workspaceId: string, range: ResolvedRange, dependencies: ResultDependencies = defaults): Promise<WorkspaceResults> {
  const { sites, denied } = await dependencies.sites(actor, workspaceId);
  const scans = await dependencies.scans(sites.map((site) => site.tenantId)).catch(() => ({} as Record<string, ScanSummary | null>));
  return {
    denied,
    sites: await Promise.all(sites.map(async (site): Promise<SiteResults> => {
      const [stats, daily, snapshots, searchPerf, gaPerf, milestone] = await Promise.all([
        dependencies.stats(site.tenantId, range).catch((error) => {
          console.error("[results] traffic read failed", { tenantId: site.tenantId, error: error instanceof Error ? error.message : String(error) });
          return null;
        }),
        dependencies.daily(site.tenantId).catch(() => []),
        dependencies.snapshots(site.tenantId).catch(() => []),
        dependencies.search(site.tenantId).catch(() => null),
        dependencies.ga(site.tenantId).catch(() => null),
        dependencies.milestone(site.tenantId).catch(() => null),
      ]);
      return {
        tenantId: site.tenantId, tenantStableId: site.tenantStableId, siteName: site.siteName,
        stats, anomaly: detectTrafficAnomaly(daily), visitorSeries: daily.map((metric) => metric.pageViews),
        searchPerf, gaPerf, milestone,
        aiVisibility: buildAiVisibilityScorecard(snapshots[0] ?? null, snapshots[1] ?? null),
        health: scans[site.tenantId] ?? null,
      };
    })),
  };
}
