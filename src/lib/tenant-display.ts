import type { TenantConfig } from "./types";
import { DEFAULT_TENANT } from "./storage/core";

const TENANT_SITE_NAME_FALLBACKS: Record<string, string> = {
  gldf: "Great Lakes Dried Fruit",
  rohlax: "Rohlax Wellness",
};

function titleCaseTenantId(tenant: string): string {
  return tenant
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getTenantSiteName(tenant: string, config: TenantConfig | undefined): string {
  if (config?.siteName) return config.siteName;
  if (tenant === DEFAULT_TENANT) return "Scaffold Web";

  return TENANT_SITE_NAME_FALLBACKS[tenant] || titleCaseTenantId(tenant) || "Scaffold Web";
}
