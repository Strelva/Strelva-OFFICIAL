/**
 * How today's objects read as source Systems, Versions and releases.
 *
 * These are pure projections. They change no stored row, no /api/v1 field and
 * no release-manifest key. They exist so lineage can be adopted object by
 * object without renaming anything that is already deployed.
 */
import type { JsonObject } from "./compare";
import { projectedRevisionRef, type SystemRef, type SystemRevisionRef } from "./refs";
import type { VersionContext } from "./types";
import type { OfferingDefinitionView, OfferingInstallationRecord } from "@/platform/offerings/types";
import type { AgencyManagedWebsiteDraftGrant } from "@/platform/offerings/agency-website-draft-contracts";

/** Platform-authored definitions are owned by Strelva's own business record. */
export const STRELVA_AUTHOR_BUSINESS_ID = "strelva";

/**
 * Offering versions are semver strings; lineage revisions are integers.
 * major*1e6 + minor*1e3 + patch keeps order and is reversible.
 */
export function revisionFromSemver(version: string): number {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(version);
  if (!match) throw new Error(`Offering version ${version} is not plain semver.`);
  return Number(match[1]) * 1_000_000 + Number(match[2]) * 1_000 + Number(match[3]);
}

export function semverFromRevision(revision: number): string {
  return `${Math.floor(revision / 1_000_000)}.${Math.floor(revision / 1_000) % 1_000}.${revision % 1_000}`;
}

export interface SourceRevisionProjection {
  source: SystemRevisionRef;
  label: string;
  definition: JsonObject;
  requires: { bindingKinds: string[] };
}

/** An offering definition is a Strelva-authored source System revision. */
export function offeringDefinitionAsSource(definition: OfferingDefinitionView): SourceRevisionProjection {
  return {
    source: projectedRevisionRef(
      { businessId: STRELVA_AUTHOR_BUSINESS_ID, systemId: `offering:${definition.id}` },
      revisionFromSemver(definition.version),
    ),
    label: definition.version,
    // The shareable part only: copy, scopes, surfaces and configuration shape.
    definition: JSON.parse(JSON.stringify({
      name: definition.name,
      description: definition.description,
      scopes: definition.scopes,
      surfaces: definition.surfaces,
      configurationFields: definition.configurationFields,
      requiredResources: definition.requiredResources,
    })) as JsonObject,
    requires: {
      bindingKinds: [...new Set(definition.requiredResources.filter((item) => item.minimum > 0).map((item) => item.kind))].sort(),
    },
  };
}

export interface VersionProjection {
  version: SystemRef;
  source: SystemRevisionRef;
  context: VersionContext | null;
  /** Business-owned paths that differ from the source. */
  overridePaths: string[];
  /** Local bindings as `kind -> resource id`; never copied from the source. */
  bindings: Array<{ kind: string; connectionId: string; ownerBusinessId: string }>;
  /** The Version's own release pointer, or null when nothing is live. */
  currentRelease: number | null;
  /** Row concurrency token, when the object has one. Not a release and not a lineage revision. */
  rowRevision: number | null;
  lifecycle: "candidate" | "released" | "retired";
}

/**
 * An offering installation is a Version of the offering source owned by the
 * installing business. Configuration is the override set; native resources are
 * local bindings. Context is not recorded today, so it is null.
 */
export function offeringInstallationAsVersion(installation: OfferingInstallationRecord): VersionProjection {
  return {
    version: { businessId: installation.businessId, systemId: `offering-installation:${installation.id}` },
    source: projectedRevisionRef(
      { businessId: STRELVA_AUTHOR_BUSINESS_ID, systemId: `offering:${installation.definitionId}` },
      revisionFromSemver(installation.definitionVersion),
    ),
    context: null,
    overridePaths: Object.keys(installation.configuration).sort().map((key) => `configuration.${key}`),
    bindings: installation.nativeResources.map((resource) => ({
      kind: resource.kind,
      connectionId: resource.id,
      ownerBusinessId: installation.businessId,
    })),
    // Activation is the only release an installation has today: one release.
    currentRelease: installation.status === "draft" ? null : 1,
    rowRevision: installation.revision,
    lifecycle: installation.status === "draft" ? "candidate" : installation.status === "active" ? "released" : "retired",
  };
}

/**
 * Structural copy of the inquiry PatternInstallation fields lineage needs.
 * Platform code does not import from src/products.
 */
export interface PatternInstallationLike {
  id: string;
  businessId: string;
  capabilityId: string;
  sourceBusinessId: string;
  sourceCapabilityId: string;
  sourceVersion: number;
  targetVersion: number;
  status: "installed" | "update_available" | "conflicted";
}

/**
 * The inquiry pattern installation is already a working lineage: a source
 * capability in one business, a target capability in another, a pinned
 * source version and a separate target version. It maps one to one.
 */
export function patternInstallationAsVersion(installation: PatternInstallationLike): VersionProjection & {
  improvement: "none" | "auto_applicable" | "blocked";
} {
  return {
    version: { businessId: installation.businessId, systemId: `inquiry:${installation.capabilityId}` },
    source: projectedRevisionRef(
      { businessId: installation.sourceBusinessId, systemId: `inquiry:${installation.sourceCapabilityId}` },
      installation.sourceVersion,
    ),
    context: installation.sourceBusinessId === installation.businessId
      ? null
      : { kind: "agency_client", label: `Installed from ${installation.sourceBusinessId}` },
    overridePaths: [],
    bindings: [],
    currentRelease: installation.targetVersion,
    rowRevision: null,
    lifecycle: "released",
    improvement: installation.status === "conflicted" ? "blocked" : installation.status === "update_available" ? "auto_applicable" : "none",
  };
}

export interface DraftPossibilityProjection {
  kind: "possibility";
  /** The client's own System the draft would change. The agency never owns it. */
  system: SystemRef;
  /** Prepared by a provider under the client's expiring grant. */
  preparedByBusinessId: string;
  /** A draft is a candidate change on one System, never a Version or lineage. */
  createsVersion: false;
  grantActive: boolean;
}

/**
 * An agency website draft is a Possibility on a client-owned System: one
 * candidate change, prepared by the agency under an expiring grant, for the
 * client to review. It is not a Version. The agency Version case is different:
 * the agency's reusable website setup is a source, and each client site is a
 * business-owned Version of it. An upstream improvement offered to that client
 * would itself arrive as a Possibility on the client's System.
 */
export function agencyWebsiteDraftAsPossibility(grant: AgencyManagedWebsiteDraftGrant, at = new Date().toISOString()): DraftPossibilityProjection {
  return {
    kind: "possibility",
    system: { businessId: grant.businessWorkspaceId, systemId: `managed-website:${grant.managedWebsiteBindingId}` },
    preparedByBusinessId: grant.agencyWorkspaceId,
    createsVersion: false,
    grantActive: grant.status === "active" && Date.parse(grant.expiresAt) > Date.parse(at),
  };
}

export interface MultiSiteAccountInput {
  businessId: string;
  accountName: string;
  /** Tenant slugs on the account, for example `twintrees-camillus`. */
  tenantIds: readonly string[];
  /** Optional readable location labels keyed by tenant slug. */
  locationLabels?: Readonly<Record<string, string>>;
}

export interface MultiSiteVersionPlan {
  source: SystemRef;
  versions: Array<{ version: SystemRef; tenantId: string; context: VersionContext }>;
  /**
   * Conversion must ask first: if the locations are separate legal
   * businesses they become separate workspaces sharing a source instead.
   */
  requiresOwnerConfirmation: true;
}

/**
 * One account paying for several location sites (Twin Trees: Camillus and
 * Fayetteville) is the first real same-business Version case: one website
 * System with one location Version per site. Each Version binds its own
 * domain and calendar. This is a plan only; it converts nothing.
 */
export function multiSiteAccountAsVersions(input: MultiSiteAccountInput): MultiSiteVersionPlan {
  if (input.tenantIds.length < 2) throw new Error("A multi-site Version plan needs at least two sites.");
  const shared = input.tenantIds.reduce((prefix, slug) => {
    let index = 0;
    while (index < prefix.length && prefix[index] === slug[index]) index += 1;
    return prefix.slice(0, index);
  });
  const stem = shared.replace(/-+$/, "") || "website";
  return {
    source: { businessId: input.businessId, systemId: `website:${stem}` },
    versions: input.tenantIds.map((tenantId) => ({
      version: { businessId: input.businessId, systemId: `website:${tenantId}` },
      tenantId,
      context: {
        kind: "location" as const,
        label: input.locationLabels?.[tenantId] ?? `${input.accountName}, ${tenantId.slice(shared.length) || tenantId}`,
      },
    })),
    requiresOwnerConfirmation: true,
  };
}

/**
 * Q_CONTEXT_RELEASE_AXIS: every existing version-like field, and which axis it
 * already means. No existing `version` column means a contextual Version; they
 * are all temporal history, concurrency, platform or contract. Two fields pin
 * a Version to a source's temporal revision (the lineage baseline). Nothing is
 * renamed. Contextual identity is new: lineage adds fields beside these.
 */
export type ReleaseAxis =
  /** Which source revision a Version is based on. */
  | "lineage_baseline"
  /** A Version's own internal release over time. */
  | "version_release"
  /** Draft or row compare-and-set token. Neither axis. */
  | "concurrency"
  /** The Strelva app build itself. Neither axis for customer Systems. */
  | "platform_release"
  /** The /api/v1 contract family. Neither axis. */
  | "api_contract";

export interface ReleaseAxisField {
  location: string;
  field: string;
  axis: ReleaseAxis;
  meaning: string;
}

export const RELEASE_AXIS_FIELDS: readonly ReleaseAxisField[] = [
  { location: "release-manifest.json", field: "version", axis: "platform_release", meaning: "The Strelva app release. Every client shares it; it is not any client's System release." },
  { location: "release-manifest.json", field: "contractVersion", axis: "api_contract", meaning: "The v1 contract family. Breaking changes need a new family, never a Version." },
  { location: "release-manifest.json", field: "customRepoWorkspace.repos[].compatibleTag", axis: "version_release", meaning: "One client site's own release, checked against the shared contract." },
  { location: "release-manifest.json", field: "customRepoWorkspace.repos[].compatibleCommit", axis: "version_release", meaning: "The exact commit of that client release." },
  { location: "src/lib/scaffold-contracts.ts", field: "SCAFFOLD_CONTRACT_VERSION / REB_CONTRACT_VERSION", axis: "api_contract", meaning: "Same as contractVersion. Unchanged by lineage." },
  { location: "src/platform/offerings/types.ts", field: "OfferingDefinitionView.version", axis: "lineage_baseline", meaning: "Source revision label of a Strelva-authored source System." },
  { location: "src/platform/offerings/types.ts", field: "OfferingInstallationRecord.definitionVersion", axis: "lineage_baseline", meaning: "The source revision this installation (Version) is pinned to." },
  { location: "src/platform/offerings/types.ts", field: "OfferingInstallationRecord.revision", axis: "concurrency", meaning: "expectedRevision token for updates. Not a release." },
  { location: "src/products/inquiries/inquiry-pattern-updates.ts", field: "PatternInstallation.sourceVersion", axis: "lineage_baseline", meaning: "The accepted source capability version." },
  { location: "src/products/inquiries/inquiry-pattern-updates.ts", field: "PatternInstallation.targetVersion", axis: "version_release", meaning: "The target capability's own version at last accepted update." },
  { location: "src/products/custom-applications/contracts.ts", field: "CustomApplication.currentReleaseVersion / releases[]", axis: "version_release", meaning: "An app's own release history, one Version." },
  { location: "src/products/custom-applications/contracts.ts", field: "CustomApplication.candidate.revision", axis: "concurrency", meaning: "Draft edit token for the unreleased candidate." },
  { location: "src/platform/offerings/agency-website-draft-contracts.ts", field: "AgencyWebsiteDraftState.revision", axis: "concurrency", meaning: "Per-section draft token on a client site. A draft is a candidate, not a release." },
];
