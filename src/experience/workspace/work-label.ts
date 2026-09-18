import type { WorkspaceWork } from "./contracts";

/**
 * The work list names a saved record by the native surface that can reopen it.
 * Keep the fallback for records whose product renderer is not available, but do
 * not use it for horizontal work that already has a native route.
 */
export function workspaceWorkLabel(work: Pick<WorkspaceWork, "productId" | "resourceKind" | "assessment">): string {
  const labels: Record<string, string> = {
    "applications:application": "Application",
    "scheduling:schedule": "Schedule",
    "investigations:investigation": "Ongoing check",
    "operations:responsibility": "Delegated work",
    "product-learning:learning": "Learning",
    "tracker:tracker": "Tracker",
    "documents:document": "Private document",
    "work_plans:plan": "Work plan",
    "research:experiment": "Tracker experiment",
  };
  return labels[`${work.productId}:${work.resourceKind}`] ?? work.assessment?.method.label ?? "Saved work · view unavailable";
}
