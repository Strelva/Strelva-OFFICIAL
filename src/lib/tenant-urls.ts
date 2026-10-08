import { APP_ROOT_DOMAIN, SITES_ROOT_DOMAIN, SITES_PATH_ORIGIN, CONTROL_PLANE_URL, isPlatformDomain, tenantSiteOrigin, tenantHostedBaseUrl } from "@/platform/infra/brand";
import type { TenantConfig } from "./types";
import type { SiteConfig, TenantIdentity } from "./tenant/models";

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

function isAdminDomain(domain: string): boolean {
  return domain.startsWith("admin.");
}

function isLocalOrPreviewDomain(domain: string): boolean {
  return domain.endsWith(".localhost") || domain.endsWith(".vercel.app");
}

function parseTenantDomainMap(raw: string): Record<string, string> {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter((entry): entry is [string, string] =>
          typeof entry[0] === "string" && typeof entry[1] === "string"
        )
    );
  } catch {
    return {};
  }
}

export function getTenantPublicUrlFromDomainMap(
  tenantId: string,
  raw = process.env.CUSTOM_DOMAIN_MAP || "{}"
): string {
  const normalizedTenant = tenantId.toLowerCase();
  const publicDomains = Object.entries(parseTenantDomainMap(raw))
    .filter(([, mappedTenant]) => mappedTenant.toLowerCase() === normalizedTenant)
    .map(([domain]) => normalizeTenantDomain(domain))
    .filter((domain): domain is string =>
      !!domain &&
      !isAdminDomain(domain) &&
      !isPlatformDomain(domain) &&
      !isLocalOrPreviewDomain(domain)
    );

  const preferredDomain =
    publicDomains.find((domain) => !domain.startsWith("www.")) ??
    publicDomains.find((domain) => domain.startsWith("www."));

  return preferredDomain ? `https://${preferredDomain}` : "";
}

function getTenantPublicDomain(tenant: SiteConfig): string | null {
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

export function getTenantPrimaryDomain(tenant: SiteConfig): string | null {
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

export function getTenantDashboardHost(tenant: SiteConfig & TenantIdentity): string {
  const adminDomain = normalizeTenantDomain(tenant.adminDomain);
  if (adminDomain) return adminDomain;

  const adminCustomDomain = tenant.customDomains?.find((domain) =>
    normalizeTenantDomain(domain)?.startsWith("admin.")
  );
  const normalizedAdminCustomDomain = normalizeTenantDomain(adminCustomDomain);
  if (normalizedAdminCustomDomain) return normalizedAdminCustomDomain;

  const primaryDomain = getTenantPrimaryDomain(tenant);
  if (primaryDomain && !(SITES_ROOT_DOMAIN !== APP_ROOT_DOMAIN && isPlatformDomain(primaryDomain))) return `admin.${primaryDomain}`;

  const subdomain = tenant.subdomain || tenant.id;
  return `${subdomain}.${APP_ROOT_DOMAIN}`;
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
    // app.strelva.com is the control plane and serves /client/* paths.
    // strelva.com is the marketing site and 404s on /client/* — using it here
    // broke the admin tenant-dashboard links and the post-login account redirect.
    return `${CONTROL_PLANE_URL}/client/${tenantId}${normalizedPath}`;
  }

  return `http://localhost:3000/client/${tenantId}${normalizedPath}`;
}

export function getTenantPublicUrl(
  tenant: TenantConfig,
  environment = process.env.NODE_ENV
): string {
  if (environment === "production") {
    const publicDomain = getTenantPublicDomain(tenant);
    if (publicDomain && !((SITES_PATH_ORIGIN || SITES_ROOT_DOMAIN !== APP_ROOT_DOMAIN) && isPlatformDomain(publicDomain)) && !(SITES_PATH_ORIGIN && publicDomain.endsWith(".vercel.app"))) return `https://${publicDomain}`;
    const subdomain = tenant.subdomain || tenant.id;
    return tenantHostedBaseUrl(subdomain);
  }

  const subdomain = tenant.subdomain || tenant.id;
  return `http://${subdomain}.localhost:3000`;
}

/** Public origins that may sign server-side tracking outcomes for this tenant. */
export function getTenantPublicOrigins(
  tenant: TenantConfig,
  environment = process.env.NODE_ENV,
): string[] {
  const origins = new Set<string>();
  const subdomain = tenant.subdomain || tenant.id;

  if (environment === "production") {
    // The hosted tenant address remains valid even when a custom domain is primary.
    origins.add(new URL(tenantSiteOrigin(subdomain)).origin);
  }

  const configuredSites = [
    tenant.productionDomain,
    tenant.siteUrl,
    ...(tenant.customDomains ?? []),
  ];
  for (const configuredSite of configuredSites) {
    if (!configuredSite) continue;
    try {
      const value = configuredSite.trim();
      const parsed = new URL(value.includes("://") ? value : `https://${value}`);
      const hostname = parsed.hostname.toLowerCase();
      if (
        parsed.protocol !== "https:" ||
        parsed.username ||
        parsed.password ||
        !hostname ||
        isAdminDomain(hostname) ||
        hostname === "vercel.app" ||
        hostname.endsWith(".vercel.app") ||
        isPlatformDomain(hostname)
      ) {
        continue;
      }
      origins.add(parsed.origin);
    } catch {
      // Invalid or non-origin tenant URL fields cannot authorize tracking.
    }
  }

  return [...origins];
}
