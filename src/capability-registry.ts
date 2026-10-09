/**
 * One capability registry (Strelva Reborn section 7): every capability Strelva
 * declares, of every kind, behind one listing.
 *
 * The declarations still live where their kind is owned; this registry reads
 * each through an adapter, so a capability is declared once and enumerated
 * here. It sits at the app edge (beside register-workspace-ports.ts) because
 * two kinds are tenant-model declarations in src/lib and the rest are
 * workspace-layer declarations, and neither layer may import the other's.
 * Server-side composition: client components keep importing their own slice.
 * Qualification references are evidence scopes, not release or permission labels.
 *
 * Listing a capability grants nothing. Access, release state and execution
 * stay with the owning module (the operations registry still enforces exact
 * versions and entrances). src/lib/site-capabilities.ts is separate: it is
 * per-tenant v1 state served to client repos, not a declaration.
 */
import "server-only";
import { EXECUTABLE_CAPABILITY_QUALIFICATIONS, EXECUTABLE_CAPABILITY_DEFINITIONS } from "@/server/capabilities";
import {
  PRODUCT_CATALOG,
  listWorkspaceDiscoveryProducts,
  listWorkspaceExecutableProducts,
  type ProductDefinition,
  type WorkspaceExecutableDefinition,
} from "@/platform/products";
import { listOfferingDefinitions } from "@/platform/offerings/definitions";
import { getAllCapabilities } from "@/lib/capabilities";
import { FEATURE_REGISTRY } from "@/lib/features/registry";

import { isCapabilityQualified } from "@/platform/capabilities/qualification";
import type { ReleaseFlag } from "@/platform/release-flags/resolve";
import type { CapabilityContractRole, CapabilityQualificationView } from "@/platform/capabilities/inventory-contracts";

export type CapabilityKind =
  | "operation"
  | "workspace_executable"
  | "product"
  | "offering"
  | "agent_capability"
  | "dashboard_feature";

export interface CapabilityKindInfo {
  /** The file that declares this kind. Edit the declaration there. */
  declaredIn: string;
  /** What a capability of this kind is. */
  means: string;
  /** Whether the model it belongs to is the workspace or the older tenant model. */
  model: "workspace" | "tenant";
}

export const CAPABILITY_KINDS: Readonly<Record<CapabilityKind, CapabilityKindInfo>> = Object.freeze({
  operation: {
    declaredIn: "src/server/capabilities.ts",
    means: "An executable operation with versioned input and result schemas, entrances and local qualification.",
    model: "workspace",
  },
  workspace_executable: {
    declaredIn: "src/platform/products/executables.ts",
    means: "Native work the workspace can run under its local release.",
    model: "workspace",
  },
  product: {
    declaredIn: "src/platform/products/catalog.ts",
    means: "A descriptive commercial product. Grants nothing.",
    model: "workspace",
  },
  offering: {
    declaredIn: "src/platform/offerings/definitions.ts",
    means: "An installable offering with required resources, scopes and surfaces.",
    model: "workspace",
  },
  agent_capability: {
    declaredIn: "src/lib/capabilities.ts",
    means: "A tenant agent capability and the tools it offers.",
    model: "tenant",
  },
  dashboard_feature: {
    declaredIn: "src/lib/features/registry.ts",
    means: "A tenant dashboard feature or feature-set member. Not billing.",
    model: "tenant",
  },
});

export interface CapabilityEntry {
  /** `${kind}:${id}`, unique across the registry. */
  key: string;
  kind: CapabilityKind;
  id: string;
  name: string;
  description: string | null;
  declaredIn: string;
  /** Owner reference, not a copied declaration or a permission. */
  owner: Readonly<{ reference: string; model: "workspace" | "tenant" }>;
  contract: Readonly<{ reference: string; role: CapabilityContractRole }>;
  qualification: CapabilityQualificationView;
  availability: Readonly<{
    workspaceRelease: boolean;
    releaseFlags: readonly ReleaseFlag[];
    prerequisites: readonly string[];
  }>;
}

const ROLES: Readonly<Record<CapabilityKind, CapabilityContractRole>> = {
  operation: "executable", workspace_executable: "executable", product: "descriptive",
  offering: "installable", agent_capability: "tenant_tools", dashboard_feature: "dashboard",
};

function entry(kind: CapabilityKind, id: string, name: string, description: string | null): CapabilityEntry {
  const key = `${kind}:${id}`;
  const owner = CAPABILITY_KINDS[kind];
  const definition = kind === "operation" ? EXECUTABLE_CAPABILITY_DEFINITIONS.find(item => `${item.id}@${item.version}` === id) : undefined;
  const qualified = definition ? EXECUTABLE_CAPABILITY_QUALIFICATIONS.find(item =>
    item.qualification.capabilityId === definition.id && item.qualification.capabilityVersion === definition.version) : undefined;
  // focused_test/local is evidence of local tests only. Environment labels in
  // an owner witness cannot turn test source into Auth/native/provider proof.
  const localTests = definition && qualified && isCapabilityQualified(definition, qualified.qualification)
    ? qualified.qualification.evidence.filter(item => item.kind === "focused_test" && item.environment === "local")
    : [];
  const offering = kind === "offering" ? listOfferingDefinitions().find(item => `${item.id}@${item.version}` === id) : undefined;
  const prerequisites = definition ? [`native_adapter:${definition.adapterKey}`, ...(definition.support === "internal_only" ? ["internal_release"] : [])]
    : offering ? offering.requiredResources.map(resource => `resource:${resource.kind}`)
    : kind === "workspace_executable" ? ["owning_runtime"]
    : kind === "agent_capability" || kind === "dashboard_feature" ? ["tenant_availability"] : [];
  const releaseFlags: ReleaseFlag[] = offering?.id === "customer_inquiry_intake" ? ["inquiries"] : [];
  const evidence = Object.freeze([
    Object.freeze({ id: "declaration", capabilityKey: key, reference: owner.declaredIn, mode: "source" as const, checkedAt: null }),
    ...localTests.map(item => Object.freeze({ id: item.id, capabilityKey: key, reference: item.reference, mode: "local_test" as const, checkedAt: item.checkedAt })),
  ]);
  return Object.freeze({
    key, kind, id, name, description, declaredIn: owner.declaredIn,
    owner: Object.freeze({ reference: owner.declaredIn, model: owner.model }),
    contract: Object.freeze({ reference: owner.declaredIn, role: ROLES[kind] }),
    availability: Object.freeze({ workspaceRelease: owner.model === "workspace", releaseFlags: Object.freeze(releaseFlags), prerequisites: Object.freeze(prerequisites) }),
    qualification: Object.freeze({
      receiptReference: localTests.length ? "src/server/capabilities.ts#EXECUTABLE_CAPABILITY_QUALIFICATIONS" : null,
      evidence,
      provenModes: Object.freeze(localTests.length ? ["source" as const, "local_test" as const] : ["source" as const]),
    }),
  });
}

const ADAPTERS: Readonly<Record<CapabilityKind, () => CapabilityEntry[]>> = {
  operation: () => EXECUTABLE_CAPABILITY_DEFINITIONS.map((definition) =>
    entry("operation", `${definition.id}@${definition.version}`, definition.label, definition.description)),
  workspace_executable: () => listWorkspaceExecutableProducts().map((definition) =>
    entry("workspace_executable", definition.id, definition.name, definition.description)),
  product: () => PRODUCT_CATALOG.map((definition) => entry("product", definition.id, definition.name, definition.promise)),
  offering: () => listOfferingDefinitions().map((definition) =>
    entry("offering", `${definition.id}@${definition.version}`, definition.name, definition.description)),
  agent_capability: () => getAllCapabilities().map((capability) =>
    entry("agent_capability", capability.id, capability.name, capability.description)),
  dashboard_feature: () => FEATURE_REGISTRY.map((feature) => entry("dashboard_feature", feature.id, feature.label, null)),
};

/** Every declared capability, or those of the given kinds, in declaration order. */
export function listCapabilities(filter: { kind?: CapabilityKind | readonly CapabilityKind[] } = {}): readonly CapabilityEntry[] {
  const kinds = filter.kind === undefined
    ? (Object.keys(ADAPTERS) as CapabilityKind[])
    : typeof filter.kind === "string" ? [filter.kind] : [...filter.kind];
  return Object.freeze(kinds.flatMap((kind) => Object.hasOwn(ADAPTERS, kind) ? ADAPTERS[kind]() : []));
}

export function getCapability(key: string): CapabilityEntry | null {
  const kind = key.slice(0, key.indexOf(":")) as CapabilityKind;
  if (!Object.hasOwn(ADAPTERS, kind)) return null;
  return ADAPTERS[kind]().find((candidate) => candidate.key === key) ?? null;
}

// ── Reader views ──────────────────────────────────────────────────────────────
// Readers that list capabilities for a surface take them from here, so a
// change of declaration home touches one file. Each returns exactly what its
// declaration returns.

/** Products the workspace offers to discover (the descriptive catalog's release-1 slice). */
export function workspaceDiscoveryProducts(): readonly ProductDefinition[] {
  return listWorkspaceDiscoveryProducts();
}

/** Native work the workspace can run under its local release. */
export function workspaceExecutables(): readonly WorkspaceExecutableDefinition[] {
  return listWorkspaceExecutableProducts();
}


/** Machine-readable status view generated from current owner adapters. No release claim. */
export function capabilityStatusView() {
  return Object.freeze({ schemaVersion: 1 as const, entries: listCapabilities() });
}

/** Retained/generated artifacts must match the current owners, not just their labels. */
export function validateCapabilityStatusView(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  // Compare parsed JSON values so a saved artifact has no functions, schemas,
  // or executable handles. Extra fields and altered proof modes fail closed.
  try {
    const expected = capabilityStatusView();
    const candidate = value as { schemaVersion?: unknown; entries?: unknown };
    if (Object.keys(value).sort().join(",") !== "entries,schemaVersion" || candidate.schemaVersion !== 1 || !Array.isArray(candidate.entries)) return false;
    return candidate.entries.length === expected.entries.length && candidate.entries.every((item, index) => sameJson(item, expected.entries[index]));
  } catch { return false; }
}

function sameJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, i) => sameJson(item, right[i]));
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && sameJson(a[key], b[key]));
}
