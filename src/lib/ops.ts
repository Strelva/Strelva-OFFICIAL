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
import { getAllTenants, getTenantConfig } from "./tenants";
import { getTenantPrimaryDomain } from "./tenant-urls";
import { getRecentFailures } from "./revalidate-client";
import { getEvents, getQueueCount } from "./events";

export interface OpsMetrics {
  webhookFailures: number;
  revalidationFailures: number;
  staleSmsApprovals: number;
  pendingEvents: Record<string, number>;
  totalPendingEvents: number;
  failedAiWrites: number;
  tenantDomainDrift: string[];
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
    pendingEvents: {},
    totalPendingEvents: 0,
    failedAiWrites: 0,
    tenantDomainDrift: [],
  };

  const revalidationFailures = await getRecentFailures();
  metrics.revalidationFailures = revalidationFailures.length;

  if (redis) {
    const failedWebhooks = await redis.keys("stripe:event:error:*");
    metrics.webhookFailures = failedWebhooks.length;

    const staleCutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const tenant of active) {
      const pendingKey = `sms:pending:${tenant.id}`;
      const pending = await redis.get<{ sentAt?: string; expiresAt?: string }>(pendingKey);
      if (pending?.sentAt) {
        const sentAtMs = new Date(pending.sentAt).getTime();
        if (sentAtMs < staleCutoff) {
          metrics.staleSmsApprovals++;
        }
      }
    }
  }

  for (const tenant of active) {
    const count = await getQueueCount(tenant.id);
    if (count > 0) {
      metrics.pendingEvents[tenant.id] = count;
      metrics.totalPendingEvents += count;
    }

    const events = await getEvents(tenant.id, { status: "auto_approved", limit: 100 });
    const failedWrites = events.filter(
      (e) => e.type === "content_update" && e.metadata?.error
    );
    metrics.failedAiWrites += failedWrites.length;
  }

  const envDomainMap: Record<string, string> = (() => {
    try {
      return JSON.parse(process.env.CUSTOM_DOMAIN_MAP || "{}");
    } catch {
      return {};
    }
  })();

  for (const tenant of active) {
    const config = await getTenantConfig(tenant.id);
    const primaryDomain = config ? getTenantPrimaryDomain(config) : null;
    if (primaryDomain) {
      const envTenant = envDomainMap[primaryDomain];
      if (envTenant && envTenant !== tenant.id) {
        metrics.tenantDomainDrift.push(
          `${primaryDomain}: config=${tenant.id}, env=${envTenant}`
        );
      }
      if (!envTenant && !primaryDomain.includes("strelva.com")) {
        metrics.tenantDomainDrift.push(
          `${primaryDomain}: missing from CUSTOM_DOMAIN_MAP`
        );
      }
    }
  }

  return {
    timestamp: new Date().toISOString(),
    activeTenants: active.length,
    metrics,
    revalidationFailures: revalidationFailures.slice(0, 10),
  };
}
