import type { WorkspaceExitState } from "@/platform/workspace-exit/contracts";

export type WorkspaceExitReadStatus = "available" | "completed" | "not_owner" | "unavailable";

/** A completed exit closes new workspace work while keeping its records readable. */
export function workspaceExitIsStopped(state: WorkspaceExitState | null | undefined, readStatus?: WorkspaceExitReadStatus): boolean {
  return state?.status === "completed" || readStatus === "completed";
}

/** Fail closed when an owner cannot confirm the durable exit state. */
export function workspaceExitBlocksChanges(state: WorkspaceExitState | null | undefined, readStatus?: WorkspaceExitReadStatus): boolean {
  return workspaceExitIsStopped(state, readStatus) || readStatus === "unavailable";
}

/**
 * Why new work can't start here. Exit posture wins; otherwise the only other
 * read-only reason that reaches these surfaces is delegated read, where any
 * membership (not ownership) is what would allow creating work.
 */
export function newWorkBlockedMessage(posture: { exitUnavailable: boolean; stopped: boolean; workspaceName: string }, thing: string): string {
  if (posture.exitUnavailable) return "Workspace status is temporarily unavailable, so new work is paused.";
  if (posture.stopped) return "Work in this workspace has stopped.";
  return `${posture.workspaceName} shared this with your agency to review. Switch to a workspace you’re a member of to create ${thing}.`;
}
