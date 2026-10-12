/**
 * How a managed website changes (website-system spec section 2, the four
 * implementation kinds).
 *
 * - `native`: Strelva edits the site's content directly. The site reads its
 *   content from Strelva (`custom_repo_content`: gldf, rohlax,
 *   rhm-innovations, per `v1Endpoints` in release-manifest.json) or Strelva
 *   renders it (`platform_template`). The workspace opens the content editor.
 * - `request`: the site reads no content from Strelva (`custom_repo`). Every
 *   change is a repo change: the owner asks, Strelva builds a preview on a
 *   branch, the owner approves, Strelva deploys. The workspace files a
 *   Request with preview and deploy receipts.
 *
 * Pure. `release-manifest.json` is the evidence; a test fails if this list
 * drifts from it.
 */

export type SiteEditing = "native" | "request";

/** Client repos whose manifest declares the `content` endpoint. */
export const CONTENT_READING_REPOS: ReadonlySet<string> = new Set(["gldf", "rohlax", "rhm-innovations"]);

export function siteEditingFor(tenant: { id: string; deliveryModel?: "custom_repo" | "platform_template" | null }): SiteEditing {
  if (tenant.deliveryModel === "platform_template") return "native";
  return CONTENT_READING_REPOS.has(tenant.id) ? "native" : "request";
}
