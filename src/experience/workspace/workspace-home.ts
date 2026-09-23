import type { WorkspaceWork } from "./contracts";

/** Only recorded state can put work in attention. Creation plans yield to their saved outputs. */
export function workspaceHome(work: readonly WorkspaceWork[]) {
  const outputs = new Map<string, number>();
  for (const item of work) if (item.sourceWorkId && !item.unavailableReason) outputs.set(item.sourceWorkId, (outputs.get(item.sourceWorkId) || 0) + 1);
  const attention = work.flatMap(item => {
    const reason = item.unavailableReason
      || (item.operation?.status === "needs_attention" ? item.operation.reason || "This work needs a decision before it can continue." : item.operation?.status === "proposed" ? item.operation.reason || "Review the proposed work." : item.workPlan?.status === "needs_scoping" ? item.workPlan.summary : null);
    return reason ? [{ work: item, reason }] : [];
  });
  const attentionIds = new Set(attention.map(item => item.work.id));
  return {
    hasWork: work.length > 0,
    attention,
    results: work.filter(item => !attentionIds.has(item.id) && !(item.productId === "work_plans" && Boolean(item.workPlan?.outputCount) && (outputs.get(item.id) || 0) >= item.workPlan!.outputCount!)),
  };
}

export interface HomeInsight {
  workId: string;
  subject: string;
  grade: string;
  score: number;
  verdict: string;
  topFix: string;
  partial: boolean;
  note?: string;
}

/** The newest measured AI Visibility result. Unmeasured scorecards are never presented. */
export function homeInsight(work: readonly WorkspaceWork[]): HomeInsight | null {
  const newest = [...work].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const item of newest) {
    const assessment = item.assessment;
    if (item.unavailableReason || assessment?.kind !== "ai_visibility" || assessment.availability === "unavailable") continue;
    const result = assessment.payload;
    if (!result || result.measurementStatus === "unavailable" || result.readinessMeasured === false) continue;
    return {
      workId: item.id,
      subject: assessment.subject.name || result.business,
      grade: result.grade,
      score: result.score,
      verdict: result.verdict,
      topFix: result.topFix,
      partial: result.measurementStatus === "partial",
      note: result.measurementNote,
    };
  }
  return null;
}

export interface HomeSuggestion { label: string; request: string }

/**
 * Starting points follow what the business already has. The insight card owns
 * its top fix and the first-run check, so neither is repeated here.
 */
export function homeSuggestions(input: { work: readonly WorkspaceWork[]; siteCount: number; insight: HomeInsight | null }): HomeSuggestion[] {
  const has = (productId: string) => input.work.some(item => item.productId === productId);
  const suggestions: HomeSuggestion[] = [];
  if (input.siteCount) suggestions.push({ label: "Improve our website", request: "Improve our website based on what customers need." });
  if (!has("applications")) suggestions.push({ label: "Give my team a better way to request things", request: "Give my team a better way to submit and track requests." });
  const firstRun = !input.work.length && !input.siteCount;
  if (!input.insight && !has("ai_visibility") && !firstRun) suggestions.push({ label: "See how AI describes us", request: "Help me see what AI can understand about my business." });
  suggestions.push({ label: "Fix customer follow-up", request: "Make sure customer follow-up does not fall through." });
  return suggestions.slice(0, 3);
}

/**
 * The request behind "Have Strelva do this". It names the change, not the
 * assessment, so it cannot route back into running another check.
 */
export function insightFixRequest(insight: HomeInsight, siteCount: number): string {
  return siteCount ? `Update our website: ${insight.topFix}` : `Help me do this for my business: ${insight.topFix}`;
}
