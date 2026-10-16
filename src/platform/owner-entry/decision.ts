import { workspaceReturnTarget } from "@/platform/workspaces/location";
import { releaseFlagEnvMode, resolveReleaseFlag, type ReleaseEnvironment } from "@/platform/release-flags/resolve";
import { ownerEntryPossible } from "./env";
import { askReleaseEnabled } from "@/platform/ask/release";
import type { OwnerEntryResolution } from "@/platform/release-flags/store";
import { effectiveDisposition, routeForDashboardPath, workspaceHome, type DispositionGate, type DispositionState } from "./dispositions";

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
 *
 * October 16, 2026: the legacy dashboard is retired as a second owner app.
 * Once owner entry sends this person to the workspace, every `/dashboard`
 * page redirects: to its exact workspace home when that home is on for the
 * workspace, otherwise to workspace Home (the page's equivalent is not on
 * yet, and Home is where the business starts). Nothing renders the old page
 * for a moved person except an operator's `?legacy=1`. A person with no
 * workspace membership is never moved (decideOwnerEntry), so no redirect
 * sends anyone somewhere they cannot open.
 */
export function routeDashboardRequest(input: {
  decision: OwnerEntryDecision;
  pathWithSearch: string;
  flagOn?: (flag: DispositionGate) => boolean;
  /** Ask Strelva's release (the `ask` gate); read from the env when neither this nor flagOn is given. */
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
  const gateOn = (flag: DispositionGate) => flag === "ask"
    ? input.askReleased ?? (input.flagOn ? input.flagOn(flag) === true : askReleaseEnabled())
    : input.flagOn?.(flag) === true;
  if (legacy) return { kind: "render-with-back", homeHref, route, state: entry.state };
  const flagsReady = (entry.requires ?? []).every(gateOn);
  // A target that wouldn't survive sign-in is never a redirect; Home always does.
  const exact = flagsReady ? workspaceReturnTarget(entry.target(context)) : null;
  return { kind: "redirect", location: exact ?? homeHref, route };
}

/** Where sign-in, sign-up and the admin root send someone after auth. */
export function entryDestination(decision: OwnerEntryDecision, dashboardPath: string): string {
  return decision.kind === "workspace" ? workspaceHome(decision.workspaceId) : dashboardPath;
}
