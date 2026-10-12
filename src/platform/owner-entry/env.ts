import { withClientFallbackRoot } from "@/lib/client-fallback";
import { releaseFlagEnvMode, workspaceReleaseOn, type ReleaseEnvironment } from "@/platform/release-flags/resolve";

/**
 * Cheap check with no reads, safe in the proxy: can owner entry be on for
 * anyone right now? False while `STRELVA_WORKSPACE_RELEASE` is off or
 * `STRELVA_OWNER_ENTRY` is unset or `0`, and then every path behaves as it
 * did before owner entry existed.
 */
export function ownerEntryPossible(environment: ReleaseEnvironment = process.env): boolean {
  return workspaceReleaseOn(environment) && releaseFlagEnvMode("owner_entry", environment) !== "off";
}

/** The route that decides, after sign-in, between the workspace and /dashboard. */
export const OWNER_ENTRY_PATH = "/auth/entry";

/**
 * The `next` that sign-in and sign-up on a client's admin host hand to the
 * auth callback. Owner entry possible: the entry route, which decides once
 * the person is known. Otherwise `/dashboard`, exactly as before.
 */
export function tenantSignInNext(clientFallbackRoot: string, environment: ReleaseEnvironment = process.env): string {
  return withClientFallbackRoot(clientFallbackRoot, ownerEntryPossible(environment) ? OWNER_ENTRY_PATH : "/dashboard");
}
