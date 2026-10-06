import type { ReleaseViewer } from "@/platform/release-flags/resolve";
/**
 * The Systems customer model (Systems on Home, System pages, Possibilities,
 * Make real and contextual Versions) is a 1.0.0 launch feature, not Reborn:
 * "a System screen is not promised" (docs/product/strelva-reborn.md,
 * "Reborn in Systems terms").
 *
 * Exposure only, on top of `STRELVA_WORKSPACE_RELEASE`. Off: /api/workspace
 * builds no Systems projection and says so in `releases.systems`, the Make
 * real route answers 503, and the workspace renders as it did before Systems.
 */
export function systemsReleaseEnabled(environment: { STRELVA_SYSTEMS_RELEASE?: string } = { STRELVA_SYSTEMS_RELEASE: process.env.STRELVA_SYSTEMS_RELEASE }): boolean {
  return environment.STRELVA_SYSTEMS_RELEASE === "1";
}

/**
 * Per workspace (owner-entry spec §4): `STRELVA_SYSTEMS_RELEASE=workspace`
 * turns Systems on only for workspaces an operator set `on` (or `operators`,
 * for operators and named testers); `1` is on everywhere except a workspace
 * set `off`. Unset or `0` stays off everywhere.
 */
export async function systemsReleaseEnabledForWorkspace(workspaceId: string, viewer?: ReleaseViewer): Promise<boolean> {
  const { workspaceReleaseFlagEnabled } = await import("@/platform/release-flags/store");
  return workspaceReleaseFlagEnabled("systems", workspaceId, viewer);
}
