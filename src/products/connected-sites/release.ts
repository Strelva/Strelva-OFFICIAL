/**
 * The connected-sites release gates. Server only. Kept apart from server.ts so
 * the keep-your-site gates can build on them without an import cycle.
 */
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { releaseFlagEnvMode } from "@/platform/release-flags/resolve";
import { workspaceReleaseFlagEnabled } from "@/platform/release-flags/store";

/**
 * The cheap early gate: connected sites could be on for at least one
 * business (workspace release, and STRELVA_CONNECTED_SITES_RELEASE `1` or
 * `workspace`). Every path that knows its business then asks the
 * per-business check below.
 */
export function connectedSitesReleaseEnabled(): boolean {
  return workspaceReleaseEnabled() && releaseFlagEnvMode("connected_sites") !== "off";
}

/**
 * Per workspace, wherever the workspace is known (release-flag rule): the
 * business's own `connected_sites` row, and Systems on for it (a connected
 * site becomes a website System, so it also follows Systems).
 */
export async function connectedSitesReleasedFor(actor: { userId: string }, workspaceId: string): Promise<boolean> {
  if (!connectedSitesReleaseEnabled()) return false;
  const { releaseViewerFor } = await import("@/platform/release-flags/viewer");
  if (!(await workspaceReleaseFlagEnabled("connected_sites", workspaceId, await releaseViewerFor(actor)))) return false;
  const { systemsReleasedFor } = await import("@/platform/systems-release");
  return systemsReleasedFor(actor, workspaceId);
}

/**
 * The public `/api/v1/connect/*` gate for one site, resolved to its business.
 * There is no viewer on a public request: a business row `on` or
 * `operators` (an operator testing the real install) opens it; `off`, or no
 * row under `workspace`, closes it.
 */
export async function connectedSitesPublicFor(businessId: string): Promise<boolean> {
  if (!connectedSitesReleaseEnabled()) return false;
  return workspaceReleaseFlagEnabled("connected_sites", businessId, { operator: true, tester: false });
}
