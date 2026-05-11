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

function getTenantPublicDomain(tenant: TenantConfig): string | null {
  const productionDomain = normalizeTenantDomain(tenant.productionDomain);
  const siteUrlDomain = normalizeTenantDomain(tenant.siteUrl);
  const normalizedCustomDomains = tenant.customDomains
    ?.map((domain) => normalizeTenantDomain(domain))
    .filter((domain): domain is string => !!domain && !isAdminDomain(domain) && !isPlatformDomain(domain));

  if (
    productionDomain &&
    siteUrlDomain?.startsWith("www.") &&
    withoutWww(siteUrlDomain) === withoutWww(productionDomain) &&
    !siteUrlDomain.endsWith(".vercel.app") &&
    !isPlatformDomain(siteUrlDomain)
  ) {
    return siteUrlDomain;
  }
  const matchingWwwCustomDomain = productionDomain
    ? normalizedCustomDomains?.find(
        (domain) => domain.startsWith("www.") && withoutWww(domain) === withoutWww(productionDomain)
      )
    : null;
  if (matchingWwwCustomDomain) return matchingWwwCustomDomain;
  if (productionDomain) return productionDomain;

  if (siteUrlDomain && !siteUrlDomain.endsWith(".vercel.app") && !isPlatformDomain(siteUrlDomain)) {
    return siteUrlDomain;
  }

  const customDomain =
    normalizedCustomDomains?.find((domain) => domain.startsWith("www.")) ??
    normalizedCustomDomains?.[0];
  return customDomain ?? null;
}

export function getTenantPrimaryDomain(tenant: TenantConfig): string | null {
  const productionDomain = getTenantPublicDomain(tenant);
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

export function getTenantDashboardFallbackUrl(
  tenant: TenantConfig,
  path = "/dashboard",
  environment = process.env.NODE_ENV
): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const tenantId = tenant.subdomain || tenant.id;

  if (environment === "production") {
    return `https://scaffoldweb.com/client/${tenantId}${normalizedPath}`;
  }

  return `http://localhost:3000/client/${tenantId}${normalizedPath}`;
}

export function getTenantPublicUrl(
  tenant: TenantConfig,
  environment = process.env.NODE_ENV
): string {
  if (environment === "production") {
    const publicDomain = getTenantPublicDomain(tenant);
    if (publicDomain) return `https://${publicDomain}`;
    const subdomain = tenant.subdomain || tenant.id;
    return `https://${subdomain}.scaffoldweb.com`;
  }

  const subdomain = tenant.subdomain || tenant.id;
  return `http://${subdomain}.localhost:3000`;
}
