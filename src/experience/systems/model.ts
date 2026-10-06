/**
 * Presentation view-model for the Systems, Connections, Possibilities and
 * Versions customer model (PRODUCT_MODEL.md DESIGN_SYSTEMS_PRODUCT_MODEL).
 *
 * A thin projection over the spine: `id` is the spine's systemId (the
 * SystemRef within this business), lifecycle is the spine's SystemLifecycle
 * and health is src/platform/system-health's status. This file only adds what
 * the workspace renders: icons, labels, the surface that opens and the
 * sentences customers read. Nothing here grants access, activates a
 * Possibility or copies data between Versions.
 */
import type { SystemLifecycle as SpineLifecycle } from "@/platform/systems/contracts";
import type { HealthStatus } from "@/platform/system-health/contracts";
import type { WorkspaceMakeRealResult, WorkspaceSnapshot } from "@/experience/workspace/contracts";

/** Customer-facing name of the whole set. Jacob still owns the brand call; rename here only. */
export const SYSTEMS_LABEL = "Systems";
export const SYSTEMS_LIST_LABEL = "All systems and files";

export type SystemKind = "website" | "inquiries" | "bookings" | "document" | "app" | "tracker" | "onboarding";

/** Intended operation only. Health is a separate signal (RULE_SYSTEM_PAUSE_HEALTH). */
export type SystemLifecycle = SpineLifecycle;

/** src/platform/system-health status. `unknown` means no fresh evidence, never "fine". */
export type SystemHealthState = HealthStatus;

export interface SystemHealth {
  state: SystemHealthState;
  /** One plain sentence from the evidence. Never claims a check that did not happen. */
  summary: string;
  lastVerifiedAt?: string | null;
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
  /** `in`: another System points at this one (the form that appears on this site). */
  direction?: "out" | "in";
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
  /** The spine's systemId. Together with the workspace id it is the SystemRef. */
  id: string;
  kind: SystemKind;
  name: string;
  /** Short line under the name: domain, source, or what it is for. */
  detail: string;
  /** Why the lifecycle reads as it does, when the spine records it. */
  basis?: string;
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
  healthy: "Working",
  degraded: "Something is off",
  blocked: "Not working",
  unknown: "Unknown",
};

export const POSSIBILITY_STATUS_LABEL: Record<PossibilityStatus, string> = { exploring: "Exploring", ready: "Ready" };

export const CONNECTION_KIND_LABEL: Record<SystemConnectionKind, string> = {
  read: "Reads", act: "Acts on", appear: "Appears on", share: "Shares with", depend: "Depends on", trigger: "Starts work in",
};

/** The same Connection read from its target. */
export const INCOMING_CONNECTION_LABEL: Record<SystemConnectionKind, string> = {
  read: "Read by", act: "Acted on by", appear: "Shows", share: "Shared with", depend: "Needed by", trigger: "Started by",
};

/**
 * The Systems model renders only when the server's snapshot says
 * STRELVA_SYSTEMS_RELEASE is on. Absent reads as off.
 */
export function systemsReleased(snapshot: Pick<WorkspaceSnapshot, "releases">): boolean {
  return snapshot.releases?.systems === true;
}

export function systemHref(base: string, workspaceId: string, systemId: string): string {
  const params = new URLSearchParams({ view: "system", system: systemId, workspaceId });
  return `${base}/workspace?${params}`;
}

export type MakeRealOutcome =
  | { kind: "result"; result: WorkspaceMakeRealResult }
  | { kind: "permission"; message: string }
  | { kind: "error"; message: string };

/** Plain customer copy for an isolated Make real run. Never implies a live change. */
export function makeRealSummary(result: WorkspaceMakeRealResult): string {
  const live = result.liveUnchanged ? "Your live systems are unchanged." : "Some systems switched in the isolated copy only; your live systems are unchanged.";
  return `Outside effects aren\u2019t connected yet, so this ran on an isolated copy. ${live} Nothing was published, sent, booked or charged.`;
}
