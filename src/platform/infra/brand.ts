// Edge/browser-safe source of truth for app and hosted-site domains. Public env
// names keep server and browser URL generation identical in the same build.
export const BRAND_NAME = "Strelva" as const;

export function configuredRootDomain(value: string | undefined, fallback = "strelva.com"): string {
  const domain = value?.trim().toLowerCase() || fallback;
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(domain)) {
    throw new Error("Root domain configuration must be a bare DNS domain (no scheme, port or path).");
  }
  return domain;
}

export const APP_ROOT_DOMAIN = configuredRootDomain(process.env.NEXT_PUBLIC_APP_ROOT_DOMAIN);
// Intentionally independent: omitting either variable preserves today's apex.
// Choosing/purchasing the separate sites apex and changing DNS require #243.
export const SITES_ROOT_DOMAIN = configuredRootDomain(process.env.NEXT_PUBLIC_SITES_ROOT_DOMAIN);
export const MARKETING_URL = `https://www.${APP_ROOT_DOMAIN}`;
export const CONTROL_PLANE_URL = `https://app.${APP_ROOT_DOMAIN}`;
export const OPERATOR_URL = `https://admin.${APP_ROOT_DOMAIN}`;
// Sending infrastructure is a separate decision; a sites cutover never moves it.
export const EMAIL_DOMAIN = "updates.strelva.com";

export function tenantSiteHost(tenant: string, sitesRoot = SITES_ROOT_DOMAIN): string {
  return `${encodeURIComponent(tenant)}.${sitesRoot}`;
}

export function tenantSiteOrigin(tenant: string, sitesRoot = SITES_ROOT_DOMAIN): string {
  return `https://${tenantSiteHost(tenant, sitesRoot)}`;
}

/** Optional DNS-free delivery on an assigned Vercel origin. It is deliberately
 * separate from app sessions, and is inert until an operator configures it. */
export function configuredSitesPathOrigin(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  const url = new URL(value.trim());
  const local = process.env.NODE_ENV !== "production" && url.protocol === "http:" && url.hostname === "sites.localhost";
  const assigned = url.protocol === "https:" && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.vercel\.app$/.test(url.hostname) && !url.port;
  if ((!local && !assigned) || url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
      url.origin === new URL(process.env.NEXT_PUBLIC_APP_URL || CONTROL_PLANE_URL).origin) {
    throw new Error("Sites path delivery requires a separate assigned HTTPS Vercel origin (no credentials, port, query or path).");
  }
  return url.origin;
}

export const SITES_PATH_ORIGIN = configuredSitesPathOrigin(process.env.NEXT_PUBLIC_SITES_PATH_ORIGIN);

/** A website base can include a path; tenantSiteOrigin remains a bare origin
 * for existing client/API consumers. Issued receipts are never rewritten. */
export function tenantHostedBaseUrl(tenant: string, sitesRoot = SITES_ROOT_DOMAIN): string {
  return SITES_PATH_ORIGIN ? `${SITES_PATH_ORIGIN}/sites/${encodeURIComponent(tenant)}` : tenantSiteOrigin(tenant, sitesRoot);
}

export function isSitesPathHost(host: string): boolean {
  return !!SITES_PATH_ORIGIN && host.toLowerCase() === new URL(SITES_PATH_ORIGIN).host;
}

export function parseSitesPath(path: string): { tenant: string; pagePath: string } | null {
  const match = /^\/sites\/([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\/.*)?$/.exec(path);
  if (!match || !/^\/(?:[a-zA-Z0-9_.-]+\/?)*$/.test(match[2] || "/") || path.split("/").some(segment => segment === "." || segment === "..")) return null;
  return { tenant: match[1]!, pagePath: match[2] || "/" };
}

export function sitePageUrl(path: string, base: string): string {
  return new URL(path.replace(/^\//, ""), `${base.replace(/\/$/, "")}/`).toString();
}

/** Includes the app apex for legacy hosted addresses during a sites cutover. */
export function isPlatformDomain(host: string): boolean {
  const normalized = host.toLowerCase().split(":")[0]!;
  return [APP_ROOT_DOMAIN, SITES_ROOT_DOMAIN].some(root => normalized === root || normalized.endsWith(`.${root}`));
}
