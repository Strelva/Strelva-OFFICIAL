import { workspaceReleaseEnabled } from "@/platform/workspace-release";

/** Prepared schema and hosting are activated only by an explicit rollout. */
export function websiteRebuildReleaseEnabled(): boolean {
  return workspaceReleaseEnabled() && process.env.STRELVA_WEBSITE_REBUILD_RELEASE === "1";
}
