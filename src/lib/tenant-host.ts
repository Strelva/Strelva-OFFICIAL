import { isMarketingHost } from "./marketing-hosts";

/**
 * Reserved control-plane subdomains under strelva.com that are NOT tenants.
 * `app`/`api` matter for the scaffoldweb.com -> app.strelva.com cutover: without
 * this, app.strelva.com would resolve to a phantom tenant "app". `www`/`admin`
 * are control-plane too.
 */
export const RESERVED_SUBDOMAINS = new Set(["www", "admin", "app", "api"]);

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
export function parseTenantHost(host: string): { tenant: string | null; isAdmin: boolean } {
  const hostWithoutPort = host.toLowerCase().split(":")[0];

  if (isMarketingHost(host)) {
    return { tenant: null, isAdmin: false };
  }

  const parseSuffix = (
    suffix: string,
    applyReserved: boolean,
  ): { tenant: string | null; isAdmin: boolean } => {
    const subdomain = hostWithoutPort.replace(suffix, "");
    if (subdomain.startsWith("admin.")) {
      const tenant = subdomain.replace(/^admin\./, "");
      return tenant ? { tenant, isAdmin: true } : { tenant: null, isAdmin: false };
    }
    if (subdomain && (!applyReserved || !RESERVED_SUBDOMAINS.has(subdomain))) {
      return { tenant: subdomain, isAdmin: false };
    }
    return { tenant: null, isAdmin: false };
  };

  // Production: tenant.strelva.com (reserved subdomains excluded).
  if (hostWithoutPort.endsWith(".strelva.com")) {
    return parseSuffix(".strelva.com", true);
  }

  // Local dev: tenant.localhost (e.g., gldf.localhost:3000) — no reserved filter.
  if (hostWithoutPort.endsWith(".localhost")) {
    return parseSuffix(".localhost", false);
  }

  // *.vercel.app preview hosts are never tenants.
  return { tenant: null, isAdmin: false };
}
