import { workspaceReturnTarget } from "@/lib/workspace-location";
import { releaseFlagEnvMode, resolveReleaseFlag, type ReleaseEnvironment, type ReleaseFlag } from "@/platform/release-flags/resolve";
import { ownerEntryPossible } from "./env";
import { askReleaseEnabled } from "@/platform/ask/release";
import type { OwnerEntryResolution } from "@/platform/release-flags/store";
import { effectiveDisposition, routeForDashboardPath, workspaceHome, type DispositionState } from "./dispositions";

/**
 * Owner entry (owner-entry spec §3.1, §3.3, §3.4, §4). Pure decisions; the
 * server module reads the session and the database.
 *
 * A person goes to the workspace only when all three hold: the tenant is
 * linked to a business workspace, owner entry is on for this workspace and
 * this person (env layering plus the workspace row), and the person has a
 * membership in that workspace. Anything else, including a failed read, keeps
 * today's `/dashboard`.
 */

export type OwnerEntryDecision =
  | { kind: "dashboard"; reason: "env_off" | "demo" | "signed_out" | "unlinked" | "entry_off" | "no_membership" | "unavailable" }
  | { kind: "workspace"; workspaceId: string; tenantStableId: string | null; operator: boolean; tester: boolean };

export function decideOwnerEntry(input: {
  environment?: ReleaseEnvironment;
  resolution: OwnerEntryResolution | null;
}): OwnerEntryDecision {
  const environment = input.environment ?? process.env;
  if (!ownerEntryPossible(environment)) return { kind: "dashboard", reason: "env_off" };
  const resolution = input.resolution;
  if (!resolution) return { kind: "dashboard", reason: "unavailable" };
  if (!resolution.workspaceId) return { kind: "dashboard", reason: "unlinked" };
  const on = resolveReleaseFlag({
    workspaceRelease: true,
    env: releaseFlagEnvMode("owner_entry", environment),
    row: resolution.ownerEntry,
    viewer: { operator: resolution.operator, tester: resolution.tester },
  });
  if (!on) return { kind: "dashboard", reason: "entry_off" };
  if (!resolution.role) return { kind: "dashboard", reason: "no_membership" };
  return { kind: "workspace", workspaceId: resolution.workspaceId, tenantStableId: resolution.tenantStableId, operator: resolution.operator, tester: resolution.tester };
}

export type DashboardRouting =
  | { kind: "render" }
  | { kind: "render-with-back"; homeHref: string; route: string; state: DispositionState }
  | { kind: "redirect"; location: string; route: string };

/**
 * What a `/dashboard` request does for this person. `pathWithSearch` is the
 * trusted path the proxy saw (`/dashboard/reports?view=monthly`). Operators
 * keep `?legacy=1` to stay on the old page; clients never get that.
 */
export function routeDashboardRequest(input: {
  decision: OwnerEntryDecision;
  pathWithSearch: string;
  flagOn?: (flag: ReleaseFlag) => boolean;
  /** STRELVA_ASK_RELEASE; read from the env when not given. */
  askReleased?: boolean;
}): DashboardRouting {
  const { decision } = input;
  if (decision.kind !== "workspace") return { kind: "render" };
  const url = new URL(input.pathWithSearch || "/dashboard", "https://dashboard.invalid");
  const route = routeForDashboardPath(url.pathname);
  const entry = effectiveDisposition(route);
  const context = { workspaceId: decision.workspaceId, tenantStableId: decision.tenantStableId, search: url.searchParams, path: url.pathname };
  const homeHref = workspaceHome(decision.workspaceId);
  const legacy = decision.operator && url.searchParams.get("legacy") === "1";
  const flagsReady = (entry.requires ?? []).every((flag) => input.flagOn?.(flag) === true)
    && (entry.requiresEnv !== "ask" || (input.askReleased ?? askReleaseEnabled()));
  if (entry.state === "ready" && flagsReady && !legacy) {
    // A target that wouldn't survive sign-in is never a redirect.
    const location = workspaceReturnTarget(entry.target(context));
    if (location) return { kind: "redirect", location, route };
  }
  return { kind: "render-with-back", homeHref, route, state: entry.state };
}

/** Where sign-in, sign-up and the admin root send someone after auth. */
export function entryDestination(decision: OwnerEntryDecision, dashboardPath: string): string {
  return decision.kind === "workspace" ? workspaceHome(decision.workspaceId) : dashboardPath;
}
