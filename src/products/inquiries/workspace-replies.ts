import { createHash } from "node:crypto";
import { z } from "zod";
import { inquiryRecordsEnabled, inquiryRecordsRpc } from "@/platform/infra/inquiry-records";
import { WorkspaceAccessError, WorkspaceConflictError, type WorkspaceActor } from "@/platform/workspaces/types";
import { customerEmailEnabled, emailSendingEnabled } from "@/platform/infra/email/enabled";
import { getClientEmailOverride } from "@/platform/infra/email/client-override";
import { CLIENT_MAIL_DOMAIN, getEmailReadback, sendEmailWithReceipt, type SendEmailInput, type SendEmailResult, type EmailReadbackResult } from "@/platform/infra/email/send";

export function workspaceInquiryRepliesEnabled(env = process.env): boolean {
  return env.STRELVA_INQUIRY_REPLIES === "1" && inquiryRecordsEnabled(env);
}
export const workspaceReplyInput = z.object({
  workspaceId: z.string().uuid(), rowId: z.string().uuid(), requestId: z.string().uuid(),
  subject: z.string().trim().min(1).max(200).refine((value) => !/[\r\n]/.test(value)),
  body: z.string().trim().min(1).max(5000),
}).strict();
export type WorkspaceReplyInput = z.infer<typeof workspaceReplyInput>;
const statuses = z.enum(["sending", "suppressed", "accepted", "delivered", "deferred", "bounced", "failed", "unknown"]);
export type WorkspaceReplyStatus = z.infer<typeof statuses>;
const claimSchema = z.object({
  acquired: z.boolean(), id: z.string().uuid(), status: statuses,
  recipient: z.string().email(), subject: z.string(), body: z.string(), tenantId: z.string().nullable(),
  replyTo: z.string().email().nullable(), businessName: z.string(),
  providerMessageId: z.string().nullable(), acceptedAt: z.string().nullable(),
});
export interface WorkspaceReplyOutcome { status: WorkspaceReplyStatus; providerMessageId: string | null; acceptedAt: string | null; retryable: false }
export interface WorkspaceReplyDependencies {
  rpc: typeof inquiryRecordsRpc;
  enabled: () => boolean;
  gates: (tenantId: string | null) => Promise<boolean>;
  send: (input: SendEmailInput) => Promise<SendEmailResult>;
  readback: (id: string) => Promise<EmailReadbackResult>;
}
const defaults: WorkspaceReplyDependencies = {
  rpc: inquiryRecordsRpc,
  enabled: workspaceInquiryRepliesEnabled,
  gates: async (tenantId) => emailSendingEnabled() && customerEmailEnabled()
    && (!tenantId || await getClientEmailOverride(tenantId) !== "off"),
  send: sendEmailWithReceipt,
  readback: getEmailReadback,
};

/** Owner-written text is an explicit owner decision, including any commitment.
 * SQL rechecks membership, record scope, intake state and pause before claiming.
 * Once claimed it cannot become a sendable retry, even if the provider or DB times out. */
export async function replyFromWorkspace(actor: WorkspaceActor, raw: WorkspaceReplyInput, dependencies = defaults): Promise<WorkspaceReplyOutcome> {
  if (!dependencies.enabled()) return { status: "suppressed", providerMessageId: null, acceptedAt: null, retryable: false };
  const input = workspaceReplyInput.parse(raw);
  const digest = createHash("sha256").update(JSON.stringify([input.rowId, input.subject, input.body])).digest("hex");
  let claim: z.infer<typeof claimSchema>;
  try {
    claim = claimSchema.parse(await dependencies.rpc("claim_workspace_inquiry_reply", {
      p_workspace_id: input.workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail,
      p_lead_row_id: input.rowId, p_request_id: input.requestId, p_digest: digest, p_subject: input.subject, p_body: input.body,
    }, () => new WorkspaceAccessError()));
  } catch (error) {
    if (error instanceof Error && /inquiry_reply_|workspace_exit_future_work_blocked/.test(error.message)) {
      throw new WorkspaceConflictError("This inquiry changed, is paused, or cannot be replied to. Reload before trying again.");
    }
    throw error;
  }
  const outcome = (status: WorkspaceReplyStatus, providerMessageId = claim.providerMessageId, acceptedAt = claim.acceptedAt): WorkspaceReplyOutcome => ({ status, providerMessageId, acceptedAt, retryable: false });
  if (!claim.acquired) return outcome(claim.status);
  async function finish(status: WorkspaceReplyStatus, providerMessageId: string | null = null, acceptedAt: string | null = null) {
    await dependencies.rpc("finish_workspace_inquiry_reply", { p_message_id: claim.id, p_status: status, p_provider_message_id: providerMessageId, p_accepted_at: acceptedAt });
    return outcome(status, providerMessageId, acceptedAt);
  }
  if (!(await dependencies.gates(claim.tenantId))) return finish("suppressed");
  let sent: SendEmailResult;
  try {
    sent = await dependencies.send({
      audience: "customer", tenantId: claim.tenantId ?? undefined,
      to: claim.recipient, subject: claim.subject,
      fromName: `${claim.businessName} via Strelva`, fromAddress: `hello@${CLIENT_MAIL_DOMAIN}`,
      ...(claim.replyTo ? { replyTo: claim.replyTo } : {}),
      options: { heading: claim.subject, paragraphs: [claim.body], footerNote: `Sent by Strelva for ${claim.businessName}, approved by the business owner.` },
      idempotencyKey: `inquiry-workspace-${claim.id}`,
    });
  } catch {
    // A rejected request can still have reached the provider. No send retry.
    await finish("unknown").catch(() => undefined);
    return outcome("unknown", null, null);
  }
  if (sent.status === "suppressed") return finish("suppressed");
  try {
    await finish("accepted", sent.providerMessageId, sent.acceptedAt);
  } catch {
    // The provider receipt remains evidence even when its local checkpoint failed.
    return outcome("accepted", sent.providerMessageId, sent.acceptedAt);
  }
  let readback: EmailReadbackResult;
  try { readback = await dependencies.readback(sent.providerMessageId); } catch { return outcome("accepted", sent.providerMessageId, sent.acceptedAt); }
  if (readback.status !== "available" || readback.providerMessageId !== sent.providerMessageId || readback.subject !== claim.subject
    || !readback.to.some((email) => email.trim().toLowerCase() === claim.recipient.toLowerCase())) return outcome("accepted", sent.providerMessageId, sent.acceptedAt);
  const status: WorkspaceReplyStatus = ["delivered", "opened", "clicked"].includes(readback.lastEvent) ? "delivered"
    : readback.lastEvent === "bounced" ? "bounced" : readback.lastEvent === "delivery_delayed" ? "deferred"
      : ["failed", "canceled", "complained"].includes(readback.lastEvent) ? "failed" : "accepted";
  if (status !== "accepted") await finish(status, sent.providerMessageId, sent.acceptedAt).catch(() => undefined);
  return outcome(status, sent.providerMessageId, sent.acceptedAt);
}
