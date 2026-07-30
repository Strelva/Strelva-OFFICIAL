/**
 * Operational health aggregation, shared by the admin ops route and the
 * portfolio snapshot. Surfaces the things that are otherwise invisible:
 * webhook failures, revalidation failures, stale SMS approvals, the pending
 * event queue, failed AI writes, and tenant domain drift.
 *
 * Extracted from src/app/api/admin/ops/route.ts so the cron-built portfolio
 * brain and the live ops endpoint compute the same numbers from one place.
 */

import { getRedis } from "./redis";
import { getAllTenants } from "./tenants";
import { getTenantPrimaryDomain } from "./tenant-urls";
import { getRecentFailures } from "./revalidate-client";
import { getEvents, getQueueCount } from "./events";
import { mapPool } from "./concurrency";

/**
 * Count keys matching a pattern without the blocking `KEYS` command. KEYS scans
 * the whole keyspace in one shot and can stall Redis once a prefix accumulates
 * thousands of entries (the failed-webhook prefix has a 30d TTL). SCAN iterates
 * in bounded chunks; cap the work so a runaway prefix can't make this unbounded.
 */
async function scanKeyCount(
  redis: NonNullable<ReturnType<typeof getRedis>>,
  pattern: string,
  cap = 10000
): Promise<number> {
  let cursor = "0";
  let count = 0;
  let iterations = 0;
  do {
    const [next, keys] = await redis.scan(cursor, { match: pattern, count: 250 });
    cursor = String(next);
    count += keys.length;
    if (++iterations >= 100 || count >= cap) break;
  } while (cursor !== "0");
  return count;
}

/** One domain-drift finding, carrying the tenant so the ops board can deep-link it. */
export interface DomainDriftItem {
  tenantId: string;
  message: string;
}

export interface FailedAiWriteItem {
  tenantId: string;
  title: string;
  error: string;
}

export interface StaleSmsItem {
  tenantId: string;
  sentAt: string;
}

export interface OpsMetrics {
  webhookFailures: number;
  revalidationFailures: number;
  staleSmsApprovals: number;
  /** Tenants with stale SMS approvals, for the drilldown list. */
  staleSmsItems?: StaleSmsItem[];
  pendingEvents: Record<string, number>;
  totalPendingEvents: number;
  failedAiWrites: number;
  /** Failed AI write events, for the drilldown list. */
  failedAiWriteItems?: FailedAiWriteItem[];
  /** Human-readable drift lines (kept for the count + attention feed). */
  tenantDomainDrift: string[];
  /** Same drift, structured so each row links into `/admin/clients/[id]`. Always
   * populated by `buildOpsReport`; optional so existing snapshot fixtures stay valid. */
  domainDrift?: DomainDriftItem[];
}

type RecentFailure = Awaited<ReturnType<typeof getRecentFailures>>[number];

export interface OpsReport {
  timestamp: string;
  activeTenants: number;
  metrics: OpsMetrics;
  /** Most recent revalidation failures (capped) for display. */
  revalidationFailures: RecentFailure[];
}

/**
 * Compute the full operational report. Null-safe on Redis; degrades to the
 * non-Redis subset rather than throwing.
 */
export async function buildOpsReport(): Promise<OpsReport> {
  const redis = getRedis();
  const tenants = await getAllTenants();
  const active = tenants.filter((t) => t.active);

  const metrics: OpsMetrics = {
    webhookFailures: 0,
    revalidationFailures: 0,
    staleSmsApprovals: 0,
    staleSmsItems: [],
    pendingEvents: {},
    totalPendingEvents: 0,
    failedAiWrites: 0,
    failedAiWriteItems: [],
    tenantDomainDrift: [],
  };

  const revalidationFailures = await getRecentFailures();
  metrics.revalidationFailures = revalidationFailures.length;

  if (redis) {
    metrics.webhookFailures = await scanKeyCount(redis, "stripe:event:error:*");
  }

  const envDomainMap: Record<string, string> = (() => {
    try {
      return JSON.parse(process.env.CUSTOM_DOMAIN_MAP || "{}");
    } catch {
      return {};
    }
  })();

  // Collapse the three former serial loops into one concurrent pass (concurrency=8).
  // Previously: 3 separate for...of loops → ~3 sequential Redis round trips per
  // tenant. Now: all per-tenant work runs in parallel with a bounded concurrency
  // cap so Redis/HTTP connections don't storm at scale.
  const staleCutoff = Date.now() - 24 * 60 * 60 * 1000;
  type PerTenantResult = {
    staleSms?: StaleSmsItem;
    pendingCount: number;
    failedWrites: FailedAiWriteItem[];
    drift?: DomainDriftItem;
  };

  const perTenantResults = await mapPool(active, 8, async (tenant): Promise<PerTenantResult> => {
    const result: PerTenantResult = { pendingCount: 0, failedWrites: [] };

    // SMS stale-approval check
    if (redis) {
      const pendingKey = `sms:pending:${tenant.id}`;
      const pending = await redis.get<{ sentAt?: string; expiresAt?: string }>(pendingKey).catch(() => null);
      if (pending?.sentAt) {
        const sentAtMs = new Date(pending.sentAt).getTime();
        if (sentAtMs < staleCutoff) {
          result.staleSms = { tenantId: tenant.id, sentAt: pending.sentAt };
        }
      }
    }

    // Queue count + failed AI writes
    const [count, events] = await Promise.all([
      getQueueCount(tenant.id),
      getEvents(tenant.id, { status: "auto_approved", limit: 100 }),
    ]);
    result.pendingCount = count;
    const failedWriteEvents = events.filter(
      (e) => e.type === "content_update" && e.metadata?.error
    );
    for (const e of failedWriteEvents) {
      result.failedWrites.push({
        tenantId: tenant.id,
        title: e.title,
        error: String(e.metadata!.error),
      });
    }

    // Domain drift — tenant is already fully hydrated from getAllTenants(), so
    // use it directly instead of re-fetching via getTenantConfig().
    const primaryDomain = getTenantPrimaryDomain(tenant);
    if (primaryDomain) {
      const envTenant = envDomainMap[primaryDomain];
      if (envTenant && envTenant !== tenant.id) {
        result.drift = {
          tenantId: tenant.id,
          message: `${primaryDomain}: config=${tenant.id}, env=${envTenant}`,
        };
      } else if (!envTenant && !primaryDomain.includes("strelva.com")) {
        result.drift = {
          tenantId: tenant.id,
          message: `${primaryDomain}: missing from CUSTOM_DOMAIN_MAP`,
        };
      }
    }

    return result;
  });

  // Aggregate per-tenant results into the metrics object.
  // mapPool preserves input order, so perTenantResults[i] corresponds to active[i].
  const domainDrift: DomainDriftItem[] = [];
  for (let i = 0; i < active.length; i++) {
    const r = perTenantResults[i]!;
    if (r.staleSms) {
      metrics.staleSmsApprovals++;
      metrics.staleSmsItems!.push(r.staleSms);
    }
    if (r.pendingCount > 0) {
      metrics.pendingEvents[active[i]!.id] = r.pendingCount;
      metrics.totalPendingEvents += r.pendingCount;
    }
    metrics.failedAiWrites += r.failedWrites.length;
    metrics.failedAiWriteItems!.push(...r.failedWrites);
    if (r.drift) domainDrift.push(r.drift);
  }

  metrics.domainDrift = domainDrift;
  metrics.tenantDomainDrift = domainDrift.map((d) => d.message);

  return {
    timestamp: new Date().toISOString(),
    activeTenants: active.length,
    metrics,
    revalidationFailures: revalidationFailures.slice(0, 10),
  };
}
