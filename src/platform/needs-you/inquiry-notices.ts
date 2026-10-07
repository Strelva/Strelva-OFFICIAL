import { z } from "zod";
import { inquiryRecordsEnabled, inquiryRecordsRpc } from "@/platform/infra/inquiry-records";

export interface InquiryNoticeProviderResult { status: "recorded" | "duplicate" | "ignored" | "unmatched" | "unavailable"; reason?: string }

/** The shared webhook verifies the signature before this bounded receipt-only
 * path. No provider report can acquire or release a send purpose. */
export async function reconcileInquiryDecisionNotice(input: { event: unknown; eventId: string }, deps = {
  enabled: () => inquiryRecordsEnabled() && process.env.STRELVA_INQUIRY_OWNER_NOTICES === "1",
  rpc: inquiryRecordsRpc,
}): Promise<InquiryNoticeProviderResult> {
  if (!deps.enabled()) return { status: "ignored" };
  const payload = input.event && typeof input.event === "object" ? input.event as Record<string, unknown> : null;
  const data = payload?.data && typeof payload.data === "object" ? payload.data as Record<string, unknown> : null;
  if (!data) return { status: "ignored" };
  const tags: Record<string, unknown> = {};
  if (Array.isArray(data.tags)) for (const item of data.tags) {
    if (item && typeof item === "object" && typeof item.name === "string") tags[item.name] = item.value;
  } else if (data.tags && typeof data.tags === "object") Object.assign(tags, data.tags);
  if (!tags.strelva_inquiry_decision_id) return { status: "ignored" };
  const statuses: Record<string, string> = { "email.sent": "accepted", "email.delivered": "delivered", "email.delivery_delayed": "deferred",
    "email.bounced": "bounced", "email.failed": "failed", "email.complained": "failed", "email.canceled": "failed", "email.suppressed": "suppressed" };
  const status = typeof payload?.type === "string" ? statuses[payload.type] : undefined;
  if (!status) return { status: "ignored" };
  const time = z.string().refine(value => Number.isFinite(Date.parse(value)));
  const parsed = z.object({ decisionId: z.string().uuid(), workspaceId: z.string().uuid(), providerId: z.string().trim().min(1).max(240),
    eventId: z.string().trim().min(1).max(240), at: time, acceptedAt: time.nullable(), recipients: z.array(z.string().email()).min(1), subject: z.string(),
  }).safeParse({ decisionId: tags.strelva_inquiry_decision_id, workspaceId: tags.strelva_workspace_id, providerId: data.email_id,
    eventId: input.eventId, at: payload?.created_at, acceptedAt: data.created_at ?? (payload?.type === "email.sent" ? payload.created_at : null),
    recipients: Array.isArray(data.to) ? data.to : [data.to], subject: data.subject });
  if (!parsed.success) return { status: "unmatched", reason: "inquiry_decision_notice_evidence_invalid" };
  const row = parsed.data;
  try {
    const result = await deps.rpc("record_inquiry_decision_notice_event", { p_decision_id: row.decisionId, p_workspace_id: row.workspaceId,
      p_provider_message_id: row.providerId, p_event_id: row.eventId, p_status: status, p_event_at: row.at,
      p_accepted_at: row.acceptedAt, p_recipients: row.recipients, p_subject: row.subject }) as { status?: unknown } | null;
    if (result?.status === "recorded" || result?.status === "duplicate" || result?.status === "unmatched") return { status: result.status };
  } catch { /* A valid provider report stays retryable until its receipt lands. */ }
  return { status: "unavailable", reason: "inquiry_decision_notice_receipt_unavailable" };
}
