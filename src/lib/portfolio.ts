/**
 * The portfolio brain: one cached, aggregated view of every tenant's health,
 * revenue, attention, and breakage. The Mission Control console renders it and
 * the operator agent reasons over it.
 *
 * `buildPortfolioSnapshot()` is the same per-tenant aggregation the admin
 * overview page does inline (src/app/admin/page.tsx), extracted so a cron can
 * precompute it and the console/agent read it from Redis instead of fanning
 * out 5+ reads per tenant on every load.
 */

import { getAllTenants, isActiveTenant } from "./tenants";
import { getActivity, listDrafts } from "./storage";
import { listThreads } from "./threads";
import { getWeeklyBrief } from "./weekly-brief";
import { getEffectiveSubscriptionStatus } from "./subscription";
import { getTenantLaunchReadinessResults } from "./production-readiness-rules";
import {
  buildTenantLaunchReadiness,
  tenantHasOwnerMessage,
  type LaunchReadinessStatus,
} from "./launch-readiness";
import { getTenantDeliveryModel } from "./custom-repos";
import { SCAFFOLD_PLAN_MONTHLY_PRICE_DOLLARS } from "./pricing";
import { buildOpsReport, type OpsReport } from "./ops";
import { getRedis } from "./redis";
import { getLatestSnapshots } from "./visibility/snapshots";
import { summarizeVisibility, type VisibilitySummary } from "./visibility/diagnose";

export interface TenantSnapshot {
  id: string;
  siteName: string;
  ownerName: string;
  ownerEmail?: string;
  active: boolean;
  deliveryModel: ReturnType<typeof getTenantDeliveryModel>;
  launchStatus: LaunchReadinessStatus;
  launchScore: number;
  launchCompleted: number;
  launchTotal: number;
  subscriptionStatus: string;
  draftCount: number;
  threadCount: number;
  hasOwnerMessage: boolean;
  hasWeeklyBrief: boolean;
  lastActivity: string | null;
  /** Latest AI-search / SERP visibility summary, if the cron has measured it. */
  visibility?: VisibilitySummary | null;
}

export interface PortfolioSnapshot {
  snapshotAt: string;
  tenantCount: number;
  activeTenantCount: number;
  archivedTenantCount: number;
  mrr: number;
  launchReadyCount: number;
  launchWatchCount: number;
  launchBlockedCount: number;
  totalDrafts: number;
  ops: OpsReport;
  tenants: TenantSnapshot[];
}

const PORTFOLIO_CACHE_KEY = "reb:portfolio:summary";
const PORTFOLIO_CACHE_TTL_SECONDS = 3600; // 1 hour; refreshed by the cron

/** Compute the live portfolio snapshot from source. */
export async function buildPortfolioSnapshot(): Promise<PortfolioSnapshot> {
  const ALL_TENANTS = await getAllTenants();
  const TENANTS = ALL_TENANTS.filter(isActiveTenant);
  const archivedTenantCount = ALL_TENANTS.length - TENANTS.length;

  const tenants: TenantSnapshot[] = await Promise.all(
    TENANTS.map(async (t) => {
      // Per-tenant reads are cache-bounded: getActivity, listDrafts, listThreads use time-limited
      // Redis keys; getWeeklyBrief, visibility snapshots use stored metadata. No unbounded SCAN.
      const [activity, drafts, threads, weeklyBrief, effectiveSubscriptionStatus, visibilitySnapshots] =
        await Promise.all([
          getActivity(t.id).catch(() => []),
          listDrafts(t.id).catch(() => ({} as Record<string, boolean>)),
          listThreads(t.id).catch(() => []),
          getWeeklyBrief(t.id).catch(() => null),
          getEffectiveSubscriptionStatus(t.id).catch(
            () => t.subscriptionStatus ?? "none"
          ),
          getLatestSnapshots(t.id, 1).catch(() => []),
        ]);
      const visibility = visibilitySnapshots[0]
        ? summarizeVisibility(visibilitySnapshots[0])
        : null;
      const infrastructure = getTenantLaunchReadinessResults(t);
      const launch = buildTenantLaunchReadiness({
        tenant: { ...t, subscriptionStatus: effectiveSubscriptionStatus },
        infrastructure,
        activity,
        threadCount: threads.length,
        hasOwnerMessage: tenantHasOwnerMessage(threads),
        draftCount: Object.keys(drafts).length,
        hasWeeklyBrief: Boolean(weeklyBrief),
      });
      return {
        id: t.id,
        siteName: t.siteName,
        ownerName: t.ownerName,
        ownerEmail: t.ownerEmail,
        active: t.active,
        deliveryModel: getTenantDeliveryModel(t),
        launchStatus: launch.status,
        launchScore: launch.score,
        launchCompleted: launch.completed,
        launchTotal: launch.total,
        subscriptionStatus: effectiveSubscriptionStatus,
        draftCount: Object.keys(drafts).length,
        threadCount: threads.length,
        hasOwnerMessage: tenantHasOwnerMessage(threads),
        hasWeeklyBrief: Boolean(weeklyBrief),
        lastActivity: activity[0]?.time ?? null,
        visibility,
      };
    })
  );

  const activeSubscriptions = TENANTS.filter(
    (t) => t.subscriptionStatus === "active"
  ).length;

  return {
    snapshotAt: new Date().toISOString(),
    tenantCount: TENANTS.length,
    activeTenantCount: TENANTS.filter((t) => t.active).length,
    archivedTenantCount,
    mrr: activeSubscriptions * SCAFFOLD_PLAN_MONTHLY_PRICE_DOLLARS,
    launchReadyCount: tenants.filter((t) => t.launchStatus === "ready").length,
    launchWatchCount: tenants.filter((t) => t.launchStatus === "watch").length,
    launchBlockedCount: tenants.filter((t) => t.launchStatus === "blocked").length,
    totalDrafts: tenants.reduce((sum, t) => sum + t.draftCount, 0),
    ops: await buildOpsReport(),
    tenants,
  };
}

/** Read the cached snapshot, or null on miss / no Redis. */
export async function getPortfolioSummary(): Promise<PortfolioSnapshot | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    return (await redis.get<PortfolioSnapshot>(PORTFOLIO_CACHE_KEY)) ?? null;
  } catch (err) {
    console.warn("[portfolio] cache read failed", err);
    return null;
  }
}

/** Write-through the snapshot. Best-effort; logs on failure. */
export async function setPortfolioSummary(snapshot: PortfolioSnapshot): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(PORTFOLIO_CACHE_KEY, snapshot, {
      ex: PORTFOLIO_CACHE_TTL_SECONDS,
    });
  } catch (err) {
    console.warn("[portfolio] cache write failed", err);
  }
}
