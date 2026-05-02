import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/auth";
import { getRedis } from "@/lib/redis";
import { getAllTenants, getTenantConfig } from "@/lib/tenants";
import { getRecentFailures } from "@/lib/revalidate-client";
import { getEvents, getQueueCount } from "@/lib/events";

interface OpsMetrics {
  webhookFailures: number;
  revalidationFailures: number;
  staleSmsApprovals: number;
  pendingEvents: Record<string, number>;
  totalPendingEvents: number;
  failedAiWrites: number;
  tenantDomainDrift: string[];
}

export async function GET() {
  const admin = await isSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
    if (config?.productionDomain) {
      const envTenant = envDomainMap[config.productionDomain];
      if (envTenant && envTenant !== tenant.id) {
        metrics.tenantDomainDrift.push(
          `${config.productionDomain}: config=${tenant.id}, env=${envTenant}`
        );
      }
      if (!envTenant && !config.productionDomain.includes("scaffoldweb.com")) {
        metrics.tenantDomainDrift.push(
          `${config.productionDomain}: missing from CUSTOM_DOMAIN_MAP`
        );
      }
    }
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    activeTenants: active.length,
    metrics,
    revalidationFailures: revalidationFailures.slice(0, 10),
  });
}
