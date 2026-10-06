import { systemOriginId } from "@/platform/systems/invariants";
import type { ReleaseFlag } from "@/platform/release-flags/resolve";
import { workspaceSiteHref, type SiteTab } from "@/lib/workspace-site-places";

/**
 * Where each `/dashboard` page lands in the workspace (owner-entry spec §5).
 *
 * States:
 * - `ready`: its workspace home reads the tenant's data. Redirects (307) when
 *   owner entry is on for the person and they are a workspace member.
 * - `stay`: renders `/dashboard` as today, with a "Back to <business>" link.
 * - `retire`: already a redirect stub today; follows the page it retires to.
 * - `frozen`: kept on `/dashboard` by a written decision (systems catalog §3.2,
 *   §3.3). Renders with the back link, like `stay`, and never blocks owner
 *   entry from being turned `on`.
 *
 * Every `src/app/dashboard/**\/page.tsx` has an entry; a test fails otherwise.
 * Every target passes `workspaceReturnTarget`, so it survives sign-in.
 */

export type DispositionState = "ready" | "stay" | "retire" | "frozen";

/** Which tenants use a page, for the rule that `on` needs every used page settled. */
export type DashboardPageUse = "always" | "local" | "store" | "wellness";

export interface DispositionContext {
  workspaceId: string;
  /** tenants.stable_id: the website System's identity origin. */
  tenantStableId: string | null;
  /** The request's query, for meaning-carrying params like `?checkout=success`. */
  search: URLSearchParams;
  /** The concrete path under /dashboard (`/dashboard/sources/google`), for ids in the path. */
  path?: string;
}

export interface DashboardDisposition {
  /** Path under /dashboard, in route form: "/", "/reports", "/sources/[id]", "/[...notFound]". */
  route: string;
  /** Where it lands, in plain words. */
  home: string;
  state: DispositionState;
  use: DashboardPageUse;
  /** For `retire`: the route this page already redirects to. */
  retiresTo?: string;
  /** Ready only where these flags are on for the workspace. */
  requires?: readonly ReleaseFlag[];
  /** Ready only while this env-only release is on (Ask Strelva has no per-workspace flag). */
  requiresEnv?: "ask";
  /** Why a page stays or is frozen, and what would make it ready. */
  note?: string;
  target(context: DispositionContext): string;
}

export function workspaceHome(workspaceId: string, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams({ ...extra, workspaceId });
  return `/workspace?${params}`;
}

/** The website System's page when the tenant's identity is known, else Home. */
export function websiteSystemHome({ workspaceId, tenantStableId }: DispositionContext): string {
  if (!tenantStableId) return workspaceHome(workspaceId);
  return workspaceHome(workspaceId, { view: "system", system: systemOriginId(workspaceId, { kind: "tenant", ref: tenantStableId }) });
}

const home = ({ workspaceId }: DispositionContext) => workspaceHome(workspaceId);

/**
 * A managed website's own page in the workspace (`/workspace/site`), by tab.
 * Without the tenant's identity there is no website System to open: Home.
 */
export function websiteSitePlace(tab: SiteTab, extra: (context: DispositionContext) => { source?: string; request?: string } = () => ({})) {
  return (context: DispositionContext): string => {
    if (!context.tenantStableId) return workspaceHome(context.workspaceId);
    const systemId = systemOriginId(context.workspaceId, { kind: "tenant", ref: context.tenantStableId });
    return workspaceSiteHref({ workspaceId: context.workspaceId, systemId, tab, ...extra(context) });
  };
}

const SOURCE_ID = /^[a-z0-9_-]{1,64}$/i;
const REQUEST_ID = /^[A-Za-z0-9_.:-]{1,200}$/;

/** `/dashboard/settings#<anchor>` places, for when Settings is ready. The
 * server never sees a fragment; the browser carries it onto the redirect. */
export const SETTINGS_ANCHORS: Record<string, (context: DispositionContext) => string> = {
  business: (c) => workspaceHome(c.workspaceId, { view: "settings" }),
  branding: websiteSystemHome,
  "site-config": websiteSystemHome,
  dependencies: websiteSystemHome,
  shortcuts: (c) => workspaceHome(c.workspaceId, { view: "settings" }),
  ownership: (c) => workspaceHome(c.workspaceId, { view: "settings" }),
  account: () => "/workspace/account?continue=public",
  domains: websiteSystemHome,
  plan: (c) => workspaceHome(c.workspaceId, { view: "settings" }),
};

export const DASHBOARD_DISPOSITIONS: readonly DashboardDisposition[] = [
  { route: "/", home: "Home: Needs you, Strelva handled, In progress, Recent", state: "stay", use: "always",
    note: "Home doesn't read the linked tenant's approvals, leads or activity yet (needs-you spec).",
    // Stripe returns to /dashboard?checkout=success; that belongs to billing.
    target: (c) => c.search.has("checkout") ? workspaceHome(c.workspaceId, { view: "settings" }) : workspaceHome(c.workspaceId) },
  { route: "/chat", home: "Ask Strelva (view=ask), on Home and on each System", state: "ready", use: "always", requiresEnv: "ask",
    note: "Ready only while STRELVA_ASK_RELEASE is on; off, the old chat stays. Conversations start fresh in the workspace: tenant chat threads are not copied.",
    target: (c) => workspaceHome(c.workspaceId, { view: "ask" }) },
  { route: "/site", home: "Website System: the site's editor, or Ask for a change on a repo-only site", state: "ready", use: "always", requires: ["systems"],
    target: websiteSitePlace("edit") },
  { route: "/content", home: "Website System", state: "retire", retiresTo: "/site", use: "always", target: websiteSystemHome },
  { route: "/assets", home: "Website System, photos", state: "ready", use: "always", requires: ["systems"], target: websiteSitePlace("photos") },
  { route: "/brand-kit", home: "Website System, look", state: "ready", use: "always", requires: ["systems"], target: websiteSitePlace("look") },
  { route: "/collections", home: "Website System, blog and collections (they appear through /api/v1/collections)", state: "ready", use: "always", requires: ["systems"],
    target: websiteSitePlace("collections") },
  { route: "/google", home: "Website System Connections: Google Business", state: "ready", use: "local", requires: ["systems"], target: websiteSitePlace("google") },
  { route: "/health", home: "Website System health", state: "retire", retiresTo: "/analytics", use: "always", target: websiteSystemHome },
  { route: "/history", home: "Website System, History", state: "ready", use: "always", requires: ["systems"],
    target: websiteSitePlace("history", (c) => { const request = c.search.get("request"); return request && REQUEST_ID.test(request) ? { request } : {}; }) },
  { route: "/integrations", home: "Website System Connections", state: "ready", use: "always", requires: ["systems"], target: websiteSitePlace("connections") },
  { route: "/sources", home: "Connections on each System", state: "retire", retiresTo: "/integrations", use: "always", target: websiteSystemHome },
  { route: "/sources/[id]", home: "That Connection on the Website System", state: "ready", use: "always", requires: ["systems"],
    target: (c) => {
      const raw = c.path?.match(/^\/dashboard\/sources\/([^/]+)\/?$/)?.[1];
      let source: string | null = null;
      try { source = raw ? decodeURIComponent(raw) : null; } catch { source = null; }
      return source && SOURCE_ID.test(source) ? websiteSitePlace("source", () => ({ source }))(c) : websiteSitePlace("connections")(c);
    } },
  { route: "/leads", home: "Inquiries System", state: "stay", use: "always", requires: ["inquiries"],
    note: "Inquiries in the workspace are partial and leads are still Redis-authoritative.", target: (c) => workspaceHome(c.workspaceId, { view: "inquiries" }) },
  { route: "/members", home: "Stays on /dashboard (rewards frozen)", state: "frozen", use: "wellness",
    note: "Frozen with rewards at 1.0.0 (systems catalog §3.2, §3.3). Nothing new reads the rewards store.", target: home },
  { route: "/roster", home: "Bookings System, day roster", state: "stay", use: "wellness",
    note: "Part of Bookings; waits on the one booking store.", target: (c) => workspaceHome(c.workspaceId, { view: "scheduling" }) },
  { route: "/schedule", home: "Bookings System", state: "stay", use: "wellness",
    note: "Part of Bookings; waits on the one booking store.", target: (c) => workspaceHome(c.workspaceId, { view: "scheduling" }) },
  { route: "/ownership", home: "Business details, ownership", state: "retire", retiresTo: "/settings", use: "always",
    target: (c) => workspaceHome(c.workspaceId, { view: "settings" }) },
  { route: "/reports", home: "Recaps, under Home's Recent (/workspace/recaps)", state: "ready", use: "always",
    // `?view=monthly` on the old page keeps its meaning.
    target: (c) => `/workspace/recaps?${new URLSearchParams({ workspaceId: c.workspaceId, ...(c.search.get("view") === "monthly" ? { period: "month" } : c.search.get("view") === "weekly" ? { period: "week" } : {}) })}` },
  { route: "/analytics", home: "Website System, results and health", state: "stay", use: "always",
    note: "No results panel on the Website System yet.", target: websiteSystemHome },
  { route: "/review", home: "Needs you", state: "stay", use: "always",
    note: "Needs you has no real policy source yet (needs-you spec).", target: home },
  { route: "/reviews", home: "Publishing System, reviews", state: "stay", use: "local",
    note: "Publishing doesn't exist in the workspace yet.", target: home },
  { route: "/settings", home: "Split: Business details, Website System, account, billing", state: "stay", use: "always",
    note: "Business details doesn't edit the business record yet and billing has no workspace.",
    target: (c) => workspaceHome(c.workspaceId, { view: "settings" }) },
  { route: "/store", home: "Stays on /dashboard; the website shows a Store Connection", state: "frozen", use: "store",
    note: "Store is a Connection to the client's own checkout; Strelva's order view is frozen at 1.0.0 (systems catalog §3.2, decision 9.4).", target: websiteSystemHome },
  { route: "/[...notFound]", home: "Home", state: "ready", use: "always", target: home },
];

const BY_ROUTE = new Map(DASHBOARD_DISPOSITIONS.map((entry) => [entry.route, entry]));

export function dispositionForRoute(route: string): DashboardDisposition | undefined {
  return BY_ROUTE.get(route);
}

/** Maps a concrete path under /dashboard ("/sources/abc") onto its route. */
export function routeForDashboardPath(pathname: string): string {
  const path = pathname.replace(/^\/dashboard(?=\/|$)/, "").replace(/\/+$/, "") || "/";
  if (BY_ROUTE.has(path)) return path;
  if (/^\/sources\/[^/]+$/.test(path)) return "/sources/[id]";
  return "/[...notFound]";
}

/** A retire page takes the state of the page it retires to. */
export function effectiveDisposition(route: string): DashboardDisposition {
  let entry = BY_ROUTE.get(route) ?? BY_ROUTE.get("/[...notFound]")!;
  const seen = new Set<string>();
  while (entry.state === "retire" && entry.retiresTo && !seen.has(entry.route)) {
    seen.add(entry.route);
    const next = BY_ROUTE.get(entry.retiresTo);
    if (!next) break;
    entry = next;
  }
  return entry;
}

/** Owner entry may go `on` only when no page this tenant uses is still `stay`. */
export function pagesBlockingOwnerEntry(uses: ReadonlySet<DashboardPageUse>): DashboardDisposition[] {
  return DASHBOARD_DISPOSITIONS.filter((entry) => uses.has(entry.use) && effectiveDisposition(entry.route).state === "stay");
}
