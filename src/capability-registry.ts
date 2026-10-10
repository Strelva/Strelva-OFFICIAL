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
 *
 * Listing a capability grants nothing. Access, release state and execution
 * stay with the owning module (the operations registry still enforces exact
 * versions and entrances). src/lib/site-capabilities.ts is separate: it is
 * per-tenant v1 state served to client repos, not a declaration.
 */
import { EXECUTABLE_CAPABILITY_DEFINITIONS } from "@/server/capabilities";
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
}

function entry(kind: CapabilityKind, id: string, name: string, description: string | null): CapabilityEntry {
  return Object.freeze({ key: `${kind}:${id}`, kind, id, name, description, declaredIn: CAPABILITY_KINDS[kind].declaredIn });
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
  return kinds.flatMap((kind) => ADAPTERS[kind]());
}

export function getCapability(key: string): CapabilityEntry | null {
  const kind = key.slice(0, key.indexOf(":")) as CapabilityKind;
  if (!(kind in ADAPTERS)) return null;
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
