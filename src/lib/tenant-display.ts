import type { TenantConfig } from "./types";
import { DEFAULT_TENANT } from "./storage/core";

const FALLBACK_TENANT_NAMES: Record<string, string> = {
  gldf: "Great Lakes Dried Fruit",
  rohlax: "Rohlax Wellness",
  summit: "Summit Heating & Cooling",
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
  if (tenant === DEFAULT_TENANT) return "Strelva";
  if (FALLBACK_TENANT_NAMES[tenant]) return FALLBACK_TENANT_NAMES[tenant];
  // A tenant whose site_name was never set still has a real owner/business name
  // — use it before falling back to a title-cased id, so the dashboard shows the
  // actual business instead of a generic "Your Business" placeholder.
  if (config?.ownerName) return config.ownerName;

  return titleCaseTenantId(tenant) || "Strelva";
}
