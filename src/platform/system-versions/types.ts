import type { JsonObject, JsonValue, ThreeWayChange, ThreeWayConflict } from "./compare";
import type { SystemRef, SystemRevisionRef } from "./refs";

/** Where a Version works differently. Not a point in time. */
export const VERSION_CONTEXT_KINDS = ["location", "customer_segment", "agency_client", "franchise"] as const;
export type VersionContextKind = (typeof VERSION_CONTEXT_KINDS)[number];

export interface VersionContext {
  kind: VersionContextKind;
  /** Human label, for example "Mooney Firm, Buffalo office". */
  label: string;
}

// On the server the actor comes from `read_version_actor` (direct workspace
// memberships plus provider seats, src/platform/system-versions/supabase-store.ts).
// A provider seat is the agency's standing access to a client business
// (20261009151000_provider_seats.sql) and counts like a direct membership
// with the seat's role. Postgres rechecks every call, including agency
// scope, which this shape does not carry: a partner agency with neither a
// membership nor a seat is refused here first.
export type VersionRole = "owner" | "admin" | "member";
export type VersionMembershipVia = "membership" | "provider_seat";
export interface VersionActor {
  userId: string;
  /** Required by the Postgres store, which rechecks the actor in the database. */
  verifiedEmail?: string;
  memberships: ReadonlyArray<{ businessId: string; role: VersionRole; via?: VersionMembershipVia }>;
}

/** The authoring side of lineage. Only its business can publish revisions. */
export interface SourceSystemRecord {
  source: SystemRef;
  /** Businesses that may base Versions on this source and see its improvements. */
  sharedWith: string[];
  createdAt: string;
}

/**
 * One immutable published revision of a source System's shareable definition.
 * It carries shape and rules only: never records, bindings, grants or secrets.
 */
export interface SourceRevision {
  source: SystemRevisionRef;
  /** Optional display label, for example an offering semver "1.0.0". */
  label?: string;
  summary: string;
  definition: JsonObject;
  requires: { bindingKinds: string[] };
  publishedBy: string;
  publishedAt: string;
}

/** A path the descendant changed relative to its baseline. Business-owned. */
export interface VersionOverride {
  path: string;
  /** `null` is a real value (for example "follow-up turned off"). */
  value: JsonValue;
  setBy: string;
  setAt: string;
}

/**
 * An account or resource this Version uses. Bindings are chosen locally and
 * are never copied from the source or from another Version.
 */
export interface LocalBinding {
  kind: string;
  connectionId: string;
  ownerBusinessId: string;
  boundBy: string;
  boundAt: string;
}

/** The Version's own release history. Independent of source revisions. */
export interface VersionRelease {
  number: number;
  definition: JsonObject;
  /** The source revision this release was based on, for traceability only. */
  baselineRevision: number;
  overridePaths: string[];
  releasedBy: string;
  releasedAt: string;
}

export type VersionDecision =
  | { sourceRevision: number; choice: "adopted"; resolutions: VersionConflictResolution[]; by: string; at: string }
  | { sourceRevision: number; choice: "declined"; reason: string; by: string; at: string };

export type VersionGrantScope = "lineage" | "lineage_and_data";
export interface VersionGrant {
  granteeBusinessId: string;
  scope: VersionGrantScope;
  grantedBy: string;
  grantedAt: string;
  revokedAt?: string;
}

export interface VersionLineage {
  id: string;
  /** The descendant's own business-owned System identity. */
  version: SystemRef;
  source: SystemRef;
  context: VersionContext;
  baseline: { revision: number; definition: JsonObject };
  overrides: VersionOverride[];
  bindings: LocalBinding[];
  /** Context-specific data (branding, local records references). Never shared. */
  localData: Record<string, JsonValue>;
  releases: VersionRelease[];
  currentRelease: number | null;
  decisions: VersionDecision[];
  grants: VersionGrant[];
  /** Optimistic concurrency for this row, not a release number. */
  rowRevision: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type ImprovementStatus = "up_to_date" | "auto_applicable" | "blocked";

export interface ImprovementComparison {
  versionId: string;
  baselineRevision: number;
  sourceRevision: number;
  summary: string;
  status: ImprovementStatus;
  changes: ThreeWayChange[];
  conflicts: ThreeWayConflict[];
  /** Required binding kinds this Version has not bound locally. */
  missingBindings: string[];
  /** Working definition if adopted with conflicts kept local. */
  preview: JsonObject;
}

export interface VersionConflictResolution {
  path: string;
  choice: "keep_local" | "take_upstream";
}

export interface VersionView {
  id: string;
  version: SystemRef;
  source: SystemRef;
  context: VersionContext;
  baselineRevision: number;
  overrides: VersionOverride[];
  workingDefinition: JsonObject;
  releases: VersionRelease[];
  currentRelease: number | null;
  decisions: VersionDecision[];
  access: "owner" | VersionGrantScope;
  /** Present only for the owning business. */
  bindings?: LocalBinding[];
  /** Present for the owning business or a `lineage_and_data` grant. */
  localData?: Record<string, JsonValue>;
  grants?: VersionGrant[];
}

export class VersionAccessError extends Error {
  constructor(message = "This Version is unavailable to your account.") {
    super(message);
    this.name = "VersionAccessError";
  }
}

export class VersionValidationError extends Error {
  constructor(message = "The Version request is invalid.") {
    super(message);
    this.name = "VersionValidationError";
  }
}

export class VersionStaleError extends Error {
  constructor(message = "This Version changed. Reload it before trying again.") {
    super(message);
    this.name = "VersionStaleError";
  }
}

export class VersionConflictError extends Error {
  constructor(readonly conflicts: ThreeWayConflict[], message = "This improvement overlaps local changes. Choose keep local or take upstream for each conflict.") {
    super(message);
    this.name = "VersionConflictError";
  }
}

export class VersionIncompatibleError extends Error {
  constructor(readonly missingBindings: string[], message = `This improvement needs local accounts this Version has not connected: ${missingBindings.join(", ")}.`) {
    super(message);
    this.name = "VersionIncompatibleError";
  }
}
