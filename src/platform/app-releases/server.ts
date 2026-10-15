import type { RequiredConnection } from "@/platform/connections/contracts";
import { NO_VIEWER, releaseFlagMayBeOn, type ReleaseEnvironment, type ReleaseViewer } from "@/platform/release-flags/resolve";
import { workspaceReleaseFlagEnabled } from "@/platform/release-flags/store";
import {
  BUILT_IN_APPS,
  builtInApp,
  builtInAppRelease,
  builtInAppReleaseLabel,
} from "./catalog";
import type {
  AppReleaseGate,
  BuiltInApp,
  BuiltInAppId,
  BuiltInAppReleaseState,
  BuiltInAppReleaseView,
} from "./contracts";
import { resolveBuiltInAppRelease, type GateReader } from "./resolve";

export function envGateOn(gate: Extract<AppReleaseGate, { kind: "env" }>, env: ReleaseEnvironment = process.env): boolean {
  return gate.values.includes(env[gate.name]?.trim() ?? "");
}

export function gateReaderFor(workspaceId: string, viewer: ReleaseViewer = NO_VIEWER, env: ReleaseEnvironment = process.env): GateReader {
  return gate => (gate.kind === "workspace_flag" ? workspaceReleaseFlagEnabled(gate.flag, workspaceId, viewer, env) : envGateOn(gate, env));
}

export async function readBuiltInAppRelease(
  appId: BuiltInAppId,
  workspaceId: string,
  viewer?: ReleaseViewer,
  env?: ReleaseEnvironment,
): Promise<BuiltInAppReleaseState> {
  return resolveBuiltInAppRelease(builtInApp(appId), gateReaderFor(workspaceId, viewer, env));
}

/** All Apps in catalog order. */
export async function readBuiltInAppReleases(workspaceId: string, viewer?: ReleaseViewer, env?: ReleaseEnvironment): Promise<BuiltInAppReleaseState[]> {
  return Promise.all(BUILT_IN_APPS.map(app => resolveBuiltInAppRelease(app, gateReaderFor(workspaceId, viewer, env))));
}

/** Gate feature code by key, never by number. False when the App is not available here; throws on an unknown key. */
export async function builtInAppReleaseReached(
  appId: BuiltInAppId,
  releaseKey: string,
  workspaceId: string,
  viewer?: ReleaseViewer,
  env?: ReleaseEnvironment,
): Promise<boolean> {
  const app = builtInApp(appId);
  const wanted = builtInAppRelease(app, releaseKey);
  const state = await readBuiltInAppRelease(appId, workspaceId, viewer, env);
  return state.available && state.release >= wanted.number;
}

/** Cheap early gate: could this Release be on for any business? Reads env only. */
export function builtInAppReleaseMayReach(appId: BuiltInAppId, releaseKey: string, env: ReleaseEnvironment = process.env): boolean {
  const app = builtInApp(appId);
  const wanted = builtInAppRelease(app, releaseKey);
  const gates: AppReleaseGate[] = [...app.availability, ...app.releases.filter(item => item.number <= wanted.number).flatMap(item => item.gates)];
  return gates.every(gate => (gate.kind === "env" ? envGateOn(gate, env) : releaseFlagMayBeOn(gate.flag, env)));
}

/** What Make it live waits for. Availability is ignored: the display flag and the App's presence never loosen the check. */
export async function effectiveRequiredConnections(
  appId: BuiltInAppId,
  workspaceId: string,
  viewer?: ReleaseViewer,
  env?: ReleaseEnvironment,
): Promise<RequiredConnection[]> {
  const state = await resolveBuiltInAppRelease(builtInApp(appId), gateReaderFor(workspaceId, viewer, env), { ignoreAvailability: true });
  return state.available ? state.requiredConnections : [];
}

export function builtInAppReleaseView(app: BuiltInApp, state: Extract<BuiltInAppReleaseState, { available: true }>): BuiltInAppReleaseView {
  return {
    appId: app.id,
    name: app.name,
    release: state.release,
    latest: state.latest,
    label: builtInAppReleaseLabel(app, state.release),
    requiredConnections: state.requiredConnections,
  };
}

/** The workspace snapshot's `releases.apps`: available Apps only. */
export function appReleasesForSnapshot(states: readonly BuiltInAppReleaseState[]): Partial<Record<BuiltInAppId, BuiltInAppReleaseView>> {
  return Object.fromEntries(
    states.flatMap(state => (state.available ? [[state.appId, builtInAppReleaseView(builtInApp(state.appId), state)] as const] : [])),
  );
}
