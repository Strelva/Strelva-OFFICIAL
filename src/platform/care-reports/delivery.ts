import { getSupabase } from "@/platform/infra/db/client";
import { sendEmailWithReceipt, type SendEmailInput, type SendEmailResult } from "@/platform/infra/email/send";
import { resolveOwnerRecipient } from "@/platform/business-record";
import { resolveAgencyEmailIdentity } from "@/platform/agency-brand/server";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { CareReportFacts } from "./contracts";
import { renderCareReportMail } from "./mail";
import { careReportEmailEnabled } from "./release";
import { recordCareReportDelivery, reserveCareReportDelivery } from "./service";

/**
 * Emailing a shared Release to the owner, under the agency's name. Built and
 * held: nothing leaves unless STRELVA_CARE_REPORT_EMAIL and EMAIL_SENDING_ENABLED
 * are both on, the owner address is the business's trusted one, and it is not a
 * staff address. Every held attempt is recorded with its reason.
 */
export interface CareReportSendInput {
  reportId: string;
  agencyWorkspaceId: string;
  businessWorkspaceId: string;
  businessName: string;
  release: number;
  releaseId: string;
  facts: CareReportFacts;
  link: string;
  /** The agency's note on this Release, as the owner sees it on the page. */
  agencyNote?: string | null;
}

export type CareReportSendResult = { status: "accepted" | "suppressed" | "unknown"; reason?: string };

export interface CareReportDeliveryDeps {
  resolveOwnerRecipient(workspaceId: string): Promise<{ email: string; verified: boolean } | null>;
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
  send(input: SendEmailInput): Promise<SendEmailResult>;
  /** The agency's name as it is now (a live brand read at send time), or null to hold the send. */
  agencyIdentity(agencyWorkspaceId: string): Promise<{ name: string } | null>;
  reserve: typeof reserveCareReportDelivery;
  record: typeof recordCareReportDelivery;
}

const defaultDeps: CareReportDeliveryDeps = {
  resolveOwnerRecipient,
  rpc: (name, args) => {
    const client = getSupabase();
    if (!client) return Promise.resolve({ data: null, error: new Error("no database") });
    return (client as unknown as { rpc(n: string, a: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> }).rpc(name, args);
  },
  send: sendEmailWithReceipt,
  agencyIdentity: resolveAgencyEmailIdentity,
  reserve: reserveCareReportDelivery,
  record: recordCareReportDelivery,
};

const safeReason = (reason: string | undefined): string | null => (reason && /^[a-z_]{1,80}$/.test(reason) ? reason : null);

export async function sendCareReportRelease(
  actor: WorkspaceActor,
  input: CareReportSendInput,
  deps: CareReportDeliveryDeps = defaultDeps,
): Promise<CareReportSendResult> {
  const hold = async (reason: string): Promise<CareReportSendResult> => {
    await deps.record(actor, input.releaseId, null, "suppressed", reason, null);
    return { status: "suppressed", reason };
  };
  if (!careReportEmailEnabled()) return hold("email_off");

  const recipient = await deps.resolveOwnerRecipient(input.businessWorkspaceId).catch(() => null);
  if (!recipient || recipient.verified !== true) return hold("no_trusted_owner_recipient");

  const staff = await Promise.resolve(deps.rpc("owner_contact_staff_reason", { p_customer_workspace_id: input.businessWorkspaceId, p_email: recipient.email }))
    .catch(() => ({ data: null, error: true as unknown }));
  if (staff.error) return hold("owner_recipient_check_unavailable");
  if (typeof staff.data === "string") return hold("owner_recipient_is_staff");

  // The subject and byline use the agency's name now, never the one frozen in the snapshot.
  const identity = await deps.agencyIdentity(input.agencyWorkspaceId).catch(() => null);
  if (!identity?.name) return hold("agency_identity_unavailable");

  const reserved = await deps.reserve(actor, input.releaseId);
  const mail = renderCareReportMail({ facts: input.facts, agencyName: identity.name, businessName: input.businessName, release: input.release, link: input.link, agencyNote: input.agencyNote ?? null });
  let result: SendEmailResult;
  try {
    result = await deps.send({
      audience: "client",
      authorship: "agency",
      workspaceId: input.businessWorkspaceId,
      provider: { businessWorkspaceId: input.businessWorkspaceId, agencyWorkspaceId: input.agencyWorkspaceId },
      to: recipient.email,
      subject: mail.subject,
      idempotencyKey: `care-report:${input.releaseId}`,
      tags: { kind: "care_report" },
      html: mail.html,
      text: mail.text,
    });
  } catch (error) {
    await deps.record(actor, input.releaseId, reserved, "unknown", null, null).catch(() => undefined);
    throw error;
  }
  if (result.status === "accepted") {
    await deps.record(actor, input.releaseId, reserved, "accepted", null, result.providerMessageId);
    return { status: "accepted" };
  }
  const reason = safeReason(result.reason);
  await deps.record(actor, input.releaseId, reserved, "suppressed", reason, null);
  return { status: "suppressed", ...(reason ? { reason } : {}) };
}
