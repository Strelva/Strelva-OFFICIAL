import type { ReleaseViewer } from "@/platform/release-flags/resolve";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";

/** Prepared schema and hosting are activated only by an explicit rollout. */
export function websiteRebuildReleaseEnabled(): boolean {
  return workspaceReleaseEnabled() && process.env.STRELVA_WEBSITE_REBUILD_RELEASE === "1";
}

/** Per workspace, layered over the env flag (owner-entry spec §4). */
export async function websiteRebuildReleaseEnabledForWorkspace(workspaceId: string, viewer?: ReleaseViewer): Promise<boolean> {
  const { workspaceReleaseFlagEnabled } = await import("@/platform/release-flags/store");
  return workspaceReleaseFlagEnabled("website_rebuild", workspaceId, viewer);
}
