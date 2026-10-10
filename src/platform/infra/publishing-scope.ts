import { z } from "zod";

/** Compatibility key for the existing governed event queue, never a tenant row.
 * No colon: the Needs you source key uses a colon between target and event. */
export function workspacePublishingScope(workspaceId: string): string {
  return `workspace-${z.string().uuid().parse(workspaceId)}`;
}
export function publishingWorkspaceId(scope: string): string | null {
  if (!scope.startsWith("workspace-")) return null;
  const result = z.string().uuid().safeParse(scope.slice("workspace-".length));
  return result.success ? result.data : null;
}
