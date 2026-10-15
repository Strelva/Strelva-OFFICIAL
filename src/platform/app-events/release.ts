import { workspaceReleaseFlagEnabled } from "@/platform/release-flags/store";
import { NO_VIEWER, releaseFlagMayBeOn, type ReleaseEnvironment, type ReleaseViewer } from "@/platform/release-flags/resolve";

/** Env-only early gate: false means no database read is worth making. Needs STRELVA_WORKSPACE_RELEASE=1. */
export const appEventsMayBeOn = (env: ReleaseEnvironment = process.env) => releaseFlagMayBeOn("app_events", env);

/** Delivery, the agency and operator views and the coding-agent read for one business. Fails closed. */
export async function appEventsReleased(workspaceId: string, viewer: ReleaseViewer = NO_VIEWER, env: ReleaseEnvironment = process.env): Promise<boolean> {
  return appEventsMayBeOn(env) && workspaceReleaseFlagEnabled("app_events", workspaceId, viewer, env).catch(() => false);
}

/** Signed delivery to outside makers' https endpoints. Its own switch, on top of app_events. */
export function appEventWebhooksEnabled(env: ReleaseEnvironment = process.env): boolean {
  return appEventsMayBeOn(env) && env.STRELVA_APP_EVENT_WEBHOOKS_RELEASE?.trim() === "1";
}
