/**
 * Where a managed website's own pages live in the workspace
 * (owner-entry spec §5): `/workspace/site?workspaceId=…&system=…&tab=…`.
 *
 * The website System page opens these; the old `/dashboard/<page>` paths
 * redirect to them once owner entry is on; and the reused dashboard
 * components (editor, photos, look, collections, history, connections)
 * resolve their own `/dashboard/…` links through `workspaceDashboardHref`,
 * so moving between them never leaves the workspace. API paths go to the
 * tenant's routes through `/client/<tenant>`, where the tenant permission
 * checks still run.
 *
 * Pure. Navigation hints only; every page and API authorizes on its own.
 */

export const SITE_TABS = ["edit", "photos", "look", "collections", "history", "connections", "google", "source", "request", "store", "members"] as const;
export type SiteTab = (typeof SITE_TABS)[number];

export const SITE_TAB_LABEL: Record<SiteTab, string> = {
  edit: "Edit",
  photos: "Photos",
  look: "Look",
  collections: "Blog and collections",
  history: "History",
  connections: "Connections",
  google: "Google Business",
  source: "Connection",
  request: "Ask for a change",
  store: "Store",
  members: "Members",
};

/** Tabs a site that Strelva edits natively shows, in order. `source` opens from Connections. */
export const NATIVE_TABS: readonly SiteTab[] = ["edit", "photos", "look", "collections", "history", "connections", "google"];
/** A repo-only site: changes are Requests; its history and connections still read. */
export const REQUEST_TABS: readonly SiteTab[] = ["request", "history", "connections", "google"];

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SOURCE_ID = /^[a-z0-9_-]{1,64}$/i;
const REQUEST_ID = /^[A-Za-z0-9_.:-]{1,200}$/;

export function isSiteTab(value: string | null | undefined): value is SiteTab {
  return typeof value === "string" && (SITE_TABS as readonly string[]).includes(value);
}

export interface SitePlace {
  workspaceId: string;
  systemId: string;
  tab?: SiteTab;
  /** A Connection's id, for `tab=source`. */
  source?: string;
  /** A website request id to highlight, for `tab=history`. */
  request?: string;
}

export function workspaceSiteHref(place: SitePlace, base = ""): string {
  const params = new URLSearchParams({ workspaceId: place.workspaceId, system: place.systemId });
  if (place.tab && place.tab !== "edit") params.set("tab", place.tab);
  if (place.tab === "source" && place.source) params.set("source", place.source);
  if (place.tab === "history" && place.request) params.set("request", place.request);
  return `${base}/workspace/site?${params}`;
}

/** Validates a `/workspace/site?…` target (for sign-in return and redirects). */
export function workspaceSiteTarget(value: string): string | null {
  const url = new URL(value, "https://workspace.invalid");
  if (url.pathname !== "/workspace/site" || url.hash) return null;
  const params = url.searchParams;
  for (const key of params.keys()) {
    if (params.getAll(key).length !== 1 || !["workspaceId", "system", "tab", "source", "request", "entry", "workId"].includes(key)) return null;
  }
  const workspaceId = params.get("workspaceId");
  const systemId = params.get("system");
  const tab = params.get("tab");
  const source = params.get("source");
  const request = params.get("request");
  if (!workspaceId || !UUID.test(workspaceId)) return null;
  const entry = params.get("entry");
  const workId = params.get("workId");
  if (systemId === null) {
    if (tab !== null || source !== null || request !== null || (entry !== null && entry !== "connect" && entry !== "rebuild") || (workId !== null && (entry !== "rebuild" || !UUID.test(workId)))) return null;
    return `${url.pathname}?${params}`;
  }
  if (!UUID.test(systemId) || entry !== null || workId !== null) return null;
  if (tab !== null && !isSiteTab(tab)) return null;
  if (source !== null && (tab !== "source" || !SOURCE_ID.test(source))) return null;
  if (tab === "source" && source === null) return null;
  if (request !== null && (tab !== "history" || !REQUEST_ID.test(request))) return null;
  return `${url.pathname}?${params}`;
}

/** The site place an old `/dashboard/<page>` path (query included) belongs to, or null. */
export function sitePlaceForDashboardPath(path: string): { tab: SiteTab; source?: string; request?: string } | null {
  const url = new URL(path, "https://dashboard.invalid");
  const route = url.pathname.replace(/\/+$/, "");
  if (route === "/dashboard/site" || route === "/dashboard/content") return { tab: "edit" };
  if (route === "/dashboard/store") return { tab: "store" };
  if (route === "/dashboard/members") return { tab: "members" };
  if (route === "/dashboard/assets") return { tab: "photos" };
  if (route === "/dashboard/brand-kit") return { tab: "look" };
  if (route === "/dashboard/collections") return { tab: "collections" };
  if (route === "/dashboard/history") {
    const request = url.searchParams.get("request");
    return request && REQUEST_ID.test(request) ? { tab: "history", request } : { tab: "history" };
  }
  if (route === "/dashboard/integrations" || route === "/dashboard/sources") return { tab: "connections" };
  if (route === "/dashboard/google") return { tab: "google" };
  const source = route.match(/^\/dashboard\/sources\/([^/]+)$/)?.[1];
  if (source) {
    const decoded = decodeURIComponent(source);
    return SOURCE_ID.test(decoded) ? { tab: "source", source: decoded } : { tab: "connections" };
  }
  return null;
}

export interface WorkspaceDashboardHrefContext {
  workspaceId: string;
  systemId: string;
  /** `/client/<tenant>` on the app host, or "" where the host already names the tenant. */
  tenantRoot: string;
  /** Presentation origin for workspace links (the local preview uses its own). */
  workspaceBase?: string;
  /** Ask Strelva runs in the workspace; otherwise the old chat page stays the place to ask. */
  askReleased?: boolean;
}

/**
 * The `dashboardHref` a reused dashboard component gets inside the workspace.
 * `/dashboard/<moved page>` stays in the workspace; Ask Strelva and health
 * open their workspace places; anything else under `/dashboard` and every
 * `/api` path go to the tenant, unchanged.
 */
export function workspaceDashboardHref(context: WorkspaceDashboardHrefContext): (path: string) => string {
  const base = context.workspaceBase ?? "";
  return (raw: string) => {
    const path = raw.startsWith("/") ? raw : `/${raw}`;
    if (path === "/dashboard" || path.startsWith("/dashboard/") || path.startsWith("/dashboard?") || path.startsWith("/dashboard#")) {
      const hash = path.includes("#") ? path.slice(path.indexOf("#")) : "";
      const place = sitePlaceForDashboardPath(path);
      if (place) return `${workspaceSiteHref({ workspaceId: context.workspaceId, systemId: context.systemId, ...place }, base)}${hash}`;
      const route = new URL(path, "https://dashboard.invalid").pathname.replace(/\/+$/, "");
      const params = new URLSearchParams({ workspaceId: context.workspaceId, system: context.systemId });
      if (route === "/dashboard/chat" && context.askReleased) { params.set("view", "ask"); return `${base}/workspace?${params}`; }
    }
    return `${context.tenantRoot}${path}`;
  };
}
