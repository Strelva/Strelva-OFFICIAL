import { systemsFromExisting, type ExistingSystemsSnapshot, type SystemListing } from "@/platform/systems/from-existing";
import type { SystemKind } from "@/platform/systems/contracts";

/**
 * Resolution: session user → workspace membership → System → link → tenant
 * (spec section 4). Membership is checked by the reader that produced the
 * snapshot (`read_existing_business_systems` rechecks the actor). This module
 * is the pure part: given what the business holds, which System and which
 * tenant does this turn act on?
 *
 * Rules:
 *  - `tenant_workspace_links` is the canonical link; an active
 *    `offering_website_bindings` row counts only for a tenant with no link.
 *    The SQL reader already applies that, and marks which one it used.
 *  - A link resolves by `tenant_stable_id`, never by slug. The tenant slug
 *    comes from `tenants` by stable id, so a renamed tenant keeps working.
 *  - A System id from another business is indistinguishable from a missing one.
 *  - Two linked sites and no System named: ask which site.
 */

export interface ResolvedSite {
  systemId: string;
  name: string;
  tenantId: string;
  tenantStableId: string;
  link: "tenant_link" | "website_binding";
  tenantActive: boolean;
}

export type AskResolution =
  | { kind: "site"; site: ResolvedSite }
  | { kind: "system"; systemId: string; systemKind: SystemKind; name: string }
  | { kind: "business"; sites: ResolvedSite[] }
  | { kind: "choose_site"; sites: ResolvedSite[] }
  | { kind: "site_not_connected"; systemId: string; name: string }
  | { kind: "system_not_found" };

type Snapshot = ExistingSystemsSnapshot;

function linkedSites(snapshot: Snapshot, listings: SystemListing[]): ResolvedSite[] {
  const sites: ResolvedSite[] = [];
  for (const website of snapshot.managedWebsites) {
    const listing = listings.find((item) => item.system.kind === "website" && item.references.tenantStableId === website.tenantStableId);
    if (!listing) continue;
    sites.push({
      systemId: listing.system.id,
      name: listing.system.name,
      tenantId: website.tenantId,
      tenantStableId: website.tenantStableId,
      link: website.link,
      tenantActive: website.tenantActive,
    });
  }
  return sites;
}

function named(sites: ResolvedSite[], text: string): ResolvedSite | null {
  const lower = text.toLowerCase();
  const hits = sites.filter((site) => {
    const name = site.name.trim().toLowerCase();
    return (name.length >= 3 && lower.includes(name)) || lower.includes(site.tenantId.toLowerCase());
  });
  return hits.length === 1 ? hits[0]! : null;
}

export function resolveAskTarget(snapshot: Snapshot, input: { systemId?: string | null; text?: string; listings?: readonly SystemListing[] }): AskResolution {
  const listings = (input.listings ?? systemsFromExisting(snapshot).systems).filter(row => row.system.businessId === snapshot.businessId);
  const sites = linkedSites(snapshot, listings);
  if (input.systemId) {
    const listing = listings.find((item) => item.system.id === input.systemId);
    if (!listing) return { kind: "system_not_found" };
    if (listing.system.kind === "website") {
      const site = sites.find((item) => item.systemId === listing.system.id);
      return site ? { kind: "site", site } : { kind: "site_not_connected", systemId: listing.system.id, name: listing.system.name };
    }
    return { kind: "system", systemId: listing.system.id, systemKind: listing.system.kind, name: listing.system.name };
  }
  if (sites.length === 1) return { kind: "site", site: sites[0]! };
  if (sites.length > 1) {
    const match = input.text ? named(sites, input.text) : null;
    return match ? { kind: "site", site: match } : { kind: "choose_site", sites };
  }
  return { kind: "business", sites: [] };
}

/** True when Strelva runs a site for this business (an active link or binding). */
export function isManagedBusiness(snapshot: Snapshot): boolean {
  return snapshot.managedWebsites.length > 0;
}
