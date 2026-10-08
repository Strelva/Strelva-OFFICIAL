import { z } from "zod";
import { createHash } from "node:crypto";
import { getDomainHealth } from "@/platform/infra/domain-health";
import { readSiteHealth } from "@/platform/operator-queue/site-health-store";
import { CRON_MAX_AGE_SECONDS } from "@/platform/infra/heartbeat";
import { versionsDb, type VersionsDb } from "@/platform/system-versions/supabase-store";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { AgencyClientsPage, AgencyQueueItem } from "../agency-clients";

const uuid = z.string().uuid();
const contextSchema = z.object({
  workspaceIds: z.array(uuid),
  links: z.array(z.object({ workspaceId: uuid, tenantId: z.string().min(1), systemId: uuid })),
  alerts: z.array(z.object({ id: z.string(), workspaceId: uuid, systemId: uuid.nullable(), title: z.string(), since: z.string(), label: z.string(), gap: z.string().nullable().optional() })),
});

/** Current provider staff only. SQL checks relationship, seat, membership and
 * staffing before any cached portfolio evidence is read or projected. Receipts
 * are sanitized server-side: no secrets, payloads, provider errors or retries. */
export async function addAgencyProviderAlerts(actor: WorkspaceActor, page: AgencyClientsPage,
  db: VersionsDb = versionsDb(), ports = { domains: getDomainHealth, health: readSiteHealth }, now = Date.now()): Promise<AgencyClientsPage> {
  const candidates = page.clients.filter(client => client.status === "ready" && client.provider);
  if (!candidates.length) return page;
  const gaps = [...page.queueGaps ?? []];
  let context: z.infer<typeof contextSchema>;
  try {
    const { data, error } = await db.rpc("read_provider_health_alerts", {
      p_agency_workspace_id: page.agencyWorkspaceId, p_user_id: actor.userId,
      p_verified_email: actor.verifiedEmail.trim().toLowerCase(), p_workspace_ids: candidates.map(client => client.workspaceId),
    });
    if (error) throw error;
    context = contextSchema.parse(data);
  } catch {
    return { ...page, queueComplete: false, queueGaps: [...gaps, "Provider health alerts could not be read."] };
  }
  const clients = new Map(candidates.filter(client => context.workspaceIds.includes(client.workspaceId)).map(client => [client.workspaceId, client]));
  if (!clients.size) return page;
  const links = context.links.filter(link => clients.get(link.workspaceId)?.systems.some(system => system.id === link.systemId));
  const alerts: AgencyQueueItem[] = [];
  const add = (workspaceId: string, systemId: string | null, id: string, title: string, since: string, label: string) => {
    const client = clients.get(workspaceId);
    if (!client || (systemId && !client.systems.some(system => system.id === systemId))) return;
    const sourceId = id.length > 180 ? createHash("sha256").update(id).digest("hex") : id;
    alerts.push({ id: `provider:${sourceId}`, kind: "health", workspaceId, clientName: client.name, systemId, workId: null,
      title: title.slice(0, 300), since, label,
      href: systemId ? `/workspace?view=system&system=${encodeURIComponent(systemId)}&workspaceId=${encodeURIComponent(workspaceId)}`
        : `/workspace?workspaceId=${encodeURIComponent(workspaceId)}` });
  };
  for (const alert of context.alerts) {
    if (clients.has(alert.workspaceId) && (!alert.systemId || clients.get(alert.workspaceId)!.systems.some(system => system.id === alert.systemId)) && alert.gap) gaps.push(alert.gap);
    add(alert.workspaceId, alert.systemId, alert.id, alert.title, alert.since, alert.label);
  }
  if (!links.length) return { ...page, queue: [...page.queue, ...alerts], queueComplete: page.queueComplete !== false && !gaps.length, queueGaps: [...new Set(gaps)] };
  const fresh = (at: string, cron: "domain-monitor" | "website-health") => Number.isFinite(Date.parse(at)) && now >= Date.parse(at) && now - Date.parse(at) <= CRON_MAX_AGE_SECONDS[cron] * 1000;
  try {
    const snapshot = await ports.domains();
    if (!snapshot || !fresh(snapshot.scannedAt, "domain-monitor")) gaps.push("Provider domain evidence is missing or stale.");
    else for (const link of links) {
      const result = snapshot.results.find(row => row.tenantId === link.tenantId);
      if (!result?.checks.length) { gaps.push("A provider website has no domain evidence."); continue; }
      for (const check of result.checks) {
        if (["down", "parked", "unreachable"].includes(check.state)) add(link.workspaceId, link.systemId, `domain:${link.tenantId}:${check.host}`, `${check.host} is ${check.state}.`, check.checkedAt, "Domain");
        if (check.kind === "custom" && check.daysToExpiry != null && check.daysToExpiry <= 30) add(link.workspaceId, link.systemId, `expiry:${link.tenantId}:${check.host}`, `${check.host} registration ${check.daysToExpiry <= 0 ? "has expired" : `expires in ${check.daysToExpiry} days`}.`, check.checkedAt, "Domain expiry");
        if (check.sslDaysToExpiry != null && check.sslDaysToExpiry <= 30) add(link.workspaceId, link.systemId, `ssl:${link.tenantId}:${check.host}`, `${check.host} SSL certificate ${check.sslDaysToExpiry <= 0 ? "has expired" : `expires in ${check.sslDaysToExpiry} days`}.`, check.checkedAt, "SSL expiry");
      }
    }
  } catch { gaps.push("Provider domain evidence could not be read."); }
  try {
    const snapshot = await ports.health();
    if (!snapshot || !fresh(snapshot.checkedAt, "website-health")) gaps.push("Provider website health is missing or stale.");
    else for (const link of links) {
      const result = snapshot.results.find(row => row.tenantId === link.tenantId);
      if (!result) { gaps.push("A provider website has no health evidence."); continue; }
      if (result.status !== "healthy") add(link.workspaceId, link.systemId, `site:${link.tenantId}`, result.reasons[0]?.message ?? `Website health is ${result.status}.`, snapshot.checkedAt, "Site health");
    }
  } catch { gaps.push("Provider website health could not be read."); }
  return { ...page, queue: [...page.queue, ...alerts], queueComplete: page.queueComplete !== false && !gaps.length, queueGaps: [...new Set(gaps)] };
}
