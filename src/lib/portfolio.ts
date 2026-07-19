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
import { mapPool } from "./concurrency";
import { getActivity, listDrafts } from "./storage";
import { listThreads } from "./threads";
import { getWeeklyBrief } from "./weekly-brief";
import { getEffectiveSubscriptionStatus } from "./subscription";
import { billingMonthlyCents } from "./billing-type";
import type { CommercialPlanKey, BillingType } from "./types";
import { getTenantLaunchReadinessResults } from "./production-readiness-rules";
import {
  buildTenantLaunchReadiness,
  tenantHasOwnerMessage,
  type LaunchReadinessStatus,
} from "./launch-readiness";
import { getTenantDeliveryModel } from "./custom-repos";

/**
 * Monthly recurring revenue in dollars, from the operator-set billing type.
 * A tenant contributes real revenue when it's on a tier (the tier price) or a
 * custom amount (the entered monthly $). Case studies and unset ("none") are $0.
 * This intentionally does NOT require a live Stripe subscription — managed clients
 * are commonly billed off-platform, so the billing type is the source of truth.
 */
export function computeMrrDollars(
  tenants: Array<{
    id: string;
    subscriptionStatus?: string;
    subscriptionPlan?: CommercialPlanKey;
    planMonthlyCents?: number;
    planOverride?: "founder_comp";
    billingType?: BillingType;
  }>,
): number {
  return tenants.reduce((sum, tenant) => sum + billingMonthlyCents(tenant) / 100, 0);
}
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

  // Bounded fan-out: a plain Promise.all over all tenants opens ~6 reads per
  // tenant at once (6N connections). mapPool caps tenants-in-flight so the
  // snapshot scales without a connection storm.
  const tenants: TenantSnapshot[] = await mapPool(TENANTS, 8, async (t) => {
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
    }
  );

  return {
    snapshotAt: new Date().toISOString(),
    tenantCount: TENANTS.length,
    activeTenantCount: TENANTS.filter((t) => t.active).length,
    archivedTenantCount,
    mrr: computeMrrDollars(TENANTS),
    launchReadyCount: tenants.filter((t) => t.launchStatus === "ready").length,
    launchWatchCount: tenants.filter((t) => t.launchStatus === "watch").length,
    launchBlockedCount: tenants.filter((t) => t.launchStatus === "blocked").length,
    totalDrafts: tenants.reduce((sum, t) => sum + t.draftCount, 0),
    ops: await buildOpsReport(),
    tenants,
  };
}

export type PortfolioSummaryState =
  | { availability: "available"; snapshot: PortfolioSnapshot }
  | { availability: "empty" | "unavailable"; snapshot: null };

/** Read the cached snapshot without conflating a genuine cache miss with an
 * unavailable cache. Operator surfaces use this richer state to avoid a false
 * "nothing needs attention" verdict during an outage. */
export async function getPortfolioSummaryState(): Promise<PortfolioSummaryState> {
  const redis = getRedis();
  if (!redis) return { availability: "unavailable", snapshot: null };
  try {
    const snapshot = await redis.get<PortfolioSnapshot>(PORTFOLIO_CACHE_KEY);
    return snapshot
      ? { availability: "available", snapshot }
      : { availability: "empty", snapshot: null };
  } catch (err) {
    console.warn("[portfolio] cache read failed", err);
    return { availability: "unavailable", snapshot: null };
  }
}

/** Compatibility read for non-operator callers that only need the snapshot. */
export async function getPortfolioSummary(): Promise<PortfolioSnapshot | null> {
  return (await getPortfolioSummaryState()).snapshot;
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
