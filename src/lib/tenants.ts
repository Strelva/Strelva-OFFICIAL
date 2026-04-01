import type { TenantConfig } from "./types";

/** Single source of truth for all REB tenants.
 *  Adding a client = add one object here + redeploy. */
export const TENANTS: TenantConfig[] = [
  {
    id: "rohlax",
    subdomain: "rohlax",
    siteName: "Rohlax Wellness",
    ownerName: "Chelsea",
    industry: "wellness",
    active: true,
    createdAt: "2026-01-15",
    template: "wellness",
    features: ["booking", "newsletter"],
    customDomains: [],
    subscriptionStatus: "none",
  },
  {
    id: "gldf",
    subdomain: "gldf",
    siteName: "Great Lakes Dried Fruit",
    ownerName: "Great Lakes Dried Fruit",
    industry: "food-brand",
    active: true,
    createdAt: "2026-03-30",
    template: "food-brand",
    features: ["commerce", "newsletter"],
    customDomains: ["greatlakesdriedfruit.com", "www.greatlakesdriedfruit.com", "admin.greatlakesdriedfruit.com"],
    subscriptionStatus: "none",
  },
];

/** Look up tenant config by ID. Returns undefined if not found. */
export function getTenantConfig(tenantId: string): TenantConfig | undefined {
  return TENANTS.find((t) => t.id === tenantId);
}

/** Build custom domain → tenant ID mapping from TENANTS config. */
export function getCustomDomainMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const t of TENANTS) {
    for (const domain of t.customDomains ?? []) {
      map[domain] = t.id;
    }
  }
  return map;
}
