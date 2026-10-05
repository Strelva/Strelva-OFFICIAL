/**
 * Presentation view-model for the Systems, Connections, Possibilities and
 * Versions customer model (PRODUCT_MODEL.md DESIGN_SYSTEMS_PRODUCT_MODEL).
 *
 * // reconcile with src/platform/systems
 * Lane B owns the domain (`SystemRef`, lifecycle and lineage contracts). This
 * file only describes what the workspace renders. Nothing here grants access,
 * activates a Possibility or copies data between Versions. When the platform
 * module lands, replace the read adapter in `from-workspace.ts` and keep these
 * shapes as the UI contract (or map them 1:1).
 */

/** Customer-facing name of the whole set. Jacob still owns the brand call; rename here only. */
export const SYSTEMS_LABEL = "Systems";
export const SYSTEMS_LIST_LABEL = "All systems and files";

export type SystemKind = "website" | "inquiries" | "bookings" | "document" | "app" | "tracker" | "onboarding";

/** Intended operation only. Health is a separate signal (RULE_SYSTEM_PAUSE_HEALTH). */
export type SystemLifecycle = "draft" | "live" | "paused";

export type SystemHealthState = "working" | "needs_you" | "degraded" | "unchecked";

export interface SystemHealth {
  state: SystemHealthState;
  /** One plain sentence. Never claims a check that did not happen. */
  summary: string;
}

export type SystemConnectionKind = "read" | "act" | "appear" | "share" | "depend" | "trigger";

export interface SystemConnection {
  id: string;
  kind: SystemConnectionKind;
  /** What it works with, e.g. "attymooney.com contact page". */
  target: string;
  /** Another System, when the target is one. */
  systemId?: string;
  /** The sentence a customer reads, e.g. "Inquiries arrive from the website". */
  sentence: string;
  status: "connected" | "not_connected" | "unknown";
}

export type PossibilityStatus = "exploring" | "ready";

export interface SystemPossibility {
  id: string;
  title: string;
  summary: string;
  status: PossibilityStatus;
  /** Systems it would change, by id. A Possibility can span several. */
  affects: readonly string[];
  /** Systems it would introduce that do not exist yet. */
  introduces?: readonly string[];
  /** Recorded evidence behind the alternative, e.g. counts from a rebuild. */
  evidence?: string;
  /** Same-origin rendering of the alternative, used for side-by-side compare. */
  previewSrc?: string;
  /** Where the alternative can be opened and used in full. */
  openHref?: string;
}

export interface SystemVersion {
  id: string;
  relation: "source" | "version";
  /** The context it is adapted for: a location, a client business, a segment. */
  context: string;
  title: string;
  /** Lineage sentence. Say "not recorded" rather than inventing one. */
  lineage: string;
  systemId?: string;
  href?: string;
}

export type SystemSurface =
  | { kind: "website"; domain?: string; liveUrl?: string; previewSrc?: string; previewLabel: string; manageHref?: string }
  | { kind: "inquiries"; tenantId: string }
  | { kind: "work"; workId: string; productId: string };

export interface SystemView {
  id: string;
  kind: SystemKind;
  name: string;
  /** Short line under the name: domain, source, or what it is for. */
  detail: string;
  lifecycle: SystemLifecycle;
  health: SystemHealth;
  surface: SystemSurface;
  /** Who builds and runs it, when recorded. Managed customers never have to. */
  operatedBy?: string;
  connections: SystemConnection[];
  possibilities: SystemPossibility[];
  versions: SystemVersion[];
}

export interface NeedsYouItem {
  id: string;
  title: string;
  detail: string;
  href?: string;
  workId?: string;
  systemId?: string;
}

export const SYSTEM_KIND_LABEL: Record<SystemKind, string> = {
  website: "Website",
  inquiries: "Inquiries",
  bookings: "Bookings",
  document: "Document",
  app: "Internal tool",
  tracker: "Tracker",
  onboarding: "Client onboarding",
};

export const LIFECYCLE_LABEL: Record<SystemLifecycle, string> = { draft: "Draft", live: "Live", paused: "Paused" };

export const HEALTH_LABEL: Record<SystemHealthState, string> = {
  working: "Working",
  needs_you: "Needs you",
  degraded: "Something is off",
  unchecked: "Not checked here yet",
};

export const POSSIBILITY_STATUS_LABEL: Record<PossibilityStatus, string> = { exploring: "Exploring", ready: "Ready" };

export const CONNECTION_KIND_LABEL: Record<SystemConnectionKind, string> = {
  read: "Reads", act: "Acts on", appear: "Appears on", share: "Shares with", depend: "Depends on", trigger: "Starts work in",
};

export const siteSystemId = (tenantId: string) => `site:${tenantId}`;
export const inquirySystemId = (tenantId: string) => `inquiries:${tenantId}`;
export const workSystemId = (workId: string) => `work:${workId}`;

export function systemHref(base: string, workspaceId: string, systemId: string): string {
  const params = new URLSearchParams({ view: "system", system: systemId, workspaceId });
  return `${base}/workspace?${params}`;
}

/** Make real is a customer action, but activation is not connected yet (COMP_MULTI_SYSTEM_ACTIVATION). */
export interface MakeRealResult {
  status: "not_connected";
  message: string;
}

export function requestMakeReal(possibility: Pick<SystemPossibility, "title">): MakeRealResult {
  return {
    status: "not_connected",
    message: `Activation is not connected yet. Nothing changed: "${possibility.title}" stays a possibility, and your live systems are untouched. Ask Strelva to make it real and the team will agree scope and a date with you first.`,
  };
}
