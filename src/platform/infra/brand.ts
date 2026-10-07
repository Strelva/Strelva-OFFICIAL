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

/** Includes the app apex for legacy hosted addresses during a sites cutover. */
export function isPlatformDomain(host: string): boolean {
  const normalized = host.toLowerCase().split(":")[0]!;
  return [APP_ROOT_DOMAIN, SITES_ROOT_DOMAIN].some(root => normalized === root || normalized.endsWith(`.${root}`));
}
