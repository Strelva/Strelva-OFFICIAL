import { readWorkspaceLocation } from "@/platform/workspaces/location";
import type { WorkspaceSnapshot } from "./contracts";
import { workspaceExitIsStopped } from "./workspace-exit-ui";

export type HorizontalView = "websites" | "custom-applications" | "onboarding" | "applications" | "scheduling" | "investigations" | "operations" | "product-learning";
export const isHorizontalView = (value: string | null | undefined): value is HorizontalView => Boolean(value && ["websites", "custom-applications", "onboarding", "applications", "scheduling", "investigations", "operations", "product-learning"].includes(value));
export type WorkspaceView = "work" | "agency" | "inquiries" | "tracker" | "document" | "plan" | HorizontalView;

/**
 * The one view a saved piece of work opens in. Used for both the in-page view
 * and the `view` written to the URL, so a reload lands where the click did.
 */
export function viewForWork(productId: string | null | undefined): WorkspaceView {
  if (isHorizontalView(productId)) return productId;
  if (productId === "tracker") return "tracker";
  if (productId === "documents") return "document";
  if (productId === "work_plans") return "plan";
  return "work";
}

/** Resolve navigation only. Data and action authority still belong to the server. */
export function selectWorkspaceLocation(
  params: URLSearchParams,
  data: Pick<WorkspaceSnapshot, "work" | "products" | "managedWork" | "workspaceExitState" | "workspaceExitReadStatus">,
  inquiry?: { tenantId: string },
) {
  const location = readWorkspaceLocation(params);
  const requestedWork = location.work;
  const requestedView = location.view;
  const requestedStanding = location.standingId;
  const requestedAssignment = location.assignmentId;
  const accessRoute = requestedView === "access";
  const inquiryAvailable = Boolean(inquiry) || data.products.some((product) => product.id === "inquiries" && product.availability === "available");
  const inquiryRoute = requestedView === "inquiries" && inquiryAvailable;
  const inquiryId = location.tenantId || inquiry?.tenantId || data.managedWork?.[0]?.id || null;
  const match = data.work.find(item => item.id === requestedWork);
  const trackerAvailable = data.products.some((product) => product.id === "tracker" && product.availability === "available");
  const trackerRoute = requestedView === "tracker" && (trackerAvailable || match?.productId === "tracker");
  const savedTrackerRoute = Boolean(match?.productId === "tracker" && !inquiryRoute);
  const documentAvailable = data.products.some((product) => product.id === "documents" && product.availability === "available");
  const documentRoute = requestedView === "document" && documentAvailable;
  const savedDocumentRoute = Boolean(match?.productId === "documents" && !inquiryRoute && !trackerRoute);
  const planRoute = requestedView === "plan";
  const savedPlanRoute = Boolean(match?.productId === "work_plans" && !inquiryRoute && !trackerRoute && !documentRoute);
  const horizontalView = requestedStanding || requestedAssignment || requestedView === "ongoing" ? "operations" : isHorizontalView(requestedView) ? requestedView : isHorizontalView(match?.productId) ? match.productId : null;
  const validView: WorkspaceView = accessRoute ? "agency" : horizontalView || (inquiryRoute ? "inquiries" : trackerRoute || savedTrackerRoute ? "tracker" : documentRoute || savedDocumentRoute ? "document" : planRoute || savedPlanRoute ? "plan" : "work");
  return {
    missingWork: Boolean(location.unavailableWork || (requestedWork && !match && !requestedStanding)),
    selectedWorkId: match?.id ?? (requestedWork || location.unavailableWork || horizontalView ? null : data.work[0]?.id) ?? null,
    selectedStandingId: requestedStanding && horizontalView === "operations" ? requestedStanding : null,
    selectedAssignmentId: requestedAssignment && horizontalView === "operations" ? requestedAssignment : null,
    inquiryTenantId: inquiryRoute ? inquiryId : null,
    showAssessment: !requestedWork && !location.unavailableWork && !accessRoute && data.work.length === 0 && !inquiryRoute && !trackerRoute && !documentRoute && !savedDocumentRoute && !planRoute && !savedPlanRoute && !horizontalView && !workspaceExitIsStopped(data.workspaceExitState, data.workspaceExitReadStatus),
    home: !requestedWork && !location.unavailableWork && !accessRoute && !inquiryRoute && !trackerRoute && !documentRoute && !savedDocumentRoute && !planRoute && !savedPlanRoute && !horizontalView,
    view: validView,
  };
}
