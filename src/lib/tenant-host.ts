import { APP_ROOT_DOMAIN, SITES_ROOT_DOMAIN } from "@/platform/infra/brand";
import { isMarketingHost } from "./marketing-hosts";

/**
 * Reserved control-plane subdomains under strelva.com that are NOT tenants.
 * `app`/`api` matter for the scaffoldweb.com -> app.strelva.com cutover: without
 * this, app.strelva.com would resolve to a phantom tenant "app". `www`/`admin`
 * are control-plane too.
 */
export const RESERVED_SUBDOMAINS = new Set(["www", "admin", "app", "api"]);

/** Covers the separate public apex, including reserved and unsupported hosts. */
export function isSeparateSitesHost(host: string, sitesRoot = SITES_ROOT_DOMAIN, appRoot = APP_ROOT_DOMAIN): boolean {
  const hostname = host.toLowerCase().split(":")[0] ?? "";
  return sitesRoot !== appRoot && (hostname === sitesRoot || hostname.endsWith(`.${sitesRoot}`));
}

/**
 * The single source of truth for turning a Host header into a tenant routing
 * slug (+ admin flag). Pure and Edge-safe (no next/headers, no Node deps) so
 * both the proxy edge (`extractTenantFromHost`) and server components
 * (`getTenantFromHost`) resolve identically — previously two divergent copies,
 * the server one missing the marketing/app/api exclusions (#6 identity seam).
 *
 * The returned `tenant` is the mutable subdomain slug — still the tenant's
 * identity at this layer. The stable UUID is resolved downstream from the loaded
 * tenant record (TenantConfig.stableId), not from the host.
 */
export function parseTenantHost(host: string, sitesRoot = SITES_ROOT_DOMAIN, appRoot = APP_ROOT_DOMAIN): { tenant: string | null; isAdmin: boolean } {
  const hostWithoutPort = host.toLowerCase().split(":")[0] ?? "";

  if (isMarketingHost(host)) {
    return { tenant: null, isAdmin: false };
  }

  const parseSuffix = (
    suffix: string,
    applyReserved: boolean,
  ): { tenant: string | null; isAdmin: boolean } => {
    const subdomain = hostWithoutPort.slice(0, -suffix.length);
    if (subdomain.startsWith("admin.")) {
      const tenant = subdomain.replace(/^admin\./, "");
      return tenant ? { tenant, isAdmin: true } : { tenant: null, isAdmin: false };
    }
    if (subdomain && (!applyReserved || !RESERVED_SUBDOMAINS.has(subdomain))) {
      return { tenant: subdomain, isAdmin: false };
    }
    return { tenant: null, isAdmin: false };
  };

  // A separate sites apex only hosts one-label public tenants. Admin stays
  // on the app/custom domains; admin.<tenant> needs a deeper wildcard cert.
  if (isSeparateSitesHost(host, sitesRoot, appRoot)) {
    const slug = hostWithoutPort.slice(0, -sitesRoot.length - 1);
    return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug) && !RESERVED_SUBDOMAINS.has(slug)
      ? { tenant: slug, isAdmin: false } : { tenant: null, isAdmin: false };
  }
  // Keep existing tenant and tenant-admin hosts on the app apex during cutover.
  if (hostWithoutPort.endsWith(`.${appRoot}`)) {
    return parseSuffix(`.${appRoot}`, true);
  }

  // Local dev: tenant.localhost (e.g., gldf.localhost:3000) — no reserved filter.
  if (hostWithoutPort.endsWith(".localhost")) {
    return parseSuffix(".localhost", false);
  }

  // *.vercel.app preview hosts are never tenants.
  return { tenant: null, isAdmin: false };
}
