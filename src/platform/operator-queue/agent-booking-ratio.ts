import { agentHoldRatioIsLow } from "@/platform/bookings/agent-proof";
import { readAgentHoldRatioCohorts } from "@/platform/bookings/store";
import type { QueueActor, QueueContext, QueueItemRaw } from "./contracts";
import type { SourceRead } from "./project";

const SOURCE = "Agent hold confirmations";
const PREFIX = "agent-hold-ratio:";
const REF = /^agent-hold-ratio:(workspace|tenant):([0-9a-f-]{36})$/;

/** A read projection over durable, aggregate-only evidence. No pause, email,
 * receipt or mark writes. One key per business survives scans and slug changes. */
export async function readAgentHoldRatioAlerts(
  actor: QueueActor,
  context: QueueContext | null,
  now: number,
  read: typeof readAgentHoldRatioCohorts = readAgentHoldRatioCohorts,
  tenants: readonly { id: string; stableId?: string }[] = [],
): Promise<SourceRead> {
  try {
    const cohorts = await read(actor, now);
    const rows: QueueItemRaw[] = [];
    const active = new Set<string>();
    for (const cohort of cohorts) {
      if (!agentHoldRatioIsLow(cohort)) continue;
      const sourceRef = `${PREFIX}${cohort.workspaceId ? "workspace" : "tenant"}:${cohort.businessId}`;
      active.add(sourceRef);
      rows.push({
        kind: "ops_alert", sourceRef, tenantId: cohort.tenantId, workspaceId: cohort.workspaceId,
        title: `Agent holds: ${cohort.customerConfirmed} of ${cohort.matureHolds} mature requests customer-confirmed in the past 24 hours`,
        openedAt: cohort.firstMaturedAt,
        facts: { severity: "medium", agentHoldRatio: true, newEvidenceAt: cohort.latestUnconfirmedMaturedAt },
        href: cohort.tenantId ? `/admin/clients/${encodeURIComponent(cohort.tenantId)}`
          : cohort.workspaceId ? `/admin/work?workspaceId=${encodeURIComponent(cohort.workspaceId)}` : "/admin",
      });
    }
    // A complete successful read can retire an acknowledged alert whose cohort
    // recovered or aged out. A failed read never manufactures recovery.
    for (const mark of context?.marks ?? []) {
      if (mark.source !== "ops_alert" || active.has(mark.sourceRef)) continue;
      const match = REF.exec(mark.sourceRef);
      if (!match) continue;
      const cohort = cohorts.find(row => row.businessId === match[2]);
      const link = context?.links.find(link => match[1] === "workspace" ? link.workspaceId === match[2] : link.tenantStableId === match[2]);
      const tenantId = cohort?.tenantId
        ?? tenants.find(tenant => tenant.stableId === match[2])?.id
        ?? link?.tenantId
        ?? null;
      // A retired/deleted unconverted tenant must not become a Strelva-wide
      // recovery row merely because its routing identity is no longer known.
      if (match[1] === "tenant" && !tenantId) continue;
      const superseded = match[1] === "tenant" && link && active.has(`${PREFIX}workspace:${link.workspaceId}`);
      rows.push({
        kind: "ops_alert", sourceRef: mark.sourceRef, tenantId,
        workspaceId: match[1] === "workspace" ? match[2]! : null,
        title: superseded ? "Agent hold observation now belongs to the linked business" : "Agent holds no longer meet the provisional alert threshold",
        openedAt: mark.updatedAt,
        facts: { severity: "medium", agentHoldRatio: true, closedElsewhere: { by: superseded ? "the business-scoped observation" : "the current aggregate check", at: new Date(now).toISOString() } },
        href: "/admin",
      });
    }
    return { kind: "ops_alert", source: SOURCE, ok: true, rows };
  } catch {
    // Database errors can contain private request details. Only a fixed reason
    // enters the operator list; unavailable is never an empty healthy result.
    return { kind: "ops_alert", source: SOURCE, ok: false, reason: "Agent hold confirmation evidence unavailable" };
  }
}
