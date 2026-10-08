import { z } from "zod";
import { inquiryRecordsEnabled, inquiryRecordsRpc } from "@/platform/infra/inquiry-records";
import { customerEmailEnabled, emailSendingEnabled } from "@/platform/infra/email/enabled";
import { getClientEmailOverride } from "@/platform/infra/email/client-override";
import { sendEmailWithReceipt, type SendEmailInput, type SendEmailResult } from "@/platform/infra/email/send";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { connectedInquiryEmail } from "./notify";

const statuses = z.enum(["sending","suppressed","accepted","delivered","deferred","bounced","failed","unknown"]);
const claimSchema = z.object({ acquired: z.boolean(), status: statuses, reason: z.string().optional(),
  repairId: z.string().uuid().optional(), recipient: z.string().email().optional(), tenantId: z.string().nullable().optional(),
  subject: z.string().optional(), workspaceId: z.string().uuid().optional(), siteHost: z.string().optional(),
  name: z.string().optional(), email: z.string().nullable().optional(), message: z.string().nullable().optional(),
});
export interface ConnectedOwnerRepairDependencies { rpc: typeof inquiryRecordsRpc; gates: (tenantId: string | null) => Promise<boolean>; send: (input: SendEmailInput) => Promise<SendEmailResult> }
const defaults: ConnectedOwnerRepairDependencies = { rpc: inquiryRecordsRpc, send: sendEmailWithReceipt,
  gates: connectedOwnerRepairEmailGates };
export async function connectedOwnerRepairEmailGates(tenantId: string | null): Promise<boolean> {
  return emailSendingEnabled() && customerEmailEnabled() && (!tenantId || await getClientEmailOverride(tenantId) !== "off");
}

/** A new notice purpose for the exact corrected owner. The old provider receipt
 * and every customer reply stay closed. GET, intake and webhook never call it. */
export async function repairConnectedInquiryOwnerNotice(actor: WorkspaceActor, rowId: string, deps = defaults) {
  if (!inquiryRecordsEnabled() || process.env.STRELVA_INQUIRY_OWNER_NOTICES !== "1") return { status: "disabled", reason: "owner_notices_off" };
  const claim = claimSchema.parse(await deps.rpc("claim_connected_inquiry_owner_notice_repair", {
    p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_lead_row_id: rowId,
  }));
  if (!claim.acquired) return { status: claim.status, reason: claim.reason ?? "notice_purpose_already_claimed" };
  if (!claim.repairId || !claim.recipient || !claim.workspaceId || !claim.siteHost || !claim.subject || claim.name === undefined) throw new Error("connected_notice_repair_malformed");
  const finish = (status: "suppressed" | "unknown" | "accepted", providerMessageId: string | null = null, acceptedAt: string | null = null) => deps.rpc("finish_connected_inquiry_owner_notice_repair", {
    p_repair_id: claim.repairId!, p_status: status, p_provider_message_id: providerMessageId, p_accepted_at: acceptedAt,
  });
  const gatesOpen = await deps.gates(claim.tenantId ?? null).catch(() => false);
  const current = gatesOpen && await deps.rpc("verify_connected_inquiry_owner_notice_repair", { p_repair_id: claim.repairId }).catch(() => false) === true;
  if (!current) { await finish("suppressed"); return { status: "suppressed", reason: gatesOpen ? "owner_recipient_changed" : "email_gates_closed" }; }
  const email = connectedInquiryEmail({ workspaceId: claim.workspaceId, siteHost: claim.siteHost }, { name: claim.name, email: claim.email ?? null, message: claim.message ?? null });
  let result: SendEmailResult;
  try {
    result = await deps.send({ audience: "client", ...(claim.tenantId ? { tenantId: claim.tenantId } : {}), to: claim.recipient, subject: claim.subject, options: email.options,
      idempotencyKey: `connected-inquiry-repair:${claim.repairId}`, tags: { strelva_connected_notice_id: rowId, strelva_connected_notice_repair_id: claim.repairId, strelva_workspace_id: claim.workspaceId } });
  } catch { await finish("unknown").catch(() => undefined); return { status: "unknown", reason: "provider_acceptance_unconfirmed" }; }
  if (result.status === "suppressed") { await finish("suppressed"); return { status: "suppressed", reason: result.reason ?? "email_gates_closed" }; }
  // Once accepted, only receipt reconciliation is retryable.
  await finish("accepted", result.providerMessageId, result.acceptedAt).catch(() => undefined);
  return { status: "accepted", providerMessageId: result.providerMessageId, acceptedAt: result.acceptedAt };
}
