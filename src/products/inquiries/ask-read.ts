import { assertWorkspaceMember } from "@/platform/workspaces/repository";
import { WorkspaceAccessError, type WorkspaceActor } from "@/platform/workspaces/types";
import { readWorkspaceLeads } from "./linked-leads";
import { getInquiryRepository, type InquiryRepository } from "./repository";
import { recordedInquiryStatus } from "./record-projection";
import { createRedisInquiryDeliveryStore } from "./delivery-store";
import type { InquiryDeliveryStore, InquiryDeliveryCheckpoint } from "./delivery-types";
import type { InquiryEngineState } from "./contracts";

export interface AskInquiryReadDependencies {
  member: typeof assertWorkspaceMember;
  leads: typeof readWorkspaceLeads;
  repository: Pick<InquiryRepository, "getSnapshot" | "getRecordOverlays">;
  delivery: Pick<InquiryDeliveryStore, "getCheckpoint" | "getReplyState">;
}
type AnswerState = "answered" | "unanswered" | "customer_replied" | "handled" | "needs_attention" | "unknown";
/** Capture/intake never proves answered. Only persisted message evidence does. */
export async function readAskInquirySummary(actor: WorkspaceActor, workspaceId: string, now = new Date(), deps: AskInquiryReadDependencies = {
  member: assertWorkspaceMember, leads: readWorkspaceLeads, repository: getInquiryRepository(), delivery: createRedisInquiryDeliveryStore(),
}) {
  await deps.member(actor, workspaceId);
  const since = new Date(now.getTime() - 30 * 86400000).toISOString();
  let inbox;
  try { inbox = await deps.leads(actor, workspaceId); }
  catch (error) {
    if (error instanceof WorkspaceAccessError) throw error;
    return { sourceProof: "Inquiry capture store unavailable; recent and unanswered counts are unknown.", readAt: now.toISOString(), range: { from: since, to: now.toISOString() }, complete: false, recentCount: null, unansweredCount: null, inquiries: [], held: { items: [], unavailable: true } };
  }
  const sources: Array<{ source: string; available: boolean; detail: string }> = [];
  const tenantState = new Map<string, { state: InquiryEngineState | null; overlays: Awaited<ReturnType<InquiryRepository["getRecordOverlays"]>>; available: boolean }>();
  for (const site of inbox.sites) {
    sources.push({ source: site.key, available: !site.unavailable && site.leads.length < 500, detail: site.unavailable ? "Capture records unavailable." : site.leads.length >= 500 ? "Capture retention cap reached; full count unknown." : "Capture records read now." });
    if (!site.tenantId || tenantState.has(site.tenantId)) continue;
    try {
      const [snapshot, overlays] = await Promise.all([deps.repository.getSnapshot(site.tenantId, workspaceId), deps.repository.getRecordOverlays(site.tenantId, workspaceId)]);
      if (snapshot && (snapshot.businessId !== workspaceId || snapshot.tenantId !== site.tenantId) || overlays.some(row => row.businessId !== workspaceId || row.tenantId !== site.tenantId)) throw new WorkspaceAccessError();
      tenantState.set(site.tenantId, { state: snapshot ? { ...snapshot.state, inquiries: [] } : null, overlays, available: true });
    } catch (error) {
      if (error instanceof WorkspaceAccessError) throw error;
      tenantState.set(site.tenantId, { state: null, overlays: [], available: false });
    }
  }
  const unique = new Map<string, { siteKey: string; tenantId: string | null; lead: (typeof inbox.sites)[number]["leads"][number] }>();
  for (const site of inbox.sites) for (const lead of site.leads) {
    if (Date.parse(lead.createdAt) < Date.parse(since) || Date.parse(lead.createdAt) > now.getTime()) continue;
    unique.set(`${site.key}:${lead.id}`, { siteKey: site.key, tenantId: site.tenantId, lead });
  }
  const inquiries = await Promise.all([...unique.values()].map(async ({ siteKey, tenantId, lead }) => {
    let answerState: AnswerState = "unknown";
    let evidence = "Message or native state could not be read; no answer state inferred from capture.";
    let acceptedAt: string | null = null;
    let deliveryStatus: string | null = null;
    const native = tenantId ? tenantState.get(tenantId) : null;
    const overlay = native?.overlays.find(row => row.inquiryId === lead.id);
    const recordStatus = native?.state ? recordedInquiryStatus(native.state, lead.id, overlay?.status ?? "new") : overlay?.status ?? null;
    if (tenantId && native?.available) {
      try {
        const [reply, message, customerReply] = await Promise.all([
          deps.delivery.getCheckpoint({ tenantId, inquiryId: lead.id, action: "reply" }),
          deps.delivery.getCheckpoint({ tenantId, inquiryId: lead.id, action: "send_message" }),
          deps.delivery.getReplyState({ tenantId, inquiryId: lead.id }),
        ]);
        const checkpoints = [reply, message].filter((row): row is InquiryDeliveryCheckpoint => row !== null);
        if (checkpoints.some(row => row.tenantId !== tenantId || row.inquiryId !== lead.id) || customerReply && (customerReply.tenantId !== tenantId || customerReply.inquiryId !== lead.id)) throw new WorkspaceAccessError();
        const latest = checkpoints.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];
        deliveryStatus = latest?.status ?? null;
        acceptedAt = latest?.acceptedAt ?? null;
        if (latest && ["unknown", "sending"].includes(latest.status)) { answerState = "unknown"; evidence = "Message acceptance is unresolved; do not retry or claim an answer."; }
        else if (latest && ["bounced", "suppressed", "failed", "deferred"].includes(latest.status)) { answerState = "needs_attention"; evidence = `Stored message delivery: ${latest.status}.`; }
        else if (latest && acceptedAt && ["accepted", "verified", "delivered", "accepted_unverified"].includes(latest.status)) {
          answerState = customerReply && Date.parse(customerReply.receivedAt) > Date.parse(acceptedAt) ? "customer_replied" : "answered";
          evidence = answerState === "customer_replied" ? "Customer replied after the last accepted outbound message; a new response is needed." : `Provider accepted the message at ${acceptedAt}; stored status ${latest.status}. Acceptance is not a delivery guarantee.`;
        } else if (recordStatus === "handled") { answerState = "handled"; evidence = "Native inquiry state is handled; this does not prove a message was sent."; }
        else { answerState = "unanswered"; evidence = "No accepted reply or message is recorded in the current delivery store for this recent inquiry."; }
      } catch (error) { if (error instanceof WorkspaceAccessError) throw error; }
    }
    return { ...lead, siteKey, tenantId, recordStatus, answerState, acceptedAt, deliveryStatus, evidence };
  }));
  inquiries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const complete = inbox.denied.length === 0 && sources.every(source => source.available) && !inquiries.some(row => row.answerState === "unknown");
  const needsResponse = inquiries.filter(row => row.answerState === "unanswered" || row.answerState === "customer_replied");
  return {
    sourceProof: "From inquiry capture records, native handled state and cached reply/message delivery evidence; read now, no provider calls. Counts cover the last 30 days within capture retention.",
    readAt: now.toISOString(), range: { from: since, to: now.toISOString(), definition: "Recent captures in the last 30 days. Unanswered means no accepted outbound message, or a newer customer reply; handled and failed delivery are separate." },
    complete, recentCount: sources.every(source => source.available) && inbox.denied.length === 0 ? inquiries.length : null,
    unansweredCount: complete ? needsResponse.length : null, observedUnanswered: needsResponse.length,
    needsAttentionCount: inquiries.filter(row => row.answerState === "needs_attention").length, unknownCount: inquiries.filter(row => row.answerState === "unknown").length,
    inquiries: inquiries.slice(0, 30), unanswered: needsResponse.slice(0, 30), held: inbox.held ?? { items: [], unavailable: true, reason: "Held-spam records are not enabled." }, sources,
  };
}
