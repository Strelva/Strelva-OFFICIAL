import type { TenantConfig } from "./types";
import { DEFAULT_TENANT } from "./storage/core";

const FALLBACK_TENANT_NAMES: Record<string, string> = {
  gldf: "Great Lakes Dried Fruit",
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
  if (FALLBACK_TENANT_NAMES[tenant]) return FALLBACK_TENANT_NAMES[tenant];

  return titleCaseTenantId(tenant) || "Scaffold Web";
}
