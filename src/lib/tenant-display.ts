import type { TenantConfig } from "./types";
import { DEFAULT_TENANT } from "./storage/core";

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

  return titleCaseTenantId(tenant) || "Scaffold Web";
}
