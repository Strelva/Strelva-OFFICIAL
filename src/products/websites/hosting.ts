import { assertWebsiteArtifactBundle, type WebsiteArtifactBundle } from "./artifact";
import { HOSTED_SITE_ADDRESS_PATTERN } from "@/lib/hosted-site-host";

/** Hosted page paths map to the exported static build: `/` and `/<slug>`. */
export type HostedWebsitePages = Record<string, string>;

const RUNTIME_PATH = "/website-generation/capability-runtime.mjs";
const RESERVED_ADDRESSES = new Set(["www", "admin", "app", "api", "mail", "sites", "strelva", "support", "help", "status"]);

function slug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

/**
 * Ordered address choices for a first publication: the business name, then
 * numbered variants, then one derived from the work id so a crowded name still
 * gets a stable address.
 */
export function websiteAddressCandidates(siteName: string, workId: string): string[] {
  const base = slug(siteName);
  const fallback = `site-${workId.replace(/-/g, "").slice(0, 8).toLowerCase()}`;
  if (!base || RESERVED_ADDRESSES.has(base) || !HOSTED_SITE_ADDRESS_PATTERN.test(base)) return [fallback];
  const numbered = Array.from({ length: 8 }, (_, index) => `${base}-${index + 2}`);
  return [base, ...numbered, `${base}-${workId.replace(/-/g, "").slice(0, 6).toLowerCase()}`];
}

/**
 * Extract the servable pages from a verified immutable bundle. Only rendered
 * HTML and the pinned capability runtime become public; the spec, manifest
 * and build tooling stay in the private export.
 */
export function hostedPagesFromBundle(bundle: WebsiteArtifactBundle): HostedWebsitePages {
  assertWebsiteArtifactBundle(bundle);
  const pages: HostedWebsitePages = {};
  for (const file of bundle.files) {
    if (file.path === "site/index.html") pages["/"] = file.content;
    const match = /^site\/([a-zA-Z0-9_-]+)\/index\.html$/.exec(file.path);
    if (match) pages[`/${match[1]}`] = file.content;
    if (file.path === "website-generation/capability-runtime.mjs") pages[RUNTIME_PATH] = file.content;
  }
  if (!pages["/"]) throw new Error("The approved website has no home page to publish.");
  return pages;
}

export interface HostedSiteFile {
  body: string;
  contentType: string;
}

/** Resolve a request path against published pages. Unknown paths are not served. */
export function hostedSiteFile(pages: HostedWebsitePages, pathname: string): HostedSiteFile | null {
  let path = pathname || "/";
  if (path.length > 1) path = path.replace(/\/+$/, "").replace(/\/index\.html$/, "") || "/";
  if (!Object.prototype.hasOwnProperty.call(pages, path)) return null;
  const body = pages[path];
  if (typeof body !== "string") return null;
  return { body, contentType: path.endsWith(".mjs") ? "text/javascript; charset=utf-8" : "text/html; charset=utf-8" };
}

/** Public-site CSP: own scripts and pages, inline styles, and only the declared capability API. */
export function hostedSiteContentSecurityPolicy(connectOrigin: string | null): string {
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'unsafe-inline'",
    "img-src https: data:",
    "font-src https: data:",
    `connect-src ${connectOrigin ?? "'none'"}`,
    "form-action 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}
