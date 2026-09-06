/**
 * Server operations for the existing managed-presence product.
 *
 * Managed websites predate account-owned workspace work. During the migration
 * they remain tenant entities: this module only projects authorized tenant
 * records into a small workspace link DTO. It does not create saved work,
 * copy tenant data into workspace storage, or broaden operator access.
 */

import { getCurrentUserTenants } from "@/lib/auth";
import { getTenantDashboardFallbackUrl } from "@/lib/tenant-urls";
import { isActiveTenant, getTenantConfig } from "@/lib/tenants";
import { resolveLegacyManagedPresence } from "./legacy";

/** Browser-safe shape mirrored by the shared workspace response contract. */
export interface ManagedPresenceWork {
  id: string;
  title: string;
  href: string;
  productId: "managed_presence";
  relationship: "client" | "enterprise";
}

export interface ManagedPresenceWorkListing {
  managedWork: ManagedPresenceWork[];
  /** True when one or more authoritative tenant reads failed. */
  unavailable: boolean;
}

function managedWorkForTenant(tenant: Awaited<ReturnType<typeof getTenantConfig>>): ManagedPresenceWork | null {
  if (!tenant || !isActiveTenant(tenant)) return null;

  const relationship = resolveLegacyManagedPresence(tenant).serviceRelationship;
  if (relationship === "none") return null;

  return {
    // Keep the tenant id as the source entity id. This is a link to the
    // existing managed client, not a cloned saved_product_work row.
    id: tenant.id,
    title: tenant.siteName?.trim() || tenant.ownerName?.trim() || tenant.id,
    // The fallback helper is the authority for cross-host dashboard links. It
    // never trusts a URL supplied by the browser or an operator list.
    href: getTenantDashboardFallbackUrl(tenant),
    productId: "managed_presence",
    relationship: relationship === "enterprise" ? "enterprise" : "client",
  };
}

/**
 * List existing managed websites for the currently authenticated user.
 *
 * `getCurrentUserTenants` is intentionally the only source of tenant ids.
 * Super-admin/global tenant enumeration is not used here: operator access is
 * a different surface and must not leak into a person's shared work home.
 * Missing/stale tenant configs are ignored; read failures are disclosed as a
 * bounded `unavailable` state while successfully resolved entries survive.
 */
export async function listManagedPresenceWork(): Promise<ManagedPresenceWorkListing> {
  let tenantIds: string[];
  try {
    tenantIds = await getCurrentUserTenants();
  } catch {
    return { managedWork: [], unavailable: true };
  }
  if (!Array.isArray(tenantIds)) return { managedWork: [], unavailable: true };

  // Tenant ids are routing slugs and normally lowercase, but membership data
  // is an external store boundary. Deduplicate case-insensitively so a stale
  // duplicate cannot make one authorized site appear twice.
  const seenTenantIds = new Set<string>();
  const uniqueTenantIds: string[] = [];
  for (const value of tenantIds) {
    if (typeof value !== "string") continue;
    const tenantId = value.trim();
    const key = tenantId.toLowerCase();
    if (!key || seenTenantIds.has(key)) continue;
    seenTenantIds.add(key);
    uniqueTenantIds.push(tenantId);
  }
  const resolved = await Promise.all(uniqueTenantIds.map(async (tenantId) => {
    try {
      const tenant = await getTenantConfig(tenantId);
      // A config resolver should honor its id argument. Treat a mismatched
      // result as unavailable rather than ever projecting another tenant.
      const matchesRequestedId = !tenant || tenant.id.trim().toLowerCase() === tenantId.toLowerCase();
      return { tenant: matchesRequestedId ? tenant : undefined, unavailable: !matchesRequestedId };
    } catch {
      return { tenant: undefined, unavailable: true };
    }
  }));

  const projected = resolved.map((entry) => {
    try {
      return { work: managedWorkForTenant(entry.tenant), unavailable: entry.unavailable };
    } catch {
      // A malformed/stale config must not discard links for other authorized
      // tenants. Keep the failure bounded to managed discovery.
      return { work: null, unavailable: true };
    }
  });
  const managedWork = projected
    .map(({ work }) => work)
    .filter((entry): entry is ManagedPresenceWork => entry !== null);

  return {
    managedWork,
    unavailable: projected.some((entry) => entry.unavailable),
  };
}

/** Descriptive alias for callers that emphasize the authorization boundary. */
export const listAuthorizedManagedWork = listManagedPresenceWork;
