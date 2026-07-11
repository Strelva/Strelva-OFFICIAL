/**
 * The conditional dashboard nav resolver. Turns "what kind of business is this
 * and what have they connected" into the ordered list of tabs the owner sees —
 * each in one of three states: shown, connect-to-unlock, or hidden.
 *
 * This is the spine of the IA cleanup (`dashboard-ia-scope-2026-06-28.md`): the
 * big-4 pillars of online presence (Website · Google Business · Analytics ·
 * Reviews) appear by business type + connections, so an online-only brand never
 * sees local-SEO framing it can't use, and a local business with no reviews source
 * yet sees "connect" instead of a dead tab. Computed server-side in the dashboard
 * layout and passed to the nav; no client fetch, no flash.
 */

import type { Connection, TenantConfig } from "./types";
import { getSetSurfaces } from "./features/registry";

/** The slice of tenant config the surface resolver actually reads. */
export type SurfaceTenantConfig = Pick<TenantConfig, "template" | "reviewsConfig"> & {
  /** Raw `settings.businessModel` — `""`/unrecognized means infer from template. */
  businessModel?: string;
  features?: string[];
};

/** Feature flags that mean this tenant runs a storefront. */
const COMMERCE_FEATURES = new Set(["commerce", "products", "shop"]);

/** How the business shows up to customers — drives which presence tabs apply. */
export type PresenceProfile = "local" | "online" | "hybrid";

/**
 * - `shown`: connected/applicable — render as a normal tab.
 * - `connect`: applicable to this business but nothing connected yet — render as
 *   a muted "connect to unlock" tab pointing at where they wire it up.
 * - `hidden`: not applicable to this business type — omit entirely.
 */
export type SurfaceState = "shown" | "connect" | "hidden";

export type SurfaceId =
  | "today"
  | "ask-ai"
  | "website"
  | "google-business"
  | "analytics"
  | "reports"
  | "reviews"
  // Vertical-set member surfaces (appended by the feature registry — see src/lib/features/registry.ts).
  | "schedule"
  | "members"
  | "packages"
  | "roster";

export interface DashboardSurface {
  id: SurfaceId;
  label: string;
  /** Route when shown, or where the connect CTA sends them when state is `connect`. */
  href: string;
  state: SurfaceState;
  /** Which nav group it sits in. `manage` = always-on core; `presence` = the conditional pillars; `set` = a vertical-set member. */
  group: "manage" | "presence" | "set";
  /** True only when this surface is shown because a super-admin is inspecting — the
   *  tenant hasn't enabled it. Lets the nav mark it as a preview. Never set for a
   *  real client (inspect requires isSuperAdmin, re-verified server-side). */
  preview?: boolean;
}

/** Templates whose customers find them locally (maps + GBP matter). */
const LOCAL_TEMPLATES = new Set(["wellness", "restaurant", "trades", "professional"]);
/** Templates that are online-only brands (no physical/local discovery surface). */
const ONLINE_TEMPLATES = new Set(["food-brand", "fashion-stylist"]);

/**
 * Derive how the business is found. The owner's own answer wins:
 * `settings.businessModel` (the first-run "Tell us how customers find you" /
 * Business info field, `""` = not answered — infer from template). Only falls
 * back to template inference when unset. Unknown templates default to `local` —
 * the ICP is overwhelmingly local, and the cost of a wrong guess is a "connect
 * Google Business" nudge an online brand ignores, not a broken tab.
 */
export function getPresenceProfile(tenantConfig: Pick<TenantConfig, "template"> & { businessModel?: string }): PresenceProfile {
  const model = tenantConfig.businessModel;
  if (model === "local" || model === "online" || model === "hybrid") return model;
  const template = tenantConfig.template;
  if (ONLINE_TEMPLATES.has(template)) return "online";
  if (LOCAL_TEMPLATES.has(template)) return "local";
  return "local";
}

function isConnected(connections: Connection[], provider: Connection["provider"]): boolean {
  return connections.some((c) => c.provider === provider && c.status === "connected");
}

/** Does the business have any review source we can read — a configured place id or a live connection. */
function hasReviewsSource(tenantConfig: SurfaceTenantConfig, connections: Connection[]): boolean {
  const cfg = tenantConfig.reviewsConfig;
  if (cfg?.googlePlaceId || cfg?.yelpBusinessId) return true;
  // A connected Google (GBP) or Yelp account brings reviews with it.
  return isConnected(connections, "google") || isConnected(connections, "yelp");
}

/**
 * Does this tenant run a storefront? ORs a caller truth-signal (e.g. it has
 * published products) with the config features flag, so Store shows for a real
 * ecom tenant even when the features array isn't set on the record. Store is no
 * longer a top-level tab — it's a sub-section inside Website (`getWebsiteSections`).
 */
export function tenantHasStore({
  tenantConfig,
  hasCommerce,
}: {
  tenantConfig: Pick<SurfaceTenantConfig, "features">;
  hasCommerce?: boolean;
}): boolean {
  return (
    hasCommerce === true ||
    (tenantConfig.features ?? []).some((f) => COMMERCE_FEATURES.has(f))
  );
}

/** One sub-tab inside the Website surface. */
export interface WebsiteSection {
  id: "site" | "store";
  label: string;
  href: string;
}

/**
 * The sub-tabs shown INSIDE Website. Site is the spine; Store folds in as a
 * sub-section only when the site has a store (Blog / Photos slot in here later,
 * so the shape is a list, not a boolean). Fewer than two → the caller hides the
 * strip entirely (nothing to switch between), so a plain site is unchanged.
 */
export function getWebsiteSections({ hasStore }: { hasStore: boolean }): WebsiteSection[] {
  const sections: WebsiteSection[] = [
    { id: "site", label: "Site", href: "/dashboard/site" },
  ];
  if (hasStore) sections.push({ id: "store", label: "Store", href: "/dashboard/store" });
  return sections;
}

/**
 * Resolve the full ordered surface list for a tenant. Routes point at the
 * consolidated tabs (Website folds Site/Content/Assets/Store, Analytics folds
 * Reports/Health). The seventh nav item — Settings — is the always-present gear
 * in the identity footer, not part of this presence list.
 */
export function getDashboardSurfaces({
  tenantConfig,
  connections,
  inspect = false,
}: {
  tenantConfig: SurfaceTenantConfig;
  connections: Connection[];
  /** Super-admin inspect mode — surface every vertical-set tab (enabled or not),
   *  the extras marked `preview`. The six core/presence surfaces are unchanged. */
  inspect?: boolean;
}): DashboardSurface[] {
  const presence = getPresenceProfile(tenantConfig);
  const local = presence === "local" || presence === "hybrid";
  const gbpConnected = isConnected(connections, "google");
  const reviewsReady = hasReviewsSource(tenantConfig, connections);

  const surfaces: DashboardSurface[] = [
    { id: "today", label: "Today", href: "/dashboard", state: "shown", group: "manage" },
    { id: "ask-ai", label: "Ask Strelva", href: "/dashboard/chat", state: "shown", group: "manage" },
    // Website is the spine — Site editor + Store/Blog/Photos as sub-tabs inside it.
    { id: "website", label: "Website", href: "/dashboard/site", state: "shown", group: "presence" },
    {
      id: "google-business",
      label: "Google Business",
      // Always the dedicated GBP surface — it renders a connect pitch when not
      // wired and the live listing state once connected.
      href: "/dashboard/google",
      state: !local ? "hidden" : gbpConnected ? "shown" : "connect",
      group: "presence",
    },
    // Analytics — the LIVE / rolling surface (range selector + live numbers + the
    // anomaly + site health). The written recaps are the separate Reports tab.
    { id: "analytics", label: "Analytics", href: "/dashboard/analytics", state: "shown", group: "presence" },
    // Reports — the written weekly + monthly recaps (verdict + narrative + proof).
    { id: "reports", label: "Reports", href: "/dashboard/reports", state: "shown", group: "presence" },
    {
      id: "reviews",
      label: "Reviews",
      // Always the Reviews surface — its empty state pitches connecting Google,
      // so a "connect" tab lands on reviews (not the generic integrations list).
      href: "/dashboard/reviews",
      // A review source → shown; local without one → connect; online without one → hidden.
      state: reviewsReady ? "shown" : local ? "connect" : "hidden",
      group: "presence",
    },
  ];

  // Append the vertical-set member surfaces this tenant has enabled (e.g. Wellness →
  // Schedule/Members/Packages/Roster). Additive: the six surfaces above are unchanged,
  // so a tenant with no set features resolves exactly as before. See features/registry.ts.
  surfaces.push(...getSetSurfaces(tenantConfig.features ?? [], inspect));

  return surfaces;
}

/** Just the surfaces that should render (drops `hidden`). Convenience for the nav. */
export function getVisibleSurfaces(args: {
  tenantConfig: SurfaceTenantConfig;
  connections: Connection[];
  inspect?: boolean;
}): DashboardSurface[] {
  return getDashboardSurfaces(args).filter((s) => s.state !== "hidden");
}
