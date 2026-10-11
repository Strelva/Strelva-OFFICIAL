import { inquiryRecordsRpc } from "@/platform/infra/inquiry-records";
import { inquiryOutcomeCountsSchema } from "@/platform/business-outcomes/inquiry-proof";

export type InquiryOutcomeProof =
  | { status: "available"; inquiries: number; answered: number; withinDay: number; unanswered: number;
      averageReplySeconds: number | null; medianReplySeconds: number | null; evidence: string }
  | { status: "unavailable"; reason: string };

export function inquiryOutcomeProofEnabled(): boolean {
  return process.env.STRELVA_INQUIRY_OUTCOMES === "1";
}

/** Trusted server tenant scope, for the existing weekly/monthly cron. It
 * never sends, uses Redis counts, or turns missing evidence into zero. */
export async function readTenantInquiryOutcomeProof(
  tenantId: string, from: string, to: string,
  rpc: typeof inquiryRecordsRpc = inquiryRecordsRpc,
): Promise<InquiryOutcomeProof> {
  if (!inquiryOutcomeProofEnabled()) return { status: "unavailable", reason: "inquiry_outcomes_off" };
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (!tenantId || !Number.isFinite(start) || !Number.isFinite(end) || start >= end || end - start > 366 * 86400_000) {
    return { status: "unavailable", reason: "inquiry_outcomes_invalid_range" };
  }
  try {
    const raw = await rpc("business_inquiry_outcomes_for_tenant", { p_tenant_id: tenantId, p_from: from, p_to: to });
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("malformed");
    const r = raw as Record<string, unknown>;
    if (r.status === "unavailable") return { status: "unavailable", reason: "inquiry_outcomes_not_connected" };
    const counts = inquiryOutcomeCountsSchema.parse(r);
    return { status: "available", ...counts,
      evidence: "First business reply accepted by the email provider; delivery and customer response are separate evidence." };
  } catch {
    return { status: "unavailable", reason: "inquiry_outcomes_unavailable" };
  }
}
