import { KIND_LABELS } from "@/platform/presentation/place-labels";
import type { WorkspaceWork } from "./contracts";

/**
 * The work list names a saved record by the native surface that can reopen it.
 * Keep the fallback for records whose product renderer is not available, but do
 * not use it for horizontal work that already has a native route.
 */
export function workspaceWorkLabel(work: Pick<WorkspaceWork, "productId" | "resourceKind" | "assessment">): string {
  const labels: Record<string, string> = {
    "websites:website": KIND_LABELS.website,
    "custom-applications:custom-application": KIND_LABELS.app,
    "onboarding:case": KIND_LABELS.onboarding,
    "applications:application": KIND_LABELS.app,
    "scheduling:schedule": KIND_LABELS.bookings,
    "investigations:investigation": KIND_LABELS.investigation,
    "operations:responsibility": KIND_LABELS.request,
    "product-learning:learning": "Learning",
    "tracker:tracker": KIND_LABELS.app,
    "documents:document": "Private document",
    "work_plans:plan": "Work plan",
    "research:experiment": "Internal tool trial",
  };
  return labels[`${work.productId}:${work.resourceKind}`] ?? work.assessment?.method.label ?? "Saved work · view unavailable";
}
