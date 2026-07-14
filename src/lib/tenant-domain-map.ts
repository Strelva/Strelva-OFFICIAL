import { normalizeTenantDomain } from "./tenant-urls";
import type { TenantConfig } from "./types";

export type TenantDomainTarget = { tenantId: string; isAdmin: boolean };

/** Build routing only from trusted explicit domains and verified claims. The
 * customDomains array is inventory, not proof of ownership. */
export function buildTenantDomainMap(tenants: TenantConfig[]): Record<string, TenantDomainTarget> {
  const map: Record<string, TenantDomainTarget> = {};
  for (const tenant of tenants) {
    if (tenant.active === false) continue;

    const configuredPrimary = normalizeTenantDomain(tenant.productionDomain)
      || normalizeTenantDomain(tenant.siteUrl);
    const primaryDomain = configuredPrimary &&
      !configuredPrimary.endsWith(".vercel.app") &&
      !configuredPrimary.endsWith(".strelva.com")
        ? configuredPrimary.replace(/^www\./, "")
        : null;
    if (primaryDomain) {
      map[primaryDomain] = { tenantId: tenant.id, isAdmin: false };
      map[`www.${primaryDomain}`] = { tenantId: tenant.id, isAdmin: false };
    }

    const adminDomain = normalizeTenantDomain(tenant.adminDomain)
      || (primaryDomain ? `admin.${primaryDomain}` : null);
    if (adminDomain) map[adminDomain] = { tenantId: tenant.id, isAdmin: true };

    for (const claim of tenant.domainClaims ?? []) {
      if (claim.status !== "verified") continue;
      const domain = normalizeTenantDomain(claim.domain);
      if (!domain) continue;
      const isAdmin = claim.role === "admin" || domain.startsWith("admin.");
      map[domain] = { tenantId: tenant.id, isAdmin };
      if (!domain.startsWith("www.") && !isAdmin) {
        map[`www.${domain}`] = { tenantId: tenant.id, isAdmin: false };
      }
    }
  }
  return map;
}
