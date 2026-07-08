/**
 * The feature registry — the single source of truth for what a tenant's dashboard
 * can contain, and how each feature is gated.
 *
 * A "feature" is the unit of the product. Three tiers:
 *  - `core`      — locked, on for everyone, never removable (Website, Analytics, …).
 *  - `conditional` — switched on by what the business IS (a physical location → Google
 *                    Business) or by a connection.
 *  - `set`       — a vertical "snapshot": a named bundle of features flipped on together
 *                  for a business type (Wellness = Schedule/Members/Packages/Roster).
 *
 * This registry backs three things so they can't drift apart: the write-path validation
 * + core-lock guard (`src/app/api/admin/tenants/route.ts`), the nav resolver's set-surface
 * append (`src/lib/dashboard-surfaces.ts`), and the operator toggle UI (`TenantEditor.tsx`).
 *
 * NOTE: this is a dashboard-surface concern, NOT billing. Stripe tiers are packaging
 * (see AGENTS.md "The Model"); enabling a feature here does not change what a client pays.
 */

import { ALL_TENANT_FEATURES } from "../types";
import type { IntegrationProvider } from "../types";
// Type-only imports (erased at runtime) so the registry ↔ dashboard-surfaces edge is not a
// runtime cycle: dashboard-surfaces imports getSetSurfaces() as a value; we import its types.
import type { DashboardSurface, SurfaceId } from "../dashboard-surfaces";

export type FeatureTier = "core" | "conditional" | "set";

export interface FeatureDef {
  /** Feature id. Stored in `tenants.features[]`; for surface-bearing features it matches a SurfaceId. */
  id: string;
  label: string;
  tier: FeatureTier;
  /** Core features are locked — always on, never removable. */
  locked?: boolean;
  /** For `set` members: which set they belong to (also the SETS key). */
  set?: string;
  /** Display label of the owning set (for grouping in the UI + nav). */
  setLabel?: string;
  /** Prerequisites to enable / show this feature. */
  requires?: { presence?: "local"; connection?: IntegrationProvider };
  /** The dashboard tab this feature adds, if any. (Core/conditional surfaces are still owned by the resolver.) */
  surface?: { id: SurfaceId; label: string; href: string };
}

/** Locked, on-for-everyone. These can never be removed from a tenant (enforced server-side). */
export const CORE_FEATURES = ["today", "ask-ai", "website", "analytics"] as const;
export type CoreFeatureId = (typeof CORE_FEATURES)[number];

/** Vertical sets: a set id → its member feature ids. Toggling a set flips all members together. */
export const SETS: Record<string, { label: string; members: string[] }> = {
  wellness: { label: "Wellness", members: ["schedule", "members", "packages", "roster"] },
  // E-commerce reuses the existing storefront mechanism: `commerce` drives the Website ▸ Store
  // sub-tab via tenantHasStore(), so this set adds no new top-level surface.
  ecommerce: { label: "E-commerce", members: ["commerce"] },
};

export const FEATURE_REGISTRY: FeatureDef[] = [
  // ── Core (locked) ──────────────────────────────────────────────────────────
  { id: "today", label: "Today", tier: "core", locked: true },
  { id: "ask-ai", label: "Ask Strelva", tier: "core", locked: true },
  { id: "website", label: "Website", tier: "core", locked: true },
  { id: "analytics", label: "Analytics", tier: "core", locked: true },

  // ── Conditional (by what the business is / has) ────────────────────────────
  { id: "google-business", label: "Google Business", tier: "conditional", requires: { presence: "local", connection: "google" } },
  { id: "reviews", label: "Reviews", tier: "conditional" },

  // ── Wellness set (surface-bearing members) ─────────────────────────────────
  { id: "schedule", label: "Schedule", tier: "set", set: "wellness", setLabel: "Wellness", surface: { id: "schedule", label: "Schedule", href: "/dashboard/schedule" } },
  { id: "members",  label: "Members",  tier: "set", set: "wellness", setLabel: "Wellness", surface: { id: "members",  label: "Members",  href: "/dashboard/members" } },
  { id: "packages", label: "Packages", tier: "set", set: "wellness", setLabel: "Wellness", surface: { id: "packages", label: "Packages", href: "/dashboard/packages" } },
  { id: "roster",   label: "Roster",   tier: "set", set: "wellness", setLabel: "Wellness", surface: { id: "roster",   label: "Roster",   href: "/dashboard/roster" } },

  // ── E-commerce set (reuses the existing Store sub-tab; no new surface) ──────
  { id: "commerce", label: "Store", tier: "set", set: "ecommerce", setLabel: "E-commerce" },
];

const REGISTRY_BY_ID = new Map(FEATURE_REGISTRY.map((f) => [f.id, f]));

/**
 * Every feature id we recognize on write: the registry ids (core/conditional/set),
 * the set ids (a set id expands to its members), and every `TenantFeature` value
 * (derived from ALL_TENANT_FEATURES, so it can't drift from the union) — so an
 * existing tenant's array is never silently dropped on save.
 */
const VALID_FEATURE_IDS = new Set<string>([
  ...FEATURE_REGISTRY.map((f) => f.id),
  ...Object.keys(SETS),
  ...ALL_TENANT_FEATURES,
]);

export function isCore(id: string): boolean {
  return (CORE_FEATURES as readonly string[]).includes(id);
}

export function isKnownFeature(id: string): boolean {
  return VALID_FEATURE_IDS.has(id);
}

/** Filter an arbitrary array down to recognized feature ids (write-path hygiene). */
export function cleanFeatureIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && VALID_FEATURE_IDS.has(v));
}

/** Expand any set ids into their member feature ids; leave plain feature ids as-is; dedupe. */
export function expandSets(ids: string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    if (SETS[id]) out.push(...SETS[id].members);
    else out.push(id);
  }
  return Array.from(new Set(out));
}

/** Thrown by applyFeatureChange when a write would remove a locked core feature. */
export class FeatureGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeatureGuardError";
  }
}

/**
 * Compute the features[] to persist for a write. Cleans unknown ids, expands any set
 * id into its members, dedupes — and refuses to drop a core feature that was present
 * (core is otherwise always-on in the resolver; this is the enforced contract +
 * defense-in-depth behind the locked toggles). Throws FeatureGuardError on a rejected
 * core removal.
 */
export function applyFeatureChange(current: string[], next: string[]): string[] {
  const cleaned = expandSets(cleanFeatureIds(next));
  for (const core of CORE_FEATURES) {
    if (current.includes(core) && !cleaned.includes(core)) {
      throw new FeatureGuardError(`"${core}" is a core feature and cannot be removed`);
    }
  }
  return cleaned;
}

/** The dashboard surfaces contributed by a tenant's enabled set-member features, in registry order. */
export function getSetSurfaces(features: string[]): DashboardSurface[] {
  const enabled = new Set(features);
  const surfaces: DashboardSurface[] = [];
  for (const f of FEATURE_REGISTRY) {
    if (f.surface && enabled.has(f.id)) {
      surfaces.push({ id: f.surface.id, label: f.surface.label, href: f.surface.href, state: "shown", group: "set" });
    }
  }
  return surfaces;
}

/** Non-locked features, grouped for the operator toggle UI. */
export function getToggleableRegistry(): {
  core: FeatureDef[];
  conditional: FeatureDef[];
  sets: { id: string; label: string; members: FeatureDef[] }[];
} {
  const core = FEATURE_REGISTRY.filter((f) => f.tier === "core");
  const conditional = FEATURE_REGISTRY.filter((f) => f.tier === "conditional");
  const sets = Object.entries(SETS).map(([id, def]) => ({
    id,
    label: def.label,
    members: def.members.map((m) => REGISTRY_BY_ID.get(m)).filter((f): f is FeatureDef => Boolean(f)),
  }));
  return { core, conditional, sets };
}
