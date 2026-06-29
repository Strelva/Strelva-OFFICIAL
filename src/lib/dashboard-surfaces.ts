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

/** The slice of tenant config the surface resolver actually reads. */
export type SurfaceTenantConfig = Pick<TenantConfig, "template" | "reviewsConfig"> & {
  businessModel?: PresenceProfile;
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
  | "store"
  | "google-business"
  | "analytics"
  | "reviews"
  | "health";

export interface DashboardSurface {
  id: SurfaceId;
  label: string;
  /** Route when shown, or where the connect CTA sends them when state is `connect`. */
  href: string;
  state: SurfaceState;
  /** Which nav group it sits in. `manage` = always-on core; `presence` = the conditional pillars. */
  group: "manage" | "presence";
}

/** Templates whose customers find them locally (maps + GBP matter). */
const LOCAL_TEMPLATES = new Set(["wellness", "restaurant", "trades", "professional"]);
/** Templates that are online-only brands (no physical/local discovery surface). */
const ONLINE_TEMPLATES = new Set(["food-brand", "fashion-stylist"]);

/**
 * Derive how the business is found. Prefers an explicit `businessModel` on the
 * tenant if one is ever set (forward-compatible — the field doesn't exist yet),
 * otherwise infers from the template. Unknown templates default to `local` —
 * the ICP is overwhelmingly local, and the cost of a wrong guess is a "connect
 * Google Business" nudge an online brand ignores, not a broken tab.
 */
export function getPresenceProfile(tenantConfig: Pick<TenantConfig, "template"> & { businessModel?: PresenceProfile }): PresenceProfile {
  if (tenantConfig.businessModel) return tenantConfig.businessModel;
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
 * Resolve the full ordered surface list for a tenant. Routes point at the
 * consolidated tabs (Website folds Site/Content/Assets, Analytics folds
 * Reports/Health) — Phase 2 builds those route contents out; Phase 1 ships the
 * structure + the conditional states.
 */
export function getDashboardSurfaces({
  tenantConfig,
  connections,
  hasCommerce: hasCommerceSignal,
}: {
  tenantConfig: SurfaceTenantConfig;
  connections: Connection[];
  /** Truth signal from the caller (e.g. the tenant has published products).
   *  ORed with the config features flag so Store shows for a real ecom tenant
   *  even when the features array isn't set on the record. */
  hasCommerce?: boolean;
}): DashboardSurface[] {
  const presence = getPresenceProfile(tenantConfig);
  const local = presence === "local" || presence === "hybrid";
  const gbpConnected = isConnected(connections, "google");
  const reviewsReady = hasReviewsSource(tenantConfig, connections);
  const hasCommerce =
    hasCommerceSignal === true ||
    (tenantConfig.features ?? []).some((f) => COMMERCE_FEATURES.has(f));

  return [
    { id: "today", label: "Dashboard", href: "/dashboard", state: "shown", group: "manage" },
    { id: "ask-ai", label: "Ask AI", href: "/dashboard/chat", state: "shown", group: "manage" },
    { id: "website", label: "Website", href: "/dashboard/site", state: "shown", group: "presence" },
    // Store — the primary surface for a commerce tenant (orders, revenue,
    // products). Hidden entirely for non-commerce sites.
    { id: "store", label: "Store", href: "/dashboard/store", state: hasCommerce ? "shown" : "hidden", group: "presence" },
    {
      id: "google-business",
      label: "Google Business",
      // Always the dedicated GBP surface — it renders a connect pitch when not
      // wired and the live listing state once connected.
      href: "/dashboard/google",
      state: !local ? "hidden" : gbpConnected ? "shown" : "connect",
      group: "presence",
    },
    { id: "analytics", label: "Analytics", href: "/dashboard/reports", state: "shown", group: "presence" },
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
    // Site health — the daily scan engine (speed, security, SEO, accessibility),
    // the same checks behind the public audit. Always relevant: every site is scanned.
    { id: "health", label: "Health", href: "/dashboard/health", state: "shown", group: "presence" },
  ];
}

/** Just the surfaces that should render (drops `hidden`). Convenience for the nav. */
export function getVisibleSurfaces(args: {
  tenantConfig: SurfaceTenantConfig;
  connections: Connection[];
  hasCommerce?: boolean;
}): DashboardSurface[] {
  return getDashboardSurfaces(args).filter((s) => s.state !== "hidden");
}
