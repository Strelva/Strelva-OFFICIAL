/**
 * How a managed website changes (website-system spec section 2, the four
 * implementation kinds).
 *
 * - `native`: Strelva edits the site's content directly. The site declares it
 *   reads its content from Strelva (`customRepo.contentSource = "strelva"`) or
 *   Strelva renders it (`platform_template`). The workspace opens the content
 *   editor.
 * - `request`: every change is a repo change: the owner asks, a coding agent
 *   builds a preview on a branch, the owner approves, the site deploys. The
 *   workspace files a Request with preview and deploy receipts. An undeclared
 *   custom repo is `request`.
 *
 * The declaration lives on the tenant (`customRepo.contentSource`) and is
 * refreshed from the site's own capability manifest, never from a list of
 * names. Pure and browser-safe.
 */

export type SiteEditing = "native" | "request";
export type SiteContentSource = "strelva" | "repo";

export interface SiteEditingTenant {
  id: string;
  deliveryModel?: "custom_repo" | "platform_template" | null;
  customRepo?: { contentSource?: SiteContentSource } | null;
}

export function contentSourceFor(tenant: SiteEditingTenant): SiteContentSource {
  if (tenant.deliveryModel === "platform_template") return "strelva";
  return tenant.customRepo?.contentSource === "strelva" ? "strelva" : "repo";
}

export function siteEditingFor(tenant: SiteEditingTenant): SiteEditing {
  return contentSourceFor(tenant) === "strelva" ? "native" : "request";
}

/** A custom repo that reads Strelva content (the old p_content_reading). */
export function readsStrelvaContent(tenant: SiteEditingTenant): boolean {
  return tenant.deliveryModel !== "platform_template" && tenant.customRepo?.contentSource === "strelva";
}
