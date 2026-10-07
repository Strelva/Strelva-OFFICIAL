import { inquiryRecordsRpc } from "@/platform/infra/inquiry-records";

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
    const count = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
    const seconds = (v: unknown): v is number | null => v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0);
    if (!count(r.inquiries) || !count(r.answered) || !count(r.withinDay) || !count(r.unanswered) ||
        r.answered > r.inquiries || r.withinDay > r.answered || r.unanswered !== r.inquiries - r.answered ||
        !seconds(r.averageReplySeconds) || !seconds(r.medianReplySeconds) ||
        (r.answered === 0 ? r.averageReplySeconds !== null || r.medianReplySeconds !== null : r.averageReplySeconds === null || r.medianReplySeconds === null)) {
      throw new Error("malformed");
    }
    return { status: "available", inquiries: r.inquiries, answered: r.answered, withinDay: r.withinDay, unanswered: r.unanswered,
      averageReplySeconds: r.averageReplySeconds, medianReplySeconds: r.medianReplySeconds,
      evidence: "First business reply accepted by the email provider; delivery and customer response are separate evidence." };
  } catch {
    return { status: "unavailable", reason: "inquiry_outcomes_unavailable" };
  }
}
