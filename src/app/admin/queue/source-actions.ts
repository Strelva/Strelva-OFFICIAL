"use server";

import { revalidatePath } from "next/cache";
import { isSuperAdmin, requireTenantPermission } from "@/platform/infra/auth";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import { operatorQueueReleaseEnabled } from "@/platform/operator-queue/release";
import { readOperatorQueue } from "@/platform/operator-queue/service";
import { ServiceRequestService, PostgresServiceRequestStore, type ServiceRequest } from "@/platform/service-requests";
import type { QueueActionResult } from "./actions";

export type QueueSourceAction = "retry_lead" | "check_health" | "check_domain" | "accept_request" | "decline_request" | "triage" | "quote";

async function source(key: string) {
  if (!operatorQueueReleaseEnabled()) throw new Error("Queue actions are not enabled.");
  if (!(await isSuperAdmin())) throw new Error("Operators only.");
  const actor = await workspaceHttpActor();
  if (!actor) throw new Error("Operators only.");
  const queue = await readOperatorQueue(actor);
  const item = queue.items.find(row => row.key === key);
  if (!item || item.closed || item.closedElsewhere) throw new Error("This item changed. Refresh the queue.");
  return { actor, item };
}

/** Read the native request before deciding it; scope and the reviewed revision
 * stay visible in the queue. Provider acceptance does not agree a deadline. */
export async function readQueueServiceRequestAction(key: string): Promise<{ ok: true; request: ServiceRequest } | { ok: false; message: string }> {
  try {
    const { actor, item } = await source(key);
    if (item.kind !== "service_request" || item.business.kind !== "workspace") throw new Error("Choose a service request.");
    const request = await new ServiceRequestService(PostgresServiceRequestStore).read(actor, item.sourceRef);
    if (request.businessId !== item.business.workspaceId || request.provider.kind !== "strelva") throw new Error("The request changed business or provider.");
    return { ok: true, request };
  } catch { return { ok: false, message: "The request could not be read. Nothing was decided." }; }
}

/** Only server-derived source identities reach the existing governed paths.
 * Checks are read-only toward providers; retries copy data, never notify anyone. */
export async function runQueueSourceAction(input: { key: string; action: QueueSourceAction; commandId: string; expectedRevision?: number }): Promise<QueueActionResult> {
  if (!operatorQueueReleaseEnabled()) return { ok: false, message: "Queue actions are not enabled." };
  try {
    const { actor, item } = await source(input.key);
    const tenantId = item.business.kind === "strelva" ? null : item.business.tenantId;
    let message: string;
    if (input.action === "retry_lead" && item.kind === "lead_unkept" && tenantId) {
      const { parsePendingMember, mirrorLead, clearLeadMirrorPending } = await import("@/lib/lead-mirror");
      const { getRedisLeadById, leadSubmissionHash } = await import("@/lib/leads");
      const ref = parsePendingMember(item.sourceRef);
      if (!ref || ref.tenant !== tenantId) throw new Error("The lead belongs to another business.");
      const lead = await getRedisLeadById(tenantId, ref.leadId);
      if (!lead) throw new Error("The original lead could not be read. Its pending record was kept.");
      const result = await mirrorLead(tenantId, lead, leadSubmissionHash(lead), { via: "repair" });
      if (!["recorded", "exists", "duplicate"].includes(result.status)) throw new Error("The lead copy is still unconfirmed. Its pending record was kept.");
      await clearLeadMirrorPending(tenantId, ref.leadId);
      message = "Lead kept in Postgres. No notification sent.";
    } else if (input.action === "check_health" && item.kind === "site_health" && item.sourceRef.startsWith("document:") && item.business.kind === "workspace") {
      const { websiteDocumentStore, checkWebsiteHealth, currentHostedUrl } = await import("@/products/websites/index");
      const { ROOT_DOMAIN } = await import("@/platform/infra/brand");
      // Publication data and provider URL are read server-side. A workspace
      // health item need not have a tenant_workspace_links row to be checked.
      const target = (await websiteDocumentStore.listPublished()).find(row => row.workspaceId === (item.business.kind === "workspace" ? item.business.workspaceId : null)
        && item.sourceRef === `document:${row.workId}:${row.revision}`);
      if (!target?.tenantId) throw new Error("The published site changed. Refresh before checking it.");
      const receipt = await checkWebsiteHealth({ workspaceId: target.workspaceId, workId: target.workId, tenantId: target.tenantId,
        revision: target.revision, contentHash: target.contentHash, url: currentHostedUrl({ tenantId: target.tenantId, receipt: target.receipt }, ROOT_DOMAIN) });
      await websiteDocumentStore.recordHealth(receipt);
      message = receipt.status === "healthy" ? "Published revision read back and matched." : `Health check saved: ${receipt.status.replaceAll("_", " ")}. The site still needs attention.`;
    } else if (input.action === "check_health" && item.kind === "site_health" && tenantId) {
      const { POST } = await import("@/app/api/admin/scan/route");
      const response = await POST(new Request("http://localhost/api/admin/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tenant: tenantId }) }));
      if (!response.ok) throw new Error("The site scan could not be confirmed.");
      message = "Site scan saved. The next health run updates the coverage result.";
    } else if (input.action === "check_domain" && item.kind === "domain_unverified" && tenantId) {
      const { refreshDomainClaim } = await import("@/lib/domains");
      const prefix = `${tenantId}:`;
      if (!item.sourceRef.startsWith(prefix)) throw new Error("The domain belongs to another business.");
      const result = await refreshDomainClaim(tenantId, item.sourceRef.slice(prefix.length));
      if (!result.ok) throw new Error("The domain check could not be confirmed.");
      message = "Domain verification checked. No DNS changes made.";
    } else if (input.action === "check_domain" && item.kind === "domain_alert") {
      const { POST } = await import("@/app/api/admin/domain-monitor/scan/route");
      if (!(await POST()).ok) throw new Error("The domain scan could not be confirmed.");
      message = "Portfolio domain checks saved. No DNS changes made.";
    } else if ((input.action === "accept_request" || input.action === "decline_request") && item.kind === "service_request" && item.business.kind === "workspace") {
      const service = new ServiceRequestService(PostgresServiceRequestStore);
      const request = await service.read(actor, item.sourceRef);
      if (request.businessId !== item.business.workspaceId || request.provider.kind !== "strelva" || request.status !== "requested" || request.providerAcceptance.status !== "pending" || request.revision !== input.expectedRevision) throw new Error("The request changed. Review it again before deciding.");
      await service.execute(actor, { action: "respond", requestId: request.id, expectedRevision: input.expectedRevision,
        decision: input.action === "accept_request" ? "accepted" : "declined", idempotencyKey: input.commandId });
      message = input.action === "accept_request" ? "Strelva accepted the request. Scope and deadline still need agreement." : "Strelva declined the request.";
    } else if ((input.action === "triage" || input.action === "quote") && item.kind === "change_request" && tenantId && item.sourceRef.startsWith("event:")) {
      const { getEventRaw } = await import("@/lib/events");
      const { decideTenantEventAsOperator, verifiedOperator } = await import("@/lib/operator-decisions");
      const { requireActiveSubscription } = await import("@/lib/subscription");
      const eventId = item.sourceRef.slice(6);
      const event = await getEventRaw(eventId);
      if (!event || event.tenantId !== tenantId || event.type !== "change_request" || event.status !== "pending") throw new Error("The change request changed. Refresh it.");
      if (await requireTenantPermission(tenantId, "publishing:manage") || await requireActiveSubscription(tenantId)) throw new Error("This account cannot advance the change request.");
      // Recorded as the operator, with audit rows around the step.
      const operator = await verifiedOperator();
      if (!operator || operator.userId !== actor.userId) throw new Error("Operators only.");
      const step = input.action === "triage" ? "triaged" : "quoted";
      const result = await decideTenantEventAsOperator(operator, { tenantId, eventId, action: step, auditAction: `queue.request.${step}`, accept: (current) => current.type === "change_request" });
      if (!result.changed) throw new Error(result.reason ?? "The request was not changed.");
      message = input.action === "triage" ? "Request triaged." : "Request moved to quote required. No price or payment was agreed.";
    } else throw new Error("This action does not match the queue item.");
    revalidatePath("/admin/queue"); revalidatePath("/admin");
    return { ok: true, message };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "The source action could not be confirmed. Refresh before trying again." }; }
}
