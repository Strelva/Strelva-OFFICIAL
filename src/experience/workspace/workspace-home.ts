import type { WorkspaceWork } from "./contracts";

/** Only recorded state can put work in attention. Creation plans yield to their saved outputs. */
export function workspaceHome(work: readonly WorkspaceWork[]) {
  const outputs = new Map<string, number>();
  for (const item of work) if (item.sourceWorkId && !item.unavailableReason) outputs.set(item.sourceWorkId, (outputs.get(item.sourceWorkId) || 0) + 1);
  const attention = work.flatMap(item => {
    const reason = item.unavailableReason || (item.operation?.status === "needs_attention" ? "This work needs a decision before it can continue." : item.operation?.status === "proposed" ? "Review the proposed work." : item.workPlan?.status === "needs_scoping" ? item.workPlan.summary : null);
    return reason ? [{ work: item, reason }] : [];
  });
  const attentionIds = new Set(attention.map(item => item.work.id));
  return {
    hasWork: work.length > 0,
    attention,
    results: work.filter(item => !attentionIds.has(item.id) && !(item.productId === "work_plans" && Boolean(item.workPlan?.outputCount) && (outputs.get(item.id) || 0) >= item.workPlan!.outputCount!)),
  };
}
