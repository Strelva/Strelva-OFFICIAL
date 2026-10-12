import type { Goal } from "@/lib/goals";
import { GOAL_METRIC_LABELS } from "@/lib/goals";
import { StCopy, StRows, StRow, StSection, StTextButton } from "@/components/ui/strelva/Kit";

/** The operator sees the recorded goal; only ordinary client authority changes it. */
export function GoalEditor({ initialGoal }: { tenantId: string; initialGoal: Goal | null }) {
  return <StSection title="Business goal">
    {initialGoal ? <StRows><StRow title={GOAL_METRIC_LABELS[initialGoal.metric]} detail={String(initialGoal.target)} /></StRows> : <StCopy muted>No business goal recorded.</StCopy>}
    <StCopy muted>Support inspection is read-only.</StCopy>
    <StTextButton href="/admin/actions">Open ordinary agency access</StTextButton>
  </StSection>;
}
