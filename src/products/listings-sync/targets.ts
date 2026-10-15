import { readGoogleBindingForTenant } from "@/platform/account-bindings/store";
import { readBookingContext } from "@/platform/bookings/store";
import { resolveBookingScope } from "@/platform/bookings/booking-scope";
import { workspacePublishingScope } from "@/platform/infra/publishing-scope";
import { siteEditingFor } from "@/products/websites/server";
import { listingsTenantPorts, type ListingsTenant } from "./ports";
import { listingsYelpEnabled } from "./release";
import { listingsSyncStore, type RawListingTargets } from "./store";

/**
 * Which places a business appears, found from what the business already has:
 * its Strelva-hosted sites, its verified connected sites, its Google
 * locations, its booking page and (when Yelp is on) its Yelp connection.
 * Every single lookup that fails is swallowed: that place is simply not listed.
 */
export interface ListingTargets {
  websites: Array<{ surfaceKey: string; kind: "tenant" | "connected"; label: string; url: string; tenantId?: string; tenantStableId?: string; editing?: "native" | "request"; siteId?: string; platform?: string }>;
  google: Array<{ surfaceKey: string; tenantId: string; locationId: string; label: string }>;
  booking: Array<{ surfaceKey: string; scope: string; label: string }>;
  yelp: Array<{ surfaceKey: string; tenantId: string }>;
  hasAgency: boolean;
}

export interface TargetDeps {
  raw: (workspaceId: string) => Promise<RawListingTargets>;
  tenant: (tenantId: string) => Promise<ListingsTenant | null>;
  editing: (tenant: { id: string; deliveryModel?: string; customRepo?: unknown }) => "native" | "request";
  binding: (scope: string) => Promise<{ workspaceId: string; locations: Array<{ locationId: string; title: string | null }> } | null>;
  booking: (scope: string) => Promise<{ workspaceId: string | null; systemId: string | null; calendarKey?: string; tenantStableId: string | null } | null>;
  bookingScope: (workspaceId: string, tenantId?: string | null) => string;
  publishingScope: (workspaceId: string) => string;
  yelp: (tenantId: string) => Promise<{ accessToken?: string; apiKey?: string } | null>;
  yelpEnabled: () => boolean;
}

export const liveTargetDeps: TargetDeps = {
  raw: id => listingsSyncStore.targets(id),
  tenant: async id => (await listingsTenantPorts()).tenant(id),
  editing: tenant => siteEditingFor(tenant as Parameters<typeof siteEditingFor>[0]),
  binding: scope => readGoogleBindingForTenant(scope),
  booking: scope => readBookingContext(scope),
  bookingScope: resolveBookingScope,
  publishingScope: workspacePublishingScope,
  yelp: async tenantId => (await listingsTenantPorts()).yelpConnection(tenantId),
  yelpEnabled: () => listingsYelpEnabled(),
};

const CAP = { websites: 4, google: 5, booking: 3, yelp: 2 } as const;
const hostOf = (url: string): string | null => { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; } };
const swallow = async <T>(work: () => Promise<T>): Promise<T | null> => { try { return await work(); } catch { return null; } };

export async function readListingTargets(workspaceId: string, deps: TargetDeps = liveTargetDeps): Promise<ListingTargets> {
  const raw = await deps.raw(workspaceId);
  const tenantIds = raw.tenants.map(item => item.tenantId);

  const websites: ListingTargets["websites"] = [];
  const hosts = new Set<string>();
  for (const item of raw.tenants) {
    const config = await swallow(() => deps.tenant(item.tenantId));
    if (!config) continue;
    const url = config.publicUrl;
    const host = hostOf(url);
    if (!host || hosts.has(host)) continue;
    hosts.add(host);
    websites.push({ surfaceKey: `website:tenant:${item.tenantId}`, kind: "tenant", label: host, url, tenantId: item.tenantId, tenantStableId: item.tenantStableId,
      editing: await swallow(async () => deps.editing({ id: config.id, deliveryModel: item.deliveryModel, customRepo: config.customRepo })) ?? "request" });
  }
  for (const site of raw.connectedSites) {
    const host = hostOf(site.siteUrl) ?? site.siteHost;
    if (hosts.has(host)) continue;
    hosts.add(host);
    websites.push({ surfaceKey: `website:connected:${site.id}`, kind: "connected", label: site.siteHost, url: site.siteUrl, siteId: site.id, platform: site.platform });
  }

  const google: ListingTargets["google"] = [];
  const seenLocations = new Set<string>();
  for (const scope of [deps.publishingScope(workspaceId), ...tenantIds]) {
    const binding = await swallow(() => deps.binding(scope));
    if (binding?.workspaceId !== workspaceId) continue;
    for (const location of binding.locations) {
      if (seenLocations.has(location.locationId)) continue;
      seenLocations.add(location.locationId);
      google.push({ surfaceKey: `google:${location.locationId}`, tenantId: scope, locationId: location.locationId, label: location.title ?? "Google listing" });
    }
  }

  const booking: ListingTargets["booking"] = [];
  const seenCalendars = new Set<string>();
  for (const scope of [deps.bookingScope(workspaceId), ...tenantIds]) {
    const context = await swallow(() => deps.booking(scope));
    if (!context || context.workspaceId !== workspaceId || !context.systemId) continue;
    const identity = context.calendarKey ?? context.tenantStableId ?? scope;
    if (seenCalendars.has(identity)) continue;
    seenCalendars.add(identity);
    booking.push({ surfaceKey: `booking:${scope}`, scope, label: "Booking page" });
  }

  const yelp: ListingTargets["yelp"] = [];
  if (deps.yelpEnabled()) {
    for (const tenantId of tenantIds) {
      const connection = await swallow(() => deps.yelp(tenantId));
      if (connection?.accessToken && connection.apiKey) yelp.push({ surfaceKey: `yelp:${tenantId}`, tenantId });
    }
  }

  return {
    websites: websites.slice(0, CAP.websites),
    google: google.slice(0, CAP.google),
    booking: booking.slice(0, CAP.booking),
    yelp: yelp.slice(0, CAP.yelp),
    hasAgency: raw.agencies.length > 0,
  };
}
