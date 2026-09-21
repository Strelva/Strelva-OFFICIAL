import { isBusinessStartProduct } from "./business-start";

/** Navigation hints only. APIs still authorize the requested workspace and work. */
const ID = /^[a-z0-9_-]{1,128}$/i;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const RECORD_ID = /^[a-z0-9_.:-]{1,200}$/i;
const INVITATION_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const VIEWS = new Set(["work", "ongoing", "settings", "products", "access", "help", "inquiries", "tracker", "document", "plan", "start", "websites", "onboarding", "applications", "scheduling", "investigations", "operations", "product-learning"]);
const INQUIRY_VIEWS = new Set(["home", "new", "shape", "work", "plan", "preview", "rehearsal", "receipt", "search", "record", "why", "responsibility", "connections", "onboarding", "account", "attention", "patterns"]);

export function workspaceReturnTarget(value: string | null): string | null {
  if (value === "/workspace/account?continue=public") return value;
  if (value?.startsWith("/workspace/delivery/") && /^\/workspace\/delivery\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) return value;
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
      : key === "offering" ? !ID.test(item) || params.get("view") !== "products"
      : key === "standingId" || key === "assignmentId" ? !UUID.test(item) || !["operations", "ongoing"].includes(params.get("view") || "")
      : key === "search" ? item !== "1" || params.get("view") !== "work"
      : key === "row" ? !RECORD_ID.test(item) || params.get("view") !== "tracker" || !params.get("work")
      : key === "save" ? !/^(scan_[a-z0-9]{1,251}|audit_[a-f0-9]{32})$/i.test(item)
      : key === "view" ? !VIEWS.has(item) : true) return null;
  }
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
  const match = value.match(/^\/workspace\/invitations\/accept\/([A-Za-z0-9_-]{43})$/);
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
