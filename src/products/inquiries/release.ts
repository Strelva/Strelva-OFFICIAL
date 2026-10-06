import { releaseFlagEnvMode, workspaceReleaseOn, type ReleaseEnvironment, type ReleaseViewer } from "@/platform/release-flags/resolve";

/**
 * Exposure only. Every inquiry read and command still requires tenant authority.
 *
 * Env-only: exactly `1` is on for every client. Callers with no workspace or
 * tenant in hand (the account landing) use this and keep that behavior.
 */
export function inquiryReleaseEnabled(environment: { STRELVA_INQUIRIES_RELEASE?: string } = { STRELVA_INQUIRIES_RELEASE: process.env.STRELVA_INQUIRIES_RELEASE }): boolean {
  return environment.STRELVA_INQUIRIES_RELEASE === "1";
}

/**
 * Could inquiries be on for any client? The early gate for routes that learn
 * their tenant later: `1`, or `workspace` under the workspace release (some
 * business row may say `on`). Such a route must still call the per-tenant
 * resolver before it serves anything.
 */
export function inquiryReleaseMayBeOn(environment: ReleaseEnvironment = process.env): boolean {
  return inquiryReleaseEnabled(environment) || (workspaceReleaseOn(environment) && releaseFlagEnvMode("inquiries", environment) === "workspace");
}

/**
 * Per workspace, layered over the env flag (owner-entry spec §4). Without the
 * workspace release there are no rows, so the env-only rule decides.
 */
export async function inquiryReleaseEnabledForWorkspace(workspaceId: string, viewer?: ReleaseViewer, environment: ReleaseEnvironment = process.env): Promise<boolean> {
  if (!workspaceReleaseOn(environment)) return inquiryReleaseEnabled(environment);
  const { workspaceReleaseFlagEnabled } = await import("@/platform/release-flags/store");
  return workspaceReleaseFlagEnabled("inquiries", workspaceId, viewer, environment);
}

/**
 * Per managed site: a converted tenant follows its business's row; an
 * unconverted one follows the env (`1` on, `workspace` off).
 */
export async function inquiryReleaseEnabledForTenant(tenantId: string, viewer?: ReleaseViewer, environment: ReleaseEnvironment = process.env): Promise<boolean> {
  if (!workspaceReleaseOn(environment)) return inquiryReleaseEnabled(environment);
  if (!inquiryReleaseMayBeOn(environment)) return false;
  const { tenantReleaseFlagEnabled } = await import("@/platform/release-flags/store");
  return tenantReleaseFlagEnabled("inquiries", tenantId, viewer, environment);
}

/** Per site, for the request's signed-in user (super admins count as operators; named testers by user id). */
export async function inquiryReleasedForCurrentUser(tenantId: string): Promise<boolean> {
  if (!inquiryReleaseMayBeOn()) return false;
  const { currentReleaseViewer } = await import("@/platform/release-flags/viewer");
  return inquiryReleaseEnabledForTenant(tenantId, await currentReleaseViewer());
}
