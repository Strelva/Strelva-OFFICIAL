import type { TenantConfig } from "./types";

function withoutProtocol(domain: string): string {
  return domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

function getProductionDashboardHost(tenant: TenantConfig): string {
  if (tenant.adminDomain) return withoutProtocol(tenant.adminDomain);
  if (tenant.productionDomain) return `admin.${withoutProtocol(tenant.productionDomain)}`;

  const adminCustomDomain = tenant.customDomains?.find((domain) =>
    withoutProtocol(domain).startsWith("admin.")
  );
  if (adminCustomDomain) return withoutProtocol(adminCustomDomain);

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
    return `https://${getProductionDashboardHost(tenant)}${normalizedPath}`;
  }

  const subdomain = tenant.subdomain || tenant.id;
  return `http://${subdomain}.localhost:3000${normalizedPath}`;
}

export function getTenantPublicUrl(
  tenant: TenantConfig,
  environment = process.env.NODE_ENV
): string {
  if (environment === "production") {
    if (tenant.productionDomain) return `https://${withoutProtocol(tenant.productionDomain)}`;
    if (tenant.siteUrl) return tenant.siteUrl;
    const subdomain = tenant.subdomain || tenant.id;
    return `https://${subdomain}.scaffoldweb.com`;
  }

  const subdomain = tenant.subdomain || tenant.id;
  return `http://${subdomain}.localhost:3000`;
}
