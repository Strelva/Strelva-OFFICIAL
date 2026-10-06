import { systemOriginId } from "@/platform/systems/invariants";
import type { ReleaseFlag } from "@/platform/release-flags/resolve";

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
  { route: "/chat", home: "Ask Strelva on Home and on each System", state: "stay", use: "always",
    note: "Ask Strelva doesn't run in the workspace yet (ask-strelva spec).", target: home },
  { route: "/site", home: "Website System", state: "stay", use: "always",
    note: "The System page shows the site but editing still opens /dashboard/site, so redirecting would loop.", target: websiteSystemHome },
  { route: "/content", home: "Website System", state: "retire", retiresTo: "/site", use: "always", target: websiteSystemHome },
  { route: "/assets", home: "Website System, photos and files", state: "stay", use: "always",
    note: "No photo library on the Website System yet.", target: websiteSystemHome },
  { route: "/brand-kit", home: "Website System, look", state: "stay", use: "always",
    note: "No brand panel on the Website System yet.", target: websiteSystemHome },
  { route: "/collections", home: "Publishing System (blog)", state: "stay", use: "always",
    note: "Publishing doesn't exist in the workspace yet.", target: home },
  { route: "/google", home: "Publishing System, acts on Google Business", state: "stay", use: "local",
    note: "Google tokens are tenant-side and Publishing doesn't exist in the workspace yet.", target: home },
  { route: "/health", home: "Website System health", state: "retire", retiresTo: "/analytics", use: "always", target: websiteSystemHome },
  { route: "/history", home: "Website System, History", state: "stay", use: "always",
    note: "History doesn't read tenant content versions or site snapshots yet.", target: websiteSystemHome },
  { route: "/integrations", home: "Connections on each System", state: "stay", use: "always",
    note: "System Connections don't read the tenant's connections yet.", target: websiteSystemHome },
  { route: "/sources", home: "Connections on each System", state: "retire", retiresTo: "/integrations", use: "always", target: websiteSystemHome },
  { route: "/sources/[id]", home: "That Connection on its System", state: "stay", use: "always",
    note: "No Connection detail view yet.", target: websiteSystemHome },
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
  { route: "/reports", home: "Home, Recent: weekly and monthly recaps", state: "stay", use: "always",
    note: "No recap view in the workspace yet.", target: home },
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
