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
