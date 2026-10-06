/**
 * Per-workspace release flags layered over the env flags
 * (docs/product/specs/owner-entry.md §4).
 *
 * | Env value     | Meaning                                                        |
 * | unset or `0`  | Off everywhere. A workspace row can't turn it on (kill switch) |
 * | `workspace`   | On only where the workspace row says `on` (or `operators`)     |
 * | `1`           | On everywhere, except where a workspace row says `off`         |
 *
 * A row in `operators` shows the flag only to Strelva operators and the
 * workspace's named testers, under either `workspace` or `1`.
 * `STRELVA_WORKSPACE_RELEASE` stays env-only: off, every flag is off.
 *
 * Pure. The store reads rows; this decides.
 */

export const RELEASE_FLAGS = ["owner_entry", "inquiries", "website_rebuild", "systems"] as const;
export type ReleaseFlag = (typeof RELEASE_FLAGS)[number];
export type ReleaseFlagEnvMode = "off" | "workspace" | "on";
export type ReleaseFlagRowState = "off" | "operators" | "on";

export const RELEASE_FLAG_ENV: Record<ReleaseFlag, string> = {
  owner_entry: "STRELVA_OWNER_ENTRY",
  inquiries: "STRELVA_INQUIRIES_RELEASE",
  website_rebuild: "STRELVA_WEBSITE_REBUILD_RELEASE",
  systems: "STRELVA_SYSTEMS_RELEASE",
};

export const RELEASE_FLAG_LABELS: Record<ReleaseFlag, string> = {
  owner_entry: "Owner entry",
  inquiries: "Inquiries",
  website_rebuild: "Website rebuild",
  systems: "Systems",
};

export type ReleaseEnvironment = Partial<Record<string, string | undefined>>;

export function isReleaseFlag(value: unknown): value is ReleaseFlag {
  return typeof value === "string" && (RELEASE_FLAGS as readonly string[]).includes(value);
}

/** Anything other than exactly `1` or `workspace` is off, so a typo fails closed. */
export function releaseFlagEnvMode(flag: ReleaseFlag, environment: ReleaseEnvironment = process.env): ReleaseFlagEnvMode {
  const value = environment[RELEASE_FLAG_ENV[flag]]?.trim();
  if (value === "1") return "on";
  if (value === "workspace") return "workspace";
  return "off";
}

export function workspaceReleaseOn(environment: ReleaseEnvironment = process.env): boolean {
  return environment.STRELVA_WORKSPACE_RELEASE === "1";
}

/**
 * Whether a flag could be on for at least one workspace: the cheap early gate
 * for routes that only learn their workspace or tenant later. True for env
 * `1`, and for `workspace` (some row may say `on`). The route must still ask
 * the per-workspace or per-tenant resolver once it knows which one.
 */
export function releaseFlagMayBeOn(flag: ReleaseFlag, environment: ReleaseEnvironment = process.env): boolean {
  return workspaceReleaseOn(environment) && releaseFlagEnvMode(flag, environment) !== "off";
}

export interface ReleaseViewer {
  /** An active super admin. */
  operator: boolean;
  /** Named as a tester on this workspace. */
  tester: boolean;
  /** When given, the store also checks the workspace's tester list for this user. */
  userId?: string;
}

export const NO_VIEWER: ReleaseViewer = { operator: false, tester: false };

/**
 * The one layering rule. `row` is the workspace's stored state, or null when
 * the workspace has no row (or the row could not be read: the env decides).
 */
export function resolveReleaseFlag(input: {
  workspaceRelease: boolean;
  env: ReleaseFlagEnvMode;
  row: ReleaseFlagRowState | null;
  viewer: ReleaseViewer;
}): boolean {
  if (!input.workspaceRelease || input.env === "off") return false;
  if (input.row === "off") return false;
  if (input.row === "operators") return input.viewer.operator || input.viewer.tester;
  if (input.row === "on") return true;
  return input.env === "on";
}

/** The state an operator should read for one workspace, for the console. */
export function effectiveReleaseState(input: {
  workspaceRelease: boolean;
  env: ReleaseFlagEnvMode;
  row: ReleaseFlagRowState | null;
}): "off" | "operators" | "on" {
  if (!input.workspaceRelease || input.env === "off" || input.row === "off") return "off";
  if (input.row === "operators") return "operators";
  if (input.row === "on") return "on";
  return input.env === "on" ? "on" : "off";
}
