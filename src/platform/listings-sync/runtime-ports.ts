/**
 * What Listings in sync needs from the tenant model (src/lib), supplied at the
 * app edge (src/register-workspace-ports.ts) so the product imports no src/lib
 * module. Registration must not evaluate product code, so the slot lives here
 * with no imports, like src/platform/bookings/runtime-ports.ts.
 */
export interface ListingsTenant {
  id: string;
  deliveryModel?: string;
  customRepo?: unknown;
  /** The tenant's public address as the platform serves it. */
  publicUrl: string;
}

export interface ListingsTenantPorts {
  tenant(tenantId: string): Promise<ListingsTenant | null>;
  /** The tenant's Yelp key and business id. Read only when Yelp is on. */
  yelpConnection(tenantId: string): Promise<{ accessToken?: string; apiKey?: string } | null>;
}

const SLOT = Symbol.for("strelva.listings-sync-tenant-ports");
type Slot = typeof globalThis & { [SLOT]?: () => Promise<ListingsTenantPorts> };

export function registerListingsTenantPorts(load: () => Promise<ListingsTenantPorts>): void {
  (globalThis as Slot)[SLOT] = load;
}

export async function listingsTenantPorts(): Promise<ListingsTenantPorts> {
  const load = (globalThis as Slot)[SLOT];
  if (!load) throw new Error("Listings in sync tenant ports are not registered at the app edge.");
  return load();
}
