import type { ConnectionKind, ConnectionState, SystemLifecycle, SystemRef } from "@/platform/systems/contracts";
import type { HealthStatus } from "@/platform/system-health/contracts";
import type { AiVisibilityResult } from "@/products/ai-visibility/contracts";
import type { AssessmentResult } from "@/products/assessment";
import type { TrackerExperimentComparison } from "@/products/tracker/client";
import type { TrackerHandoffPreview } from "@/products/tracker/contracts";
import type { WorkspaceExitState } from "@/platform/workspace-exit/contracts";

/** Browser response contract. Internal membership and invitation secrets stay server-side. */
export interface WorkspaceSummary {
  id: string;
  kind: "personal" | "agency" | "customer";
  name: string;
  access?: "member" | "delegated_read";
  role?: "owner" | "admin" | "member";
}

/**
 * Browser-safe payload currently supported by the release-one workspace.
 * Product-specific validation and rendering live with the product; this alias
 * only keeps existing UI callers strongly typed during the migration.
 */
export type WorkspaceWorkPayload = AiVisibilityResult;

/** Browser-safe projection of the original operator-reported experiment. */
export interface WorkspaceLegacyExperiment {
  version: 1;
  targetWorkId: string;
  targetRevision: number;
  recordedBy: string;
  recordedAt: string;
  hypothesis: string;
  workload: string;
  baselineMinutes: number;
  setupMinutes: number;
  reviewMinutes: number;
  correctionMinutes: number;
  providerCostUsd: number | null;
  result: "passed" | "failed" | "inconclusive";
  evidence: string;
  observedMinutes: number;
  differenceMinutes: number;
  evidenceKind: "operator_reported";
  promoted: false;
}

/** Browser-safe projection of a bounded same-workload candidate comparison. */
export type WorkspaceExperimentComparison = TrackerExperimentComparison & Required<Pick<TrackerExperimentComparison, "targetWorkId" | "targetRevision" | "recordedBy" | "recordedAt">>;

/** Both versions stay readable while the stored research row migrates. */
export type WorkspaceExperiment = WorkspaceLegacyExperiment | WorkspaceExperimentComparison;

export interface WorkspaceWork<TPayload = WorkspaceWorkPayload> {
  operation?: { status: string; reason?: string };
  workPlan?: { summary: string; status: "ready" | "needs_scoping"; outputCount?: number };
  document?: Pick<import("@/products/documents/contracts").WorkspaceDocument, "title" | "revision">;
  id: string;
  workspaceId: string;
  title: string;
  productId: string;
  resourceKind: string;
  payload: TPayload | null;
  auditPayload?: import("@/products/website-audit/client").AuditResult | null;
  /** Explicit method/payload/action descriptor for supported assessments. */
  assessment?: AssessmentResult;
  /** Safe, typed projection for research experiments; raw payload stays server-side. */
  experiment?: WorkspaceExperiment;
  /** Bounded tracker data shown only after recipient-bound handoff inspection. */
  tracker?: TrackerHandoffPreview;
  sourceWorkId?: string;
  unavailableReason?: string;
  input: Record<string, unknown>;
  createdAt: string;
}

/**
 * A link to an existing managed-presence tenant.
 *
 * Managed tenants remain the source entity during this migration. They are
 * deliberately not copied into `saved_product_work`; the shared workspace
 * only receives a browser-safe pointer after the server verifies the current
 * user's tenant membership.
 */
export interface ManagedWork {
  id: string;
  title: string;
  href: string;
  productId: "managed_presence";
  relationship: "client" | "enterprise";
  /** Public hostname of the live site, when the tenant records one. Additive. */
  domain?: string;
  /** Same-origin rendering of the site (local fixtures only today). */
  previewHref?: string;
}

export interface WorkspaceHandoff {
  id: string;
  sourceWorkId: string;
  recipientEmail: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string;
  createdAt: string;
}

export interface WorkspaceDelegation {
  id: string;
  workId: string;
  /** Customer scope named by this delegation. Older stored browser snapshots may omit it. */
  customerWorkspaceId?: string;
  agencyWorkspaceId: string;
  status: "active" | "revoked";
  /** Only customer owners can revoke agency read access. */
  canRevoke: boolean;
}

/** A business this agency operates (provider of record). A label, not access:
 * the server lists only businesses the actor already belongs to. */
export interface WorkspaceProvidedClient {
  customerWorkspaceId: string;
  name: string;
  startedAt: string;
}

export interface WorkspaceProduct {
  id: string;
  name: string;
  description: string;
  availability: "available" | "managed" | "not_enabled" | "release_gated";
  /** Server-generated, allowlisted preview destination for an external product. */
  previewHref?: string;
}

export interface WorkspaceSnapshot {
  actor: { email: string; localPreview: boolean };
  workspaces: WorkspaceSummary[];
  workspaceId: string;
  /** Completed owner exit state, when the current actor can read it. */
  workspaceExitState?: WorkspaceExitState | null;
  /** Whether the durable exit state could be checked for this snapshot. */
  workspaceExitReadStatus?: "available" | "completed" | "not_owner" | "unavailable";
  work: WorkspaceWork[];
  pendingAssessments?: Array<{ id: string; status: string; createdAt: string }>;
  /** Existing managed sites visible to this verified account, if any. */
  managedWork?: ManagedWork[];
  /** True only when managed-site discovery was partially unavailable. */
  managedWorkUnavailable?: boolean;
  handoffs: WorkspaceHandoff[];
  delegations: WorkspaceDelegation[];
  /** Businesses the selected agency operates that the actor can open as a
   * member (workspace_providers intersected with membership). Absent when
   * not an agency, or when the provider list could not be read. Additive. */
  providedClients?: WorkspaceProvidedClient[];
  products: WorkspaceProduct[];
  /** The business's Systems from the spine, with health and Possibilities.
   * Absent for personal and agency workspaces. Additive. */
  systems?: WorkspaceSystems;
  /** Server-read release flags the browser needs to choose what to render.
   * Absent means off. `systems`: STRELVA_SYSTEMS_RELEASE, which gates the
   * Systems model (Home Systems, System pages, Possibilities, Make real,
   * Versions). Additive. */
  releases?: WorkspaceReleases;
}

export interface WorkspaceReleases {
  systems: boolean;
  /** STRELVA_NEEDS_YOU_RELEASE: Home reads Needs you and Strelva handled from the policy model. */
  needsYou?: boolean;
  /** Ask Strelva opens in this workspace: STRELVA_ASK_RELEASE and the workspace release on, and Systems on for this workspace. */
  ask?: boolean;
  /** STRELVA_INQUIRIES_RELEASE for this workspace (per-workspace row under `workspace`). */
  inquiries?: boolean;
  /** Durable customer inbox instead of the internal inquiry builder. */
  inquiryInbox?: boolean;
  /** STRELVA_WEBSITE_REBUILD_RELEASE for this workspace. Absent: the page's env value decides. */
  websiteRebuild?: boolean;
  /** Connected sites on for this business (its `connected_sites` row, and Systems): Home links to /workspace/site. */
  connectedSites?: boolean;
}

/**
 * Browser-safe projection of the System spine (src/platform/systems), System
 * health (src/platform/system-health) and Possibilities
 * (src/platform/possibilities), built on the server. Identity is the spine's
 * SystemRef; nothing here is a second model.
 */
export interface WorkspaceSystems {
  /** `unavailable`: the spine read failed. Nothing about any System is claimed. */
  status: "ready" | "unavailable";
  systems: WorkspaceSystemEntry[];
  connections: WorkspaceSystemConnection[];
  possibilities: WorkspaceSystemPossibility[];
  /**
   * Stored Version lineage in the actor's scope (read_business_versions).
   * Absent when it was not read; then no lineage is claimed. Hidden
   * same-business sources are already left out of `systems`.
   */
  versions?: WorkspaceSystemVersion[];
  /** Google listing, newsletter and website parts. Present only while
   * STRELVA_PUBLISHING_RELEASE is on. Additive. */
  publishing?: WorkspacePublishing;
  /** Make real that is running or partly live, one per activation, read from
   * Postgres. Absent when it could not be read; then nothing is claimed. Additive. */
  activations?: WorkspaceSystemActivation[];
  /** The last changes to each stored System, newest first. Additive. */
  history?: WorkspaceSystemHistoryRow[];
  /** Strelva handled receipts from Make real and Possibilities (last 7 days),
   * newest first. Never an isolated run. Additive. */
  handled?: WorkspaceSystemReceipt[];
}

export interface WorkspaceSystemActivation {
  id: string;
  possibilityId: string;
  title: string;
  status: "in_progress" | "needs_attention" | "made_real" | "rolled_back";
  /** "Making consult booking live: 2 of 4 done", "Partly live", "Live.", "Undone." */
  headline: string;
  partlyLive: boolean;
  done: number;
  total: number;
  /** System ids it changes. */
  affects: string[];
  lines: Array<{ label: string; state: string; detail: string | null }>;
}

export interface WorkspaceSystemHistoryRow {
  id: string;
  systemId: string;
  /** "Strelva published the rebuilt site". Never called a Version. */
  sentence: string;
  at: string;
  releaseRef?: string;
  implementationKind?: string;
}

export interface WorkspaceSystemReceipt {
  id: string;
  systemId: string | null;
  sentence: string;
  at: string;
  /** Undo state in words: "Undo from History", "Can't be undone: …". */
  undo: string;
}

export interface WorkspaceSystemVersion {
  id: string;
  /** The Version's own System in this business. */
  systemId: string;
  source: { businessId: string; systemId: string; name: string | null; hidden: boolean };
  context: { kind: string; label: string };
  baselineRevision: number;
  latestRevision: number | null;
  currentRelease: number | null;
  /** Source revisions this business declined. */
  declined: number[];
  /** Other Versions of the same source in this business (another location). */
  siblings: Array<{ id: string; systemId: string; context: { kind: string; label: string } }>;
}

export interface WorkspacePublishing {
  /** `unavailable`: the publishing read failed; nothing about it is claimed. */
  status: "ready" | "unavailable";
  listings: Array<{
    systemId: string;
    health: string;
    healthMessage: string;
    /** Strelva handled: newest first, in the customer's words. */
    receipts: Array<{ id: string; headline: string; status: string; at: string }>;
  }>;
  /** Blog and collections, as parts of the website System they appear on. */
  websiteParts: Record<string, Array<{ type: string; label: string; published: number; drafts: number }>>;
  /** In context, e.g. "Connect Google" on a website with no grant. */
  offers: Array<{ kind: "connect_google"; systemId: string; label: string }>;
}

export interface WorkspaceSystemEntry {
  ref: SystemRef;
  name: string;
  /** Spine descriptor slug, e.g. `website`, `inquiry`, `booking`, `internal_app`. */
  kind: string;
  /** Intended operation. Never derived from health. */
  lifecycle: SystemLifecycle;
  /** Why the lifecycle reads as it does, for an existing thing. */
  basis: string | null;
  savedWorkId: string | null;
  tenantId: string | null;
  /** What the evidence shows. Never derived from lifecycle. */
  health: { status: HealthStatus; summary: string; lastVerifiedAt: string | null; signals?: string[] };
  /** A Bookings System's day and week views on the managed site (wellness schedule, roster). */
  views?: Array<"schedule" | "roster">;
  /** A managed website: Strelva edits its content (`native`) or every change is a repo Request (`request`). */
  editing?: "native" | "request";
  /** Confirmed from this tenant's issued document and enabled business-facts runtime. */
  businessFactsConnected?: boolean;
  /** A website the business runs elsewhere, connected by script. Additive. */
  connectedSite?: { siteUrl: string; siteHost: string; verified: boolean; lastEventAt: string | null };
}

export interface WorkspaceSystemConnection {
  id: string;
  sourceId: string;
  kind: ConnectionKind;
  /** Set when the target is another System of this business. */
  targetSystemId: string | null;
  targetLabel: string;
  state: ConnectionState;
  purpose: string | null;
}

export interface WorkspaceSystemPossibility {
  id: string;
  title: string;
  summary: string;
  /** Customer lifecycle only: Exploring or Ready. */
  status: "exploring" | "ready";
  /** System ids it would change. */
  affects: string[];
  evidence: string | null;
  /** Same-origin rendering of the candidate. */
  previewHref: string | null;
  /** Signed isolated Try for a prepared native candidate. */
  tryHref?: string;
  /** The saved work the candidate came from. */
  workId: string;
  /** Stored in Postgres: it survives deploys and restarts. Additive. */
  stored?: boolean;
  /** Why it went back to Exploring ("attymooney.com changed since this was built."). Additive. */
  staleReason?: string | null;
}

/** Result of Make real on an isolated copy (src/platform/make-real/sandbox.ts). */
export interface WorkspaceMakeRealResult {
  /** Always true today: no real provider or live System is reachable. */
  isolated: true;
  status: "in_progress" | "needs_attention" | "made_real" | "rolled_back";
  /** describeActivation() headline. */
  headline: string;
  done: Array<{ label: string; mode: string | null }>;
  waiting: Array<{ label: string; reason: string }>;
  unknown: string[];
  notStarted: string[];
  liveUnchanged: boolean;
  /** Outside effects this change needs that are not connected. */
  notConnected: string[];
}

/** Live Make real from the System page: the owner's tap was the Needs you
 * decision and the durable activation started (or why not). */
export interface WorkspaceLiveMakeRealResult {
  live: true;
  /** Needs you decide status, or `not_ready`. */
  status: string;
  /** "Live.", "Partly live", or why nothing started. */
  headline: string;
  activationId: string | null;
}

export interface WorkspaceHandoffPreview<TPayload = WorkspaceWorkPayload> {
  recipientEmail: string;
  agencyName: string;
  work: WorkspaceWork<TPayload>;
  expiresAt: string;
  accepted: boolean;
  /** Current customer businesses the addressed actor may choose. */
  destinations?: WorkspaceHandoffDestinationOption[];
}

export type WorkspaceHandoffDestination =
  | { kind: "existing"; workspaceId: string }
  | { kind: "new"; name: string };

export interface WorkspaceHandoffDestinationOption {
  id: string;
  name: string;
}

export type WorkspaceAction =
  | { action: "create_agency"; name: string }
  | { action: "assess"; workspaceId: string; requestId?: string; business: string; url?: string; category?: string; location?: string }
  | { action: "recover_assessment"; workspaceId: string; requestId: string }
  | { action: "save_website_audit"; workspaceId: string; resultId: string }
  | { action: "save_public_result"; workspaceId: string; resultId: string }
  | { action: "handoff"; workId: string; recipientEmail: string }
  | { action: "inspect_handoff"; token: string }
  | { action: "accept_handoff"; token: string; destination: WorkspaceHandoffDestination; allowAgencyAccess: boolean }
  | { action: "revoke_delegation"; delegationId: string }
  | { action: "revoke_handoff"; handoffId: string };

// Action responses: create_agency { workspaceId }; assess/save_public_result { work };
// handoff { token }; accept_handoff { workspaceId, workId }; revocations { ok: true }.
// Errors always use { error: string }, with 401/403/404/409/429/503 as appropriate.
