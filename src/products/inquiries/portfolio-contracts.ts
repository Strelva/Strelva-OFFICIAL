import type { InquiryWork } from "./contracts";

type InquiryWorkState = InquiryWork["state"];

export interface InquiryAttentionSummary {
  tenantId: string;
  businessId: string;
  businessName: string;
  workId: string;
  title: string;
  state: Extract<InquiryWorkState, "planned" | "ready_to_publish" | "failed">;
  requiredDecision: string;
  updatedAt: string;
}

export interface InquiryPatternSummary {
  id: string;
  sourceTenantId: string;
  sourceBusinessId: string;
  sourceBusinessName: string;
  name: string;
  version: number;
  cleanReceiptCount: number;
}

export interface InquiryPortfolio {
  attention: InquiryAttentionSummary[];
  patterns: InquiryPatternSummary[];
  unavailableTenantIds: string[];
}
