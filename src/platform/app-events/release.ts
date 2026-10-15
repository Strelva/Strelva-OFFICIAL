import type { AppReleaseGate } from "@/platform/app-releases/contracts";
import type { GateReader } from "@/platform/app-releases/resolve";
import { envGateOn } from "@/platform/app-releases/server";
import { readWorkspaceReleaseFlags, rowStateFor, workspaceReleaseFlagEnabled } from "@/platform/release-flags/store";
import {
  NO_VIEWER, releaseFlagEnvMode, releaseFlagMayBeOn, resolveReleaseFlag, workspaceReleaseOn,
  type ReleaseEnvironment, type ReleaseFlag, type ReleaseViewer,
} from "@/platform/release-flags/resolve";

/** Env-only early gate: false means no database read is worth making. Needs STRELVA_WORKSPACE_RELEASE=1. */
export const appEventsMayBeOn = (env: ReleaseEnvironment = process.env) => releaseFlagMayBeOn("app_events", env);

/** Delivery, the agency and operator views and the coding-agent read for one business. Fails closed. */
export async function appEventsReleased(workspaceId: string, viewer: ReleaseViewer = NO_VIEWER, env: ReleaseEnvironment = process.env): Promise<boolean> {
  return appEventsMayBeOn(env) && workspaceReleaseFlagEnabled("app_events", workspaceId, viewer, env).catch(() => false);
}

/**
 * Like appEventsReleased, but a failed read of the flag rows throws instead of reading as off.
 * The dispatcher uses it so a transient read failure releases a lane rather than skipping it past its events.
 */
export async function appEventsReleasedOrThrow(workspaceId: string, env: ReleaseEnvironment = process.env): Promise<boolean> {
  return appEventsMayBeOn(env) && releaseFlagOrThrow("app_events", workspaceId, env);
}

async function releaseFlagOrThrow(flag: ReleaseFlag, workspaceId: string, env: ReleaseEnvironment): Promise<boolean> {
  const workspaceRelease = workspaceReleaseOn(env);
  const mode = releaseFlagEnvMode(flag, env);
  if (!workspaceRelease || mode === "off") return false;
  const flags = await readWorkspaceReleaseFlags(workspaceId);
  return resolveReleaseFlag({ workspaceRelease, env: mode, row: rowStateFor(flags, flag), viewer: { operator: NO_VIEWER.operator, tester: false } });
}

/** A gate reader whose workspace-flag reads throw on a failed read. Env gates read as usual. */
export function strictGateReader(workspaceId: string, env: ReleaseEnvironment = process.env): GateReader {
  return (gate: AppReleaseGate) => (gate.kind === "workspace_flag" ? releaseFlagOrThrow(gate.flag, workspaceId, env) : envGateOn(gate, env));
}

/** Signed delivery to outside makers' https endpoints. Its own switch, on top of app_events. */
export function appEventWebhooksEnabled(env: ReleaseEnvironment = process.env): boolean {
  return appEventsMayBeOn(env) && env.STRELVA_APP_EVENT_WEBHOOKS_RELEASE?.trim() === "1";
}
