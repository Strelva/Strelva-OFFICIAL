import { workspaceReleaseFlagEnabled } from "@/platform/release-flags/store";
import { NO_VIEWER, releaseFlagMayBeOn, type ReleaseViewer } from "@/platform/release-flags/resolve";

/** Coding agents pick up and report website Requests. Off unless the env mode and the business's row both allow it. */
export const sitesByCodeMayBeOn = () => releaseFlagMayBeOn("sites_by_code");

export async function sitesByCodeReleased(workspaceId: string, viewer: ReleaseViewer = NO_VIEWER): Promise<boolean> {
  return sitesByCodeMayBeOn() && workspaceReleaseFlagEnabled("sites_by_code", workspaceId, viewer).catch(() => false);
}
