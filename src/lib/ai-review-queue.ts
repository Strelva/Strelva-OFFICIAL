import { addEvent } from "./events";
import type { PreviewDiff, RiskAssessment } from "./agent-risk";
import type { AiGovernanceDecision } from "./ai-governance";
import type { ContentSection, UnifiedEvent } from "./types";

export type QueueAiContentReviewInput = {
  tenantId: string;
  section: ContentSection;
  currentData: Record<string, unknown>;
  proposedData: Record<string, unknown>;
  diffs: PreviewDiff[];
  risk?: RiskAssessment;
  governance: AiGovernanceDecision;
};

export async function queueAiContentReview(
  input: QueueAiContentReviewInput
): Promise<UnifiedEvent> {
  const riskLabel = input.risk?.level ? `${input.risk.level}-risk ` : "";
  const reason = input.risk?.reason || input.governance.reason;

  return addEvent(
    {
      tenantId: input.tenantId,
      source: "ai",
      type: "content_update",
      title: `AI proposed ${riskLabel}changes to ${input.section}`,
      body: input.diffs.slice(0, 5).map((d) => `${d.field}: ${d.type}`).join("\n"),
      status: "pending",
      metadata: {
        kind: "agent_preview",
        section: input.section,
        risk: input.risk?.level,
        riskReason: input.risk?.reason,
        governanceReason: input.governance.reason,
        reviewReason: reason,
        diffs: input.diffs,
        proposedData: input.proposedData,
        currentData: input.currentData,
      },
    },
    { requirePersistence: process.env.NODE_ENV === "production" }
  );
}
