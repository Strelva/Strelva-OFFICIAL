import type { WorkspaceStartContinuation } from "./workspace-start";
import type { WorkspaceView } from "./workspace-selection";

/** What the open view was started with. Starting anything replaces it; leaving the work clears it. */
export interface OpenedStart {
  view: WorkspaceView;
  /** Plan and horizontal products start from the ask text alone. */
  request?: string;
  continuation?: WorkspaceStartContinuation;
}

/**
 * Navigation context that belongs to the work currently open. It lives in one
 * value so every transition that leaves the current work resets all of it,
 * instead of each transition resetting its own subset by hand.
 */
export interface OpenWorkContext {
  missingWork: boolean;
  standingId: string | null;
  assignmentId: string | null;
  standingCreating: boolean;
  inquiryTenantId: string | null;
  showAssessment: boolean;
  start: OpenedStart | null;
}

export const NO_OPEN_WORK: OpenWorkContext = Object.freeze({
  missingWork: false,
  standingId: null,
  assignmentId: null,
  standingCreating: false,
  inquiryTenantId: null,
  showAssessment: false,
  start: null,
});

/** Leave the current work: everything resets, then only what the next view needs is set. */
export function leaveWork(next: Partial<OpenWorkContext> = {}): OpenWorkContext {
  return { ...NO_OPEN_WORK, ...next };
}

/** The Start continuation for this view and route, if that is what the open view was started with. */
export function startContinuation(open: OpenWorkContext, view: WorkspaceView, route: WorkspaceStartContinuation["route"]): WorkspaceStartContinuation | null {
  const start = open.start;
  return start?.view === view && start.continuation?.route === route ? start.continuation : null;
}

/** The ask text this view was started with, if it was started for this view. */
export function startAsk(open: OpenWorkContext, view: WorkspaceView): string | undefined {
  return open.start?.view === view ? open.start.request : undefined;
}

/** @deprecated Use startAsk. The carried request key remains compatible. */
export const startRequest = startAsk;
