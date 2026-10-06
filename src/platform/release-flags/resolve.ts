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

/**
 * Make real with real effects has one key per effect channel
 * (systems-experience spec section 6.2), so Systems Home can ship before any
 * live effect and each channel turns on alone. They share one env switch.
 */
export const MAKE_REAL_LIVE_FLAGS = [
  "make_real_live:hosted_website",
  "make_real_live:tenant_content",
  "make_real_live:inquiry_form",
  "make_real_live:booking_page",
  "make_real_live:internal_app",
] as const;
export type MakeRealLiveFlag = (typeof MAKE_REAL_LIVE_FLAGS)[number];

/**
 * `connected_sites` (20261009100000): its own row per business, under
 * STRELVA_CONNECTED_SITES_RELEASE. `1` keeps today's meaning (on wherever
 * Systems is on) unless a business's row says `off`; `workspace` turns it on
 * business by business, including the public `/api/v1/connect/*` gate.
 */
export const RELEASE_FLAGS = ["owner_entry", "inquiries", "website_rebuild", "systems", ...MAKE_REAL_LIVE_FLAGS, "connected_sites"] as const;
export type ReleaseFlag = (typeof RELEASE_FLAGS)[number];
export type ReleaseFlagEnvMode = "off" | "workspace" | "on";
export type ReleaseFlagRowState = "off" | "operators" | "on";

export function isMakeRealLiveFlag(flag: string): flag is MakeRealLiveFlag {
  return (MAKE_REAL_LIVE_FLAGS as readonly string[]).includes(flag);
}

export const RELEASE_FLAG_ENV: Record<ReleaseFlag, string> = {
  owner_entry: "STRELVA_OWNER_ENTRY",
  inquiries: "STRELVA_INQUIRIES_RELEASE",
  website_rebuild: "STRELVA_WEBSITE_REBUILD_RELEASE",
  systems: "STRELVA_SYSTEMS_RELEASE",
  "make_real_live:hosted_website": "STRELVA_MAKE_REAL_LIVE",
  "make_real_live:tenant_content": "STRELVA_MAKE_REAL_LIVE",
  "make_real_live:inquiry_form": "STRELVA_MAKE_REAL_LIVE",
  "make_real_live:booking_page": "STRELVA_MAKE_REAL_LIVE",
  "make_real_live:internal_app": "STRELVA_MAKE_REAL_LIVE",
  connected_sites: "STRELVA_CONNECTED_SITES_RELEASE",
};

export const RELEASE_FLAG_LABELS: Record<ReleaseFlag, string> = {
  owner_entry: "Owner entry",
  inquiries: "Inquiries",
  website_rebuild: "Website rebuild",
  systems: "Systems",
  "make_real_live:hosted_website": "Make real live: hosted website",
  "make_real_live:tenant_content": "Make real live: website sections",
  "make_real_live:inquiry_form": "Make real live: inquiry form",
  "make_real_live:booking_page": "Make real live: booking page",
  "make_real_live:internal_app": "Make real live: internal app",
  connected_sites: "Connected sites",
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
