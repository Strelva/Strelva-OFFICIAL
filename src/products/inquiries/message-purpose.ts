import { inquiryRecordsEnabled, inquiryRecordsRpc } from "@/platform/infra/inquiry-records";
import type { InquiryDeliveryAction } from "./delivery-types";

/** Owner and governed replies share one first-reply purpose. An ambiguous
 * provider write keeps this durable claim forever; only a known rejection
 * can release it. Legacy sends do no extra I/O while rollout switches are off. */
function enabled(action: InquiryDeliveryAction): boolean {
  return process.env.STRELVA_INQUIRY_REPLIES === "1" && inquiryRecordsEnabled()
    && (action === "reply" || action === "send_message");
}

export async function claimInquiryMessagePurpose(tenantId: string, inquiryId: string, action: InquiryDeliveryAction, attemptId: string): Promise<boolean> {
  if (!enabled(action)) return true;
  return await inquiryRecordsRpc("claim_engine_inquiry_reply", {
    p_tenant_id: tenantId, p_lead_id: inquiryId, p_attempt_id: attemptId,
  }) === true;
}

export async function releaseRejectedInquiryMessagePurpose(tenantId: string, inquiryId: string, action: InquiryDeliveryAction, attemptId: string): Promise<void> {
  if (!enabled(action)) return;
  await inquiryRecordsRpc("release_rejected_engine_inquiry_reply", {
    p_tenant_id: tenantId, p_lead_id: inquiryId, p_attempt_id: attemptId,
  });
}
