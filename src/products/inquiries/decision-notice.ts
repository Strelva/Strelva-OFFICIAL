import { inquiryReleaseEnabledForTenant } from "./release";
import { getEventsRaw } from "@/lib/events";
import { inquiryRecordsRpc } from "@/platform/infra/inquiry-records";
import { needsYouReleaseEnabled } from "@/platform/needs-you/release";
import { tenantEventItem } from "@/platform/needs-you/adapters";
import type { LeadRecord } from "@/lib/leads";
import type { UnifiedEvent } from "@/lib/types";

export interface InquiryDecisionNoticeDependencies {
  released(tenantId: string): Promise<boolean>;
  events(tenantId: string): Promise<UnifiedEvent[]>;
  workspace(tenantId: string): Promise<string | null>;
  deliver(workspaceId: string, sourceId: string, notice: { name: string; message: string | null }): Promise<"sent" | "suppressed" | "failed" | "none">;
}
const defaults: InquiryDecisionNoticeDependencies = {
  released: inquiryReleaseEnabledForTenant,
  events: (tenantId) => getEventsRaw(tenantId, { status: "pending", limit: 1000 }),
  workspace: async (tenantId) => {
    const context = await inquiryRecordsRpc("read_inquiry_business_context", { p_tenant_id: tenantId }) as { workspaceId?: unknown } | null;
    return typeof context?.workspaceId === "string" ? context.workspaceId : null;
  },
  deliver: async (workspaceId, sourceId, notice) => {
    const { needsYouService } = await import("@/platform/needs-you/server");
    return needsYouService().deliverUrgentSource(workspaceId, "tenant_event", sourceId, notice);
  },
};

/** A pending owner draft at notice time travels with the inquiry in one email.
 * The same Needs you source owns the revision, signed link and send identity. */
export async function notifyPreparedInquiryDecision(tenantId: string, lead: LeadRecord, deps = defaults): Promise<"sent" | "suppressed" | "failed" | "none"> {
  if (process.env.STRELVA_INQUIRY_OWNER_NOTICES !== "1" || !needsYouReleaseEnabled()) return "none";
  if (!(await deps.released(tenantId))) return "none";
  const event = (await deps.events(tenantId)).find(event => event.tenantId === tenantId && event.status === "pending"
    && event.metadata?.kind === "inquiry_delivery_approval" && event.metadata?.inquiryId === lead.id
    && event.metadata?.action !== "owner_notification" && tenantEventItem(event)?.route === "owner_decides");
  if (!event) return "none";
  const workspaceId = await deps.workspace(tenantId);
  if (!workspaceId) return "none";
  return deps.deliver(workspaceId, `${tenantId}:${event.id}`, { name: lead.name, message: lead.message ?? null });
}
