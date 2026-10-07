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

export type SystemKind = "website" | "inquiries" | "bookings" | "document" | "app" | "tracker" | "onboarding" | "listing" | "newsletter";

/** Intended operation only. Health is a separate signal (RULE_SYSTEM_PAUSE_HEALTH). */
export type SystemLifecycle = SpineLifecycle;

/** src/platform/system-health status. `unknown` means no fresh evidence, never "fine". */
export type SystemHealthState = HealthStatus;

export interface SystemHealth {
  state: SystemHealthState;
  /** One plain sentence from the evidence. Never claims a check that did not happen. */
  summary: string;
  lastVerifiedAt?: string | null;
  signals?: string[];
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
  /** Why it went back to Exploring, in plain words. */
  staleReason?: string;
}

/** Make real that is running or partly live, as the System page and In progress read it. */
export interface SystemActivation {
  id: string;
  title: string;
  headline: string;
  partlyLive: boolean;
  done: number;
  total: number;
  lines: ReadonlyArray<{ label: string; state: string; detail: string | null }>;
}

/** One past change to a System. Never called a Version. */
export interface SystemHistoryRow {
  id: string;
  sentence: string;
  at: string;
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
  /** `editing`: Strelva edits the content in the workspace (`native`), or every change is a repo Request (`request`). */
  | { kind: "website"; domain?: string; liveUrl?: string; previewSrc?: string; previewLabel: string; manageHref?: string; editing?: "native" | "request" }
  | { kind: "inquiries"; tenantId: string }
  | { kind: "work"; workId: string; productId: string }
  /** A Google listing: its health in words and what Strelva did on Google. */
  | { kind: "listing"; healthMessage: string; receipts: ReadonlyArray<{ id: string; headline: string; at: string; status: string }>; unavailable?: boolean }
  | { kind: "newsletter"; audience: string };

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
  /** Views of this System kept on the managed site (a Bookings System's schedule and roster). */
  views?: Array<{ id: string; label: string; href?: string }>;
  /** Issued audits of this website (website audits and AI visibility assessments). Not Systems. */
  audits?: Array<{ workId: string; title: string; at: string }>;
  /** Parts of this System that are not Systems themselves (a website's blog). */
  parts?: ReadonlyArray<{ label: string; published: number; drafts: number }>;
  /** In-context offers, e.g. connecting Google for this website. */
  offers?: ReadonlyArray<{ kind: "connect_google"; label: string }>;
  /** Make real in progress or partly live that changes this System. */
  activations?: SystemActivation[];
  /** The last changes, newest first: revisions and Strelva handled receipts. */
  history?: SystemHistoryRow[];
}

/** What a paused System still does (ADR 0011 rule 5). */
export const PAUSED_KEEPS: Partial<Record<SystemKind, string>> = {
  bookings: "Paused. Bookings already made are kept.",
  inquiries: "Paused. Inquiries already received are kept.",
  website: "Paused. Its pages and history are kept.",
  newsletter: "Paused. Subscribers are kept.",
};

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
  // Retired as a customer label: a tracker is an internal tool started from a list.
  tracker: "Internal tool",
  onboarding: "Client onboarding",
  listing: "Google listing",
  newsletter: "Newsletter",
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
  /** Live Make real started (or why not): the result settles on the page as it runs. */
  | { kind: "live"; headline: string; started: boolean }
  | { kind: "permission"; message: string }
  | { kind: "error"; message: string };

/** Plain customer copy for an isolated Make real run. Never implies a live change. */
export function makeRealSummary(result: WorkspaceMakeRealResult): string {
  const live = result.liveUnchanged ? "Your live systems are unchanged." : "Some systems switched in the isolated copy only; your live systems are unchanged.";
  return `Outside effects aren\u2019t connected yet, so this ran on an isolated copy. ${live} Nothing was published, sent, booked or charged.`;
}
