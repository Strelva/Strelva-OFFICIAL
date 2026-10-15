import { RELEASE_FLAGS, releaseFlagEnvMode, workspaceReleaseOn, type ReleaseEnvironment, type ReleaseFlag } from "@/platform/release-flags/resolve";

/**
 * A new direct business joins the globally selected rollout. These are server
 * inputs to the creation transaction, never permissions supplied by a browser.
 * Every ordinary effect, grant, approval and email gate still applies.
 * Existing businesses and creation retries never inherit a changed rollout.
 */
export function businessEntryReleaseFlags(environment: ReleaseEnvironment = process.env): ReleaseFlag[] {
  if (!workspaceReleaseOn(environment)) return [];
  return RELEASE_FLAGS.filter(flag => releaseFlagEnvMode(flag, environment) !== "off");
}
