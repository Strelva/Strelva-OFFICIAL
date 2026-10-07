import { z } from "zod";
import { inquiryRecordsEnabled, inquiryRecordsRpc } from "@/platform/infra/inquiry-records";
import { customerEmailEnabled, emailSendingEnabled } from "@/platform/infra/email/enabled";
import { getClientEmailOverride } from "@/platform/infra/email/client-override";
import { sendEmailWithReceipt, type SendEmailInput, type SendEmailResult } from "@/platform/infra/email/send";

const statusSchema = z.enum(["sending", "suppressed", "accepted", "delivered", "deferred", "bounced", "failed", "unknown"]);
const claimSchema = z.object({ acquired: z.boolean(), status: statusSchema, recipient: z.string().email().nullable(), tenantId: z.string().nullable() });
export interface ConnectedOwnerNoticeDependencies {
  rpc: typeof inquiryRecordsRpc;
  gates: (tenantId: string | null) => Promise<boolean>;
  send: (input: SendEmailInput) => Promise<SendEmailResult>;
}
const defaults: ConnectedOwnerNoticeDependencies = {
  rpc: inquiryRecordsRpc,
  gates: async (tenantId) => process.env.STRELVA_INQUIRY_OWNER_NOTICES === "1" && process.env.STRELVA_CONNECTED_SITE_EMAIL_ENABLED === "1"
    && emailSendingEnabled() && customerEmailEnabled() && (!tenantId || await getClientEmailOverride(tenantId) !== "off"),
  send: sendEmailWithReceipt,
};

/** The retained lead and one durable send claim precede provider work. A
 * failed checkpoint or unknown provider result can only be reconciled, never
 * sent again. All delivery evidence uses the connected origin, not a tenant. */
export async function notifyDurableConnectedInquiryOwner(input: {
  rowId: string; siteId: string; workspaceId: string; subject: string; options: SendEmailInput["options"];
}, deps = defaults): Promise<"sent" | "paused" | "no_recipient"> {
  const claim = claimSchema.parse(await deps.rpc("claim_connected_inquiry_owner_notice", {
    p_lead_row_id: input.rowId, p_site_id: input.siteId, p_workspace_id: input.workspaceId, p_subject: input.subject,
  }));
  if (!claim.acquired) return ["accepted", "delivered", "deferred"].includes(claim.status) ? "sent" : "paused";
  const finish = (status: z.infer<typeof statusSchema>, providerMessageId: string | null = null, acceptedAt: string | null = null) => deps.rpc("finish_connected_inquiry_owner_notice", {
    p_lead_row_id: input.rowId, p_status: status, p_provider_message_id: providerMessageId, p_accepted_at: acceptedAt,
  });
  if (!claim.recipient) { await finish("suppressed"); return "no_recipient"; }
  if (!(await deps.gates(claim.tenantId).catch(() => false))) { await finish("suppressed"); return "paused"; }
  let result: SendEmailResult;
  try {
    result = await deps.send({ audience: "client", ...(claim.tenantId ? { tenantId: claim.tenantId } : {}),
      to: claim.recipient, subject: input.subject, options: input.options!,
      idempotencyKey: `connected-inquiry:${input.rowId}`,
      tags: { strelva_connected_notice_id: input.rowId, strelva_workspace_id: input.workspaceId },
    });
  } catch {
    await finish("unknown").catch(() => undefined);
    return "paused";
  }
  if (result.status === "suppressed") { await finish("suppressed"); return "paused"; }
  await finish("accepted", result.providerMessageId, result.acceptedAt).catch(() => undefined);
  return "sent";
}

/** The shared webhook host verifies its signature first. SQL independently
 * correlates the exact business, recipient, subject and immutable provider id. */
export async function reconcileConnectedInquiryOwnerNotice(input: { event: unknown; eventId: string }, rpc = inquiryRecordsRpc): Promise<{ status: "recorded" | "duplicate" | "ignored" | "unmatched" | "unavailable"; reason?: string }> {
  if (!inquiryRecordsEnabled() || process.env.STRELVA_INQUIRY_OWNER_NOTICES !== "1") return { status: "ignored" };
  const event = input.event as { type?: unknown; created_at?: unknown; data?: { tags?: unknown; email_id?: unknown; created_at?: unknown; to?: unknown; subject?: unknown } } | null;
  const data = event?.data;
  if (!data || typeof data !== "object") return { status: "ignored" };
  const tags: Record<string, unknown> = {};
  if (Array.isArray(data.tags)) for (const entry of data.tags) {
    if (entry && typeof entry === "object" && typeof entry.name === "string") tags[entry.name] = entry.value;
  } else if (data.tags && typeof data.tags === "object") Object.assign(tags, data.tags);
  if (!tags.strelva_connected_notice_id) return { status: "ignored" };
  const statuses: Record<string, string> = { "email.sent": "accepted", "email.delivered": "delivered", "email.delivery_delayed": "deferred", "email.bounced": "bounced", "email.failed": "failed", "email.complained": "failed", "email.canceled": "failed", "email.suppressed": "suppressed" };
  const status = typeof event?.type === "string" ? statuses[event.type] : undefined;
  if (!status) return { status: "ignored" };
  const timestamp = z.string().refine(value => Number.isFinite(Date.parse(value)));
  const parsed = z.object({ id: z.string().uuid(), workspaceId: z.string().uuid(), providerId: z.string().trim().min(1).max(240),
    repairId: z.string().uuid().optional(),
    eventId: z.string().trim().min(1).max(240), at: timestamp, acceptedAt: timestamp.nullable(), to: z.array(z.string().email()).min(1), subject: z.string(),
  }).safeParse({ id: tags.strelva_connected_notice_id, workspaceId: tags.strelva_workspace_id, providerId: data.email_id,
    repairId: tags.strelva_connected_notice_repair_id,
    eventId: input.eventId, at: event?.created_at, acceptedAt: data.created_at ?? (event?.type === "email.sent" ? event.created_at : null),
    to: Array.isArray(data.to) ? data.to : [data.to], subject: data.subject });
  if (!parsed.success) return { status: "unmatched", reason: "connected_notice_provider_evidence_invalid" };
  const row = parsed.data;
  try {
    const result = await rpc(row.repairId ? "record_connected_inquiry_owner_notice_repair_event" : "record_connected_inquiry_owner_notice_event", { ...(row.repairId ? { p_repair_id: row.repairId } : {}), p_lead_row_id: row.id, p_workspace_id: row.workspaceId,
      p_provider_message_id: row.providerId, p_event_id: row.eventId, p_status: status, p_event_at: row.at,
      p_accepted_at: row.acceptedAt, p_recipients: row.to, p_subject: row.subject }) as { status?: unknown } | null;
    if (result?.status === "recorded" || result?.status === "duplicate" || result?.status === "unmatched") return { status: result.status };
  } catch { /* Keep a valid provider event retryable if its durable receipt failed. */ }
  return { status: "unavailable", reason: "connected_notice_provider_receipt_unavailable" };
}
