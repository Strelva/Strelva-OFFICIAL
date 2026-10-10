import { STRELVA_HANDLED_LABEL } from "@/platform/presentation/place-labels";
import { systemOriginId } from "@/platform/systems/invariants";
import type { ReleaseFlag } from "@/platform/release-flags/resolve";
import { workspaceSiteHref, type SiteTab } from "@/platform/workspaces/site-places";

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

/**
 * What a ready page needs on before it redirects: a per-workspace release
 * flag (`systems` for the website pages, `inquiries`, ...), `needs_you`
 * (STRELVA_NEEDS_YOU_RELEASE), without which Home has no Needs you and the
 * approval queue would have nowhere to land, or `ask` (Ask Strelva's
 * release; see askReleaseEnabled), without which /chat keeps the old chat.
 */
export type DispositionGate = ReleaseFlag | "needs_you" | "ask";

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
  /** Ready only where these are on for the workspace. */
  requires?: readonly DispositionGate[];
  /** For a ready page: what the workspace home doesn't do yet that the old page did. */
  parityGaps?: readonly string[];
  /** Why a page stays or is frozen, and what would make it ready. */
  note?: string;
  /** Explicitly retained legacy home, permitted at launch (Settings only). */
  retainedAtLaunch?: boolean;
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

/** A workspace place that reads the linked sites (src/platform/owner-entry/linked-sites.ts). */
export function workspacePlace(place: "inquiries" | "reviews" | "results" | "business-details", workspaceId: string, extra: Record<string, string> = {}): string {
  return `/workspace/${place}?${new URLSearchParams({ workspaceId, ...extra })}`;
}

/** `/dashboard/analytics?range=…` keeps its window when the window is valid. */
function resultsTarget({ workspaceId, search }: DispositionContext): string {
  const range = search.get("range");
  const date = /^\d{4}-\d{2}-\d{2}$/;
  if (range === "week" || range === "month") return workspacePlace("results", workspaceId, { range });
  if (range === "custom" && date.test(search.get("from") ?? "") && date.test(search.get("to") ?? "")) {
    return workspacePlace("results", workspaceId, { range, from: search.get("from")!, to: search.get("to")! });
  }
  return workspacePlace("results", workspaceId);
}

/** Where each `/dashboard/settings#<anchor>` meaning lives. The server never
 * sees a fragment: the redirect lands on Business details with the fragment
 * kept, and Business details has a section with that id linking here. */
export const SETTINGS_ANCHORS: Record<string, (context: DispositionContext) => string> = {
  business: (c) => workspacePlace("business-details", c.workspaceId),
  notifications: (c) => workspacePlace("business-details", c.workspaceId),
  branding: websiteSystemHome,
  "site-config": websiteSystemHome,
  dependencies: websiteSystemHome,
  shortcuts: (c) => workspacePlace("business-details", c.workspaceId),
  ownership: (c) => workspaceHome(c.workspaceId, { view: "settings" }),
  account: () => "/workspace/account?continue=public",
  domains: websiteSystemHome,
  plan: (c) => workspaceHome(c.workspaceId, { view: "settings" }),
};

export const DASHBOARD_DISPOSITIONS: readonly DashboardDisposition[] = [
  { route: "/", home: `Home: Needs you, From your site, ${STRELVA_HANDLED_LABEL}, In progress, Recent`, state: "ready", use: "always", requires: ["needs_you"],
    parityGaps: [
      "No onboarding checklist or wizard, day-one cards, retention panel or \"Do this next\" suggestion.",
      "No sparklines on the numbers; visits and customer actions are totals with this week's count.",
      "No Edit site or View live site buttons on Home (the Website System has the live link).",
    ],
    // Stripe returns to /dashboard?checkout=success; that belongs to billing.
    target: (c) => c.search.has("checkout") ? workspaceHome(c.workspaceId, { view: "settings" }) : workspaceHome(c.workspaceId) },
  { route: "/chat", home: "Ask Strelva (view=ask), on Home and on each System", state: "ready", use: "always", requires: ["ask"],
    note: "Ready only while STRELVA_ASK_RELEASE is on; off, the old chat stays. Conversations start fresh in the workspace: tenant chat threads are not copied.",
    target: (c) => workspaceHome(c.workspaceId, { view: "ask" }) },
  { route: "/site", home: "Website System: the site's editor, or Ask for a change on a repo-only site", state: "ready", use: "always", requires: ["systems"],
    target: websiteSitePlace("edit") },
  { route: "/content", home: "Website System", state: "ready", use: "always", requires: ["systems"], target: websiteSitePlace("edit") },
  { route: "/assets", home: "Website System, photos", state: "ready", use: "always", requires: ["systems"], target: websiteSitePlace("photos") },
  { route: "/brand-kit", home: "Website System, look", state: "ready", use: "always", requires: ["systems"], target: websiteSitePlace("look") },
  { route: "/collections", home: "Website System, blog and collections (they appear through /api/v1/collections)", state: "ready", use: "always", requires: ["systems"],
    target: websiteSitePlace("collections") },
  { route: "/google", home: "Website System Connections: Google Business", state: "ready", use: "local", requires: ["systems"], target: websiteSitePlace("google") },
  { route: "/history", home: "Website System, History", state: "ready", use: "always", requires: ["systems"],
    target: websiteSitePlace("history", (c) => { const request = c.search.get("request"); return request && REQUEST_ID.test(request) ? { request } : {}; }) },
  { route: "/integrations", home: "Website System Connections", state: "ready", use: "always", requires: ["systems"], target: websiteSitePlace("connections") },
  { route: "/sources", home: "Connections on each System", state: "ready", use: "always", requires: ["systems"], target: websiteSitePlace("connections") },
  { route: "/sources/[id]", home: "That Connection on the Website System", state: "ready", use: "always", requires: ["systems"],
    target: (c) => {
      const raw = c.path?.match(/^\/dashboard\/sources\/([^/]+)\/?$/)?.[1];
      let source: string | null = null;
      try { source = raw ? decodeURIComponent(raw) : null; } catch { source = null; }
      return source && SOURCE_ID.test(source) ? websiteSitePlace("source", () => ({ source }))(c) : websiteSitePlace("connections")(c);
    } },
  { route: "/health", home: "Website results and health", state: "ready", use: "always", target: (c) => `${resultsTarget(c)}#site-health` },
  { route: "/leads", home: "Inquiries (/workspace/inquiries), every linked site's leads", state: "ready", use: "always",
    parityGaps: [
      "Reads leads from Redis like /dashboard/leads; the tenant_leads mirror isn't read, so a Redis outage shows \"couldn't be read\", not the mirror.",
      "Not the Inquiries System page of the inquiries spec (assignee, status, follow-ups); that stays behind STRELVA_INQUIRIES_RELEASE.",
    ],
    target: (c) => workspacePlace("inquiries", c.workspaceId) },
  { route: "/members", home: "Website Connection: existing members, read-only", state: "ready", use: "wellness", requires: ["systems"],
    note: "Existing read-only member visibility only. Rewards remain frozen; no new membership or points actions.", target: websiteSitePlace("members") },
  // The bookings System's day and week views read the tenant's bookings through
  // getBookings, so they follow the one booking store when its reads flip.
  { route: "/roster", home: "Bookings System, day view (/workspace/bookings?view=day)", state: "ready", use: "wellness", requires: ["systems"],
    target: (c) => `/workspace/bookings?${new URLSearchParams({ workspaceId: c.workspaceId, view: "day" })}` },
  { route: "/schedule", home: "Bookings System, week view (/workspace/bookings?view=week)", state: "ready", use: "wellness", requires: ["systems"],
    note: "Hours and services are edited on the business record; booking settings by Strelva.",
    target: (c) => `/workspace/bookings?${new URLSearchParams({ workspaceId: c.workspaceId, view: "week" })}` },
  { route: "/ownership", home: "Business details, ownership", state: "ready", use: "always",
    target: (c) => `${workspacePlace("business-details", c.workspaceId)}#ownership` },
  { route: "/reports", home: "Recaps, under Home's Recent (/workspace/recaps)", state: "ready", use: "always",
    // `?view=monthly` on the old page keeps its meaning.
    target: (c) => `/workspace/recaps?${new URLSearchParams({ workspaceId: c.workspaceId, ...(c.search.get("view") === "monthly" ? { period: "month" } : c.search.get("view") === "weekly" ? { period: "week" } : {}) })}` },
  { route: "/analytics", home: "Website results and health (/workspace/results)", state: "ready", use: "always",
    parityGaps: [
      "Site health is the latest scan summary, not the interactive site-audit card with history and re-run.",
      "No custom date picker (a custom window from an old link still works); no \"Ask Strelva\" hand-offs from the anomaly or AI answers.",
      "Not yet a panel on the Website System page itself; it is its own page linked from Home.",
    ],
    target: resultsTarget },
  { route: "/review", home: "Needs you, on Home", state: "ready", use: "always", requires: ["needs_you"],
    parityGaps: [
      "Needs you lists the tenant's pending events through the tenant-event adapter; editing a draft before approving and the operator-only queue controls stay on /dashboard/review (operators: ?legacy=1).",
      "No resolved history or stale-section count.",
    ],
    target: home },
  { route: "/reviews", home: "Google listing: Reviews (/workspace/reviews)", state: "ready", use: "local",
    parityGaps: [
      "No reply-voice settings (mode, guidance, templates) and no AI \"draft a reply\" button; Strelva's waiting draft prefills the reply.",
      "No copy-to-clipboard buttons on the review request link.",
      "Reads the tenant review store, not the Publishing listing receipts (src/products/google-listing), which stay behind STRELVA_PUBLISHING_RELEASE.",
    ],
    target: (c) => workspacePlace("reviews", c.workspaceId) },
  { route: "/settings", home: "Business menu: Business details (/workspace/business-details), People and access, account, plan", state: "stay", use: "always", retainedAtLaunch: true,
    note: "Settings intentionally stays on /dashboard at launch, preserving branding, site basics and domain editing. It has a Back to business link and does not block owner entry.",
    parityGaps: [
      "Edits only business name, phone, public email, description and who gets Strelva's emails, in the business record; the tenant's site profile fields (tagline, main button, footer) don't change from here.",
      "No branding, site basics, navigation, connected services or domains editing; those sections say Strelva handles them on request.",
      "Plan and billing open the existing workspace settings; Stripe billing has no workspaceId yet.",
    ],
    // Stripe-adjacent `?checkout=` on Settings keeps landing where billing lives.
    target: (c) => c.search.has("checkout") ? workspaceHome(c.workspaceId, { view: "settings" }) : workspacePlace("business-details", c.workspaceId) },
  { route: "/store", home: "Website Connection: existing catalog and order evidence", state: "ready", use: "store", requires: ["systems"],
    note: "Reuses the existing order evidence panel. Checkout remains in the client site; no new storefront behavior.", target: websiteSitePlace("store") },
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
  return DASHBOARD_DISPOSITIONS.filter((entry) => uses.has(entry.use) && effectiveDisposition(entry.route).state === "stay" && !effectiveDisposition(entry.route).retainedAtLaunch);
}
