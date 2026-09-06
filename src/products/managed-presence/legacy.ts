import type { TenantConfig } from "@/lib/types";
import type { ServiceRelationship } from "@/platform/relationships";

export type LegacyManagedPresenceSource = "legacy_tenant" | "demo" | "unresolved";

export interface LegacyManagedPresenceResolution {
  tenantId: string | null;
  serviceRelationship: ServiceRelationship;
  source: LegacyManagedPresenceSource;
}

/**
 * Resolve the compatibility service relationship for an existing tenant.
 *
 * `demo` is a public, read-only showcase and is always excluded. A resolved
 * `TenantConfig` is the legacy managed-presence product's service boundary,
 * so every non-demo config is carried forward as Client, regardless of its
 * billing arrangement. This adapter is intentionally the only place that
 * treats a tenant config as evidence of a service relationship; the platform
 * resolver and future personal accounts do not.
 */
export function resolveLegacyManagedPresence(
  tenant: Pick<TenantConfig, "id"> | null | undefined,
): LegacyManagedPresenceResolution {
  const tenantId = tenant?.id?.trim().toLowerCase() || null;
  if (!tenantId) {
    return { tenantId: null, serviceRelationship: "none", source: "unresolved" };
  }

  if (tenantId === "demo") {
    return { tenantId, serviceRelationship: "none", source: "demo" };
  }

  return { tenantId, serviceRelationship: "managed_client", source: "legacy_tenant" };
}
