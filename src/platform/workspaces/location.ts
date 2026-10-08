import { isBusinessStartProduct } from "@/platform/workspaces/business-start";
import { workspaceSiteTarget } from "@/platform/workspaces/site-places";

/** Navigation hints only. APIs still authorize the requested workspace and work. */
const ID = /^[a-z0-9_-]{1,128}$/i;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const RECORD_ID = /^[a-z0-9_.:-]{1,200}$/i;
const INVITATION_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const VIEWS = new Set(["system", "requests", "customers", "apps", "work", "ongoing", "settings", "products", "access", "help", "inquiries", "tracker", "document", "plan", "start", "websites", "custom-applications", "onboarding", "applications", "scheduling", "investigations", "operations", "product-learning", "ask"]);
const INQUIRY_VIEWS = new Set(["home", "new", "shape", "work", "plan", "preview", "rehearsal", "receipt", "search", "record", "why", "responsibility", "connections", "onboarding", "account", "attention", "patterns"]);

export function workspaceReturnTarget(value: string | null): string | null {
  if (value === "/workspace/account?continue=public") return value;
  if (value?.startsWith("/workspace/delivery/") && /^\/workspace\/delivery\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) return value;
  if (value?.startsWith("/workspace/recaps?")) {
    const target = new URL(value, "https://workspace.invalid");
    const workspaceId = target.searchParams.get("workspaceId");
    const period = target.searchParams.get("period");
    const allowed = [...target.searchParams.keys()].every((key) => key === "workspaceId" || key === "period");
    if (target.hash || target.pathname !== "/workspace/recaps" || !allowed || target.searchParams.getAll("workspaceId").length !== 1
      || !workspaceId || !UUID.test(workspaceId) || target.searchParams.getAll("period").length > 1 || (period !== null && period !== "week" && period !== "month")) return null;
    return `${target.pathname}?${target.searchParams}`;
  }
  // Workspace homes of old /dashboard pages (owner-entry spec §5). Each takes
  // its business, and Results also its time window.
  const place = value?.match(/^\/workspace\/(inquiries|reviews|results|business-details)\?/);
  if (value && place) {
    const target = new URL(value, "https://workspace.invalid");
    const params = target.searchParams;
    const workspaceId = params.get("workspaceId");
    const allowed = place[1] === "results" ? ["workspaceId", "range", "from", "to"] : ["workspaceId"];
    if (target.hash || [...params.keys()].some((key) => !allowed.includes(key) || params.getAll(key).length !== 1)
      || !workspaceId || !UUID.test(workspaceId)) return null;
    const range = params.get("range");
    if (range !== null && !["live", "week", "month", "custom"].includes(range)) return null;
    for (const key of ["from", "to"]) {
      const date = params.get(key);
      if (date !== null && (range !== "custom" || !/^\d{4}-\d{2}-\d{2}$/.test(date))) return null;
    }
    return `${target.pathname}?${params}`;
  }
  // A managed website's own pages (editor, photos, look, history, connections).
  if (value?.startsWith("/workspace/site?")) return workspaceSiteTarget(value);
  if (value?.startsWith("/workspace/bookings?")) {
    // The bookings System's day and week views (the homes of /dashboard/roster and /dashboard/schedule).
    const target = new URL(value, "https://workspace.invalid");
    const workspaceId = target.searchParams.get("workspaceId");
    const view = target.searchParams.get("view");
    const date = target.searchParams.get("date");
    const allowed = [...target.searchParams.keys()].every((key) => key === "workspaceId" || key === "view" || key === "date" || key === "source");
    if (target.hash || target.pathname !== "/workspace/bookings" || !allowed || target.searchParams.getAll("workspaceId").length !== 1
      || !workspaceId || !UUID.test(workspaceId) || target.searchParams.getAll("view").length > 1 || (view !== null && view !== "day" && view !== "week")
      || target.searchParams.getAll("source").length > 1 || (target.searchParams.has("source") && !["all", "agent"].includes(target.searchParams.get("source")!))
      || target.searchParams.getAll("date").length > 1 || (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date))) return null;
    return `${target.pathname}?${target.searchParams}`;
  }
  if (value?.startsWith("/workspace/business/new?") || value?.startsWith("/workspace/delivery?")) {
    const target = new URL(value, "https://workspace.invalid");
    if (target.hash || target.searchParams.size !== 1) return null;
    const entry = [...target.searchParams][0];
    if (!entry) return null;
    const [key, item] = entry;
    if (target.pathname === "/workspace/business/new" && key === "start" && isBusinessStartProduct(item)) return `${target.pathname}?${target.searchParams}`;
    if (target.pathname === "/workspace/delivery" && ((key === "providerKind" && item === "strelva") || ((key === "businessId" || key === "providerWorkspaceId") && UUID.test(item)))) return `${target.pathname}?${target.searchParams}`;
    return null;
  }

  // The agency setup checklist (#258), optionally for one agency.
  if (value === "/workspace/agency/start") return value;
  if (value?.startsWith("/workspace/agency/start?")) {
    const target = new URL(value, "https://workspace.invalid");
    const workspaceId = target.searchParams.get("workspaceId");
    if (target.hash || target.pathname !== "/workspace/agency/start" || target.searchParams.size !== 1 || !workspaceId || !UUID.test(workspaceId)) return null;
    return `${target.pathname}?${target.searchParams}`;
  }
  // An agency adds a client (#259): one agency, optionally one of its prospects.
  if (value?.startsWith("/workspace/agency/clients/new?")) {
    const target = new URL(value, "https://workspace.invalid");
    const params = target.searchParams;
    const workspaceId = params.get("workspaceId");
    const prospect = params.get("prospect");
    if (target.hash || target.pathname !== "/workspace/agency/clients/new" || [...params.keys()].some((key) => !["workspaceId", "prospect"].includes(key) || params.getAll(key).length !== 1)
      || !workspaceId || !UUID.test(workspaceId) || (prospect !== null && !UUID.test(prospect))) return null;
    return `${target.pathname}?${params}`;
  }
  if (!value || (value !== "/workspace" && !value.startsWith("/workspace?"))) return null;
  const url = new URL(value, "https://workspace.invalid");
  if (url.hash || url.pathname !== "/workspace") return null;
  const params = url.searchParams;
  for (const [key, item] of params) {
    if (params.getAll(key).length !== 1) return null;
    if (key === "workspaceId" ? !UUID.test(item)
      : key === "work" ? !ID.test(item)
      : key === "tenantId" ? !ID.test(item)
      : key === "inquiryView" ? !INQUIRY_VIEWS.has(item)
      : key === "inquiryRequest" || key === "inquiryRecord" ? !ID.test(item)
      : key === "offering" || key === "template" ? !ID.test(item) || params.get("view") !== "products"
      : key === "standingId" || key === "assignmentId" ? !UUID.test(item) || !["operations", "ongoing"].includes(params.get("view") || "")
      : key === "system" ? !UUID.test(item) || !["system", "ask"].includes(params.get("view") || "")
      : key === "search" ? item !== "1" || !["work", "apps"].includes(params.get("view") || "")
      : key === "row" ? !RECORD_ID.test(item) || params.get("view") !== "tracker" || !params.get("work")
      : key === "save" ? !/^(scan_[a-z0-9]{1,251}|audit_[a-f0-9]{32})$/i.test(item)
      : key === "view" ? !VIEWS.has(item) : true) return null;
  }
  // A System page needs its System; `view=system` alone opens nothing.
  if (params.get("view") === "system" && !params.get("system")) return null;
  return `/workspace${params.size ? `?${params}` : ""}`;
}

/**
 * Preserve an invitation claim before reopening a safe workspace destination.
 *
 * The account page is the existing invitation boundary: it claims a pending
 * invite for the verified identity before handing the person to the shared
 * workspace. Keep the requested workspace location nested inside that known
 * route so auth callbacks never need to carry draft contents or an arbitrary
 * redirect.
 */
export function accountReturnTarget(value: string | null): string | null {
  if (!value || (value !== "/account" && !value.startsWith("/account?"))) return null;
  const url = new URL(value, "https://workspace.invalid");
  if (url.hash || url.pathname !== "/account") return null;
  const params = url.searchParams;
  for (const [key] of params) {
    if (key !== "next" || params.getAll(key).length !== 1) return null;
  }
  if (!params.has("next")) return "/account";
  const next = workspaceReturnTarget(params.get("next"));
  return next ? `/account?next=${encodeURIComponent(next)}` : null;
}

/** Preserve only the fixed, opaque workspace invitation acceptance path. */
export function workspaceInvitationReturnTarget(value: string | null): string | null {
  if (!value) return null;
  // A workspace invitation, or an agency's owner claim link (#259).
  const match = value.match(/^\/workspace\/(?:invitations\/accept|claim)\/([A-Za-z0-9_-]{43})$/);
  return match?.[1] && INVITATION_TOKEN.test(match[1]) ? value : null;
}

export function replaceWorkspaceLocation(workspaceId: string, workId?: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("workspaceId", workspaceId);
  if (workId) {
    url.searchParams.set("work", workId);
    url.searchParams.delete("offering");
  }
  else url.searchParams.delete("work");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}
