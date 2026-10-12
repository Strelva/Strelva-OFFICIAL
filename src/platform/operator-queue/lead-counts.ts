import { getRedis } from "@/platform/infra/redis";
import { getSupabase } from "@/platform/infra/db/client";
import type { QueueBusinessLeadCount, QueueLink } from "./contracts";
import type { QueueTenant } from "./contracts";

/** Counts only: no names, messages or contact fields are read into the queue.
 * The durable copy and Redis index are deduplicated by original lead id. */
export async function readQueueLeadCounts(tenants: QueueTenant[], links: QueueLink[], now: number): Promise<QueueBusinessLeadCount[]> {
  const byTenant = new Map(links.map(link => [link.tenantId, link]));
  const groups = new Map<string, QueueBusinessLeadCount>();
  const cutoff = now - 7 * 86_400_000;
  const db = getSupabase();
  const redis = getRedis();
  for (const tenant of tenants) {
    const link = byTenant.get(tenant.id);
    const businessKey = link ? `w:${link.workspaceId}` : `t:${tenant.id}`;
    const group = groups.get(businessKey) ?? { businessKey, businessName: link?.workspaceName ?? tenant.siteName ?? tenant.id, lastSevenDays: 0, failure: null };
    groups.set(businessKey, group);
    try {
      if (!db || !redis) throw new Error("Client lead counts unavailable");
      const ids = new Set(await redis.zrange<string[]>(`leads:${tenant.id}`, cutoff, now, { byScore: true }));
      for (let offset = 0; ; offset += 500) {
        let query = db.from("tenant_leads").select("lead_id").gte("captured_at", new Date(cutoff).toISOString())
          .lte("captured_at", new Date(now).toISOString()).order("lead_id", { ascending: true });
        const stableId = tenant.stableId ?? link?.tenantStableId;
        query = stableId ? query.eq("tenant_stable_id", stableId) : query.eq("tenant_slug_at_capture", tenant.id);
        const page = await query.range(offset, offset + 499);
        if (page.error || !page.data) throw new Error("Client lead counts unavailable");
        for (const row of page.data) ids.add(row.lead_id);
        if (page.data.length < 500) break;
      }
      if (group.lastSevenDays !== null) group.lastSevenDays += ids.size;
    } catch {
      // Partial counts would look precise. A single unread site makes the
      // business total unknown, including a business with two client sites.
      group.lastSevenDays = null;
      group.failure = "Client lead counts could not be read";
    }
  }
  return [...groups.values()];
}
