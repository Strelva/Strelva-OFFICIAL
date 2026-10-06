import { releaseFlagMayBeOn, type ReleaseViewer } from "@/platform/release-flags/resolve";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";

/**
 * Prepared schema and hosting are activated only by an explicit rollout.
 *
 * Env-only: exactly `1` (under the workspace release) is on for everyone.
 * Callers with no workspace or tenant in hand keep this behavior.
 */
export function websiteRebuildReleaseEnabled(): boolean {
  return workspaceReleaseEnabled() && process.env.STRELVA_WEBSITE_REBUILD_RELEASE === "1";
}

/**
 * Could the rebuild be on for any business? `1`, or `workspace` (some row may
 * say `on`). The early gate for routes, the proxy and crons that resolve the
 * workspace or tenant later; they must then ask the per-workspace or
 * per-tenant resolver.
 */
export function websiteRebuildReleaseMayBeOn(): boolean {
  return websiteRebuildReleaseEnabled() || releaseFlagMayBeOn("website_rebuild");
}

/** Per workspace, layered over the env flag (owner-entry spec §4). */
export async function websiteRebuildReleaseEnabledForWorkspace(workspaceId: string, viewer?: ReleaseViewer): Promise<boolean> {
  const { workspaceReleaseFlagEnabled } = await import("@/platform/release-flags/store");
  return workspaceReleaseFlagEnabled("website_rebuild", workspaceId, viewer);
}

/** Per managed site: a converted tenant follows its business's row; an unconverted one follows the env. */
export async function websiteRebuildReleaseEnabledForTenant(tenantId: string, viewer?: ReleaseViewer): Promise<boolean> {
  if (!websiteRebuildReleaseMayBeOn()) return false;
  const { tenantReleaseFlagEnabled } = await import("@/platform/release-flags/store");
  return tenantReleaseFlagEnabled("website_rebuild", tenantId, viewer);
}

/** Per workspace, for a signed-in actor (super admins count as operators; named testers by user id). */
export async function websiteRebuildReleasedFor(actor: { userId: string }, workspaceId: string): Promise<boolean> {
  if (!websiteRebuildReleaseMayBeOn()) return false;
  const { releaseViewerFor } = await import("@/platform/release-flags/viewer");
  return websiteRebuildReleaseEnabledForWorkspace(workspaceId, await releaseViewerFor(actor));
}
