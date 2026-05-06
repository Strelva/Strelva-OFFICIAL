import type { TenantConfig } from "./types";

function withoutProtocol(domain: string): string {
  return domain.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

export function normalizeTenantDomain(domain: string | undefined): string | null {
  const normalized = domain ? withoutProtocol(domain).toLowerCase() : "";
  return normalized || null;
}

function withoutWww(domain: string): string {
  return domain.replace(/^www\./, "");
}

function isPlatformDomain(domain: string): boolean {
  return domain.endsWith(".scaffoldweb.com");
}

function isAdminDomain(domain: string): boolean {
  return domain.startsWith("admin.");
}

export function getTenantPrimaryDomain(tenant: TenantConfig): string | null {
  const productionDomain = normalizeTenantDomain(tenant.productionDomain);
  if (productionDomain) return withoutWww(productionDomain);

  const siteUrlDomain = normalizeTenantDomain(tenant.siteUrl);
  if (siteUrlDomain && !siteUrlDomain.endsWith(".vercel.app") && !isPlatformDomain(siteUrlDomain)) {
    return withoutWww(siteUrlDomain);
  }

  const customDomain = tenant.customDomains
    ?.map((domain) => normalizeTenantDomain(domain))
    .map((domain) => (domain ? withoutWww(domain) : null))
    .find((domain): domain is string => !!domain && !isAdminDomain(domain) && !isPlatformDomain(domain));
  return customDomain ?? null;
}

export function getTenantDashboardHost(tenant: TenantConfig): string {
  const adminDomain = normalizeTenantDomain(tenant.adminDomain);
  if (adminDomain) return adminDomain;

  const adminCustomDomain = tenant.customDomains?.find((domain) =>
    normalizeTenantDomain(domain)?.startsWith("admin.")
  );
  const normalizedAdminCustomDomain = normalizeTenantDomain(adminCustomDomain);
  if (normalizedAdminCustomDomain) return normalizedAdminCustomDomain;

  const primaryDomain = getTenantPrimaryDomain(tenant);
  if (primaryDomain) return `admin.${primaryDomain}`;

  const subdomain = tenant.subdomain || tenant.id;
  return `${subdomain}.scaffoldweb.com`;
}

export function getTenantDashboardUrl(
  tenant: TenantConfig,
  path = "/dashboard",
  environment = process.env.NODE_ENV
): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (environment === "production") {
    return `https://${getTenantDashboardHost(tenant)}${normalizedPath}`;
  }

  const subdomain = tenant.subdomain || tenant.id;
  return `http://${subdomain}.localhost:3000${normalizedPath}`;
}

export function getTenantPublicUrl(
  tenant: TenantConfig,
  environment = process.env.NODE_ENV
): string {
  if (environment === "production") {
    const primaryDomain = getTenantPrimaryDomain(tenant);
    if (primaryDomain) return `https://${primaryDomain}`;
    const subdomain = tenant.subdomain || tenant.id;
    return `https://${subdomain}.scaffoldweb.com`;
  }

  const subdomain = tenant.subdomain || tenant.id;
  return `http://${subdomain}.localhost:3000`;
}
