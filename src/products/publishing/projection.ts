import { z } from "zod";
import { uuidFromSeed } from "@/platform/business-record/tenant-import";
import { accountBindingSchema } from "@/platform/account-bindings/contracts";
import { defaultPropagation, systemOriginId } from "@/platform/systems/invariants";
import type { ConnectionKind, ConnectionState, ConnectionTarget, System, SystemConnection, SystemOrigin } from "@/platform/systems/contracts";
import type { BusinessSystems, SystemListing } from "@/platform/systems/from-existing";
import type { Observation } from "@/platform/system-health/contracts";
import { listingHealth, listingObservation } from "@/products/google-listing/health";
import type { ListingHealth, ListingReceipt } from "@/products/google-listing/contracts";

/**
 * Publishing in the Systems model (spec section 2, recommendation 1a):
 *  - the Google listing is its own System ("The Mooney Firm on Google"), one
 *    per Google location, adopted from the business-level binding;
 *  - the newsletter is its own System, only for a site with subscribers;
 *  - blog and collections are part of the website System, listed as its parts.
 *
 * Read-only, deterministic and additive: it adds Systems and Connections to
 * an existing BusinessSystems listing and never changes one already there.
 * A website with no Google grant gets a "Connect Google" offer, not an empty
 * listing System.
 */

const GSC_READ_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const GA4_READ_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

const receiptSummarySchema = z.object({
  id: z.string(), bindingId: z.string().nullable(), locationId: z.string(), action: z.string(), status: z.string(),
  error: z.string().nullable(), createdAt: z.string(), targetRef: z.string().nullable(),
}).passthrough();

export const publishingSnapshotSchema = z.object({
  businessId: z.string().uuid(),
  scope: z.enum(["business", "assigned"]),
  bindings: z.array(accountBindingSchema),
  receipts: z.array(receiptSummarySchema),
});
export type PublishingSnapshot = z.infer<typeof publishingSnapshotSchema>;

export interface SiteAudience {
  tenantId: string;
  activeSubscribers: number;
}

export interface SiteCollections {
  tenantId: string;
  types: Array<{ type: string; published: number; drafts: number }>;
}

export interface PublishingExtras {
  newsletters?: readonly SiteAudience[];
  collections?: readonly SiteCollections[];
  now?: number;
}

export interface WebsitePart {
  kind: "collection";
  type: string;
  label: string;
  published: number;
  drafts: number;
}

export interface PublishingOffer {
  kind: "connect_google";
  systemId: string;
  label: string;
}

export interface ListingSummary {
  systemId: string;
  bindingId: string;
  locationId: string;
  health: ListingHealth;
  healthMessage: string;
  recentReceipts: Array<Pick<ListingReceipt, "id" | "action" | "status" | "createdAt" | "targetRef">>;
}

export interface PublishingProjection {
  listing: BusinessSystems;
  observations: Observation[];
  websiteParts: Record<string, WebsitePart[]>;
  offers: PublishingOffer[];
  listings: ListingSummary[];
}

const COLLECTION_LABELS: Record<string, string> = { blog: "Blog", videos: "Videos", products: "Product catalog", events: "Events" };

function system(businessId: string, origin: SystemOrigin, fields: Pick<System, "name" | "kind" | "lifecycle" | "createdAt" | "updatedAt">): System {
  return {
    id: systemOriginId(businessId, origin), businessId, name: fields.name.trim().slice(0, 160) || "Untitled", purpose: null,
    kind: fields.kind, lifecycle: fields.lifecycle, currentRevision: null, origin, changeNumber: 1,
    createdAt: fields.createdAt, updatedAt: fields.updatedAt,
  };
}

function connection(source: System, kind: ConnectionKind, target: ConnectionTarget, state: ConnectionState, purpose: string): SystemConnection {
  return {
    id: uuidFromSeed(`system-connection:${source.businessId}:${source.id}:${kind}:${JSON.stringify(target)}`),
    businessId: source.businessId, source: { businessId: source.businessId, systemId: source.id }, kind, target, state,
    propagation: defaultPropagation(kind), contractVersion: 1, purpose, createdAt: source.createdAt, updatedAt: source.updatedAt,
  };
}

const bindingState = (status: string): ConnectionState =>
  status === "connected" ? "connected" : status === "error" ? "stale" : "disconnected";

const RECORD_SLICES: Array<[string, string]> = [
  ["business_record:hours", "Hours from your business record"],
  ["business_record:phone", "Phone from your business record"],
  ["business_record:links", "Website link from your business record"],
  ["business_record:description", "Description from your business record"],
];

export function addPublishingSystems(base: BusinessSystems, rawSnapshot: PublishingSnapshot, extras: PublishingExtras = {}): PublishingProjection {
  const snapshot = publishingSnapshotSchema.parse(rawSnapshot);
  const now = extras.now ?? Date.now();
  const { businessId } = base;
  const systems: SystemListing[] = [...base.systems];
  const connections = [...base.connections];
  const observations: Observation[] = [];
  const websiteParts: Record<string, WebsitePart[]> = {};
  const offers: PublishingOffer[] = [];
  const listings: ListingSummary[] = [];
  const seen = new Set(systems.map((item) => item.system.id));
  const websitesByTenant = new Map(base.systems
    .filter((item) => item.system.kind === "website" && item.references.tenantStableId)
    .map((item) => [item.references.tenantStableId!, item]));
  const websitesByTenantId = new Map(base.systems
    .filter((item) => item.system.kind === "website" && item.references.tenantId)
    .map((item) => [item.references.tenantId!, item]));

  // An agency (assigned scope) sees no business-level publishing.
  const bindings = snapshot.scope === "business" ? snapshot.bindings : [];
  const boundTenants = new Set<string>();

  for (const binding of bindings) {
    const website = binding.originTenantStableId ? websitesByTenant.get(binding.originTenantStableId) : undefined;
    if (binding.originTenantStableId) boundTenants.add(binding.originTenantStableId);
    const target: ConnectionTarget = { type: "account_binding", bindingId: `google:${binding.id}` };
    // The website reads Search Console and Analytics through the same grant.
    if (website && (binding.scopes === null || binding.scopes.includes(GSC_READ_SCOPE) || binding.scopes.includes(GA4_READ_SCOPE))) {
      connections.push({ provenance: "existing", connection: connection(website.system, "read", target, bindingState(binding.status), "Search Console and Analytics from Google") });
    }
    const location = binding.locations.find((item) => item.isPrimary) ?? binding.locations[0];
    if (!location) continue;
    const listingSystem = system(businessId, { kind: "google_location", ref: `${binding.id}:${location.locationId}` }, {
      name: location.title ?? (website ? `${website.system.name} on Google` : "Google listing"),
      kind: "listing", lifecycle: "live", createdAt: binding.createdAt, updatedAt: binding.updatedAt,
    });
    if (seen.has(listingSystem.id)) continue;
    seen.add(listingSystem.id);
    const receipts = snapshot.receipts.filter((receipt) => receipt.bindingId === binding.id && receipt.locationId === location.locationId);
    const healthInput = { binding, receipts: receipts as unknown as ListingReceipt[], now };
    const verdict = listingHealth(healthInput);
    systems.push({
      system: listingSystem, provenance: "existing",
      basis: "Connected to Google. Replies, hours and posts go through approval.",
      references: { savedWorkId: null, tenantStableId: binding.originTenantStableId, tenantId: binding.originTenantId },
    });
    connections.push({ provenance: "existing", connection: connection(listingSystem, "act", target, bindingState(binding.status), "Replies, hours, info and posts on Google") });
    for (const [resource, purpose] of RECORD_SLICES) {
      connections.push({ provenance: "existing", connection: connection(listingSystem, "read", { type: "business_resource", resource }, "connected", purpose) });
    }
    observations.push(listingObservation(listingSystem.id, healthInput));
    listings.push({
      systemId: listingSystem.id, bindingId: binding.id, locationId: location.locationId, health: verdict.health, healthMessage: verdict.message,
      recentReceipts: receipts.slice(0, 10).map((receipt) => ({
        id: receipt.id, action: receipt.action as ListingReceipt["action"], status: receipt.status as ListingReceipt["status"],
        createdAt: receipt.createdAt, targetRef: receipt.targetRef,
      })),
    });
  }

  for (const [stableId, website] of websitesByTenant) {
    if (snapshot.scope === "business" && !boundTenants.has(stableId)) {
      offers.push({ kind: "connect_google", systemId: website.system.id, label: `Connect Google to manage ${website.system.name} on Google` });
    }
  }

  for (const audience of extras.newsletters ?? []) {
    const website = websitesByTenantId.get(audience.tenantId);
    if (!website || audience.activeSubscribers <= 0 || !website.references.tenantStableId) continue;
    const newsletter = system(businessId, { kind: "tenant_newsletter", ref: website.references.tenantStableId }, {
      name: `${website.system.name} newsletter`, kind: "newsletter", lifecycle: "live",
      createdAt: website.system.createdAt, updatedAt: website.system.updatedAt,
    });
    if (seen.has(newsletter.id)) continue;
    seen.add(newsletter.id);
    systems.push({
      system: newsletter, provenance: "existing",
      basis: `${audience.activeSubscribers} active subscriber${audience.activeSubscribers === 1 ? "" : "s"}. Each issue is approved before it sends.`,
      references: { savedWorkId: null, tenantStableId: website.references.tenantStableId, tenantId: audience.tenantId },
    });
    connections.push({ provenance: "existing", connection: connection(newsletter, "appear", { type: "audience", audience: "subscribers" }, "connected", "Sent to active subscribers") });
    connections.push({ provenance: "existing", connection: connection(newsletter, "read", { type: "system", system: { businessId, systemId: website.system.id } }, "connected", "New posts from the website") });
  }

  for (const site of extras.collections ?? []) {
    const website = websitesByTenantId.get(site.tenantId);
    if (!website) continue;
    const parts = site.types.filter((type) => type.published + type.drafts > 0).map((type) => ({
      kind: "collection" as const, type: type.type, label: COLLECTION_LABELS[type.type] ?? type.type.replace(/[-_]/g, " "),
      published: type.published, drafts: type.drafts,
    }));
    if (parts.length) websiteParts[website.system.id] = parts;
  }

  return { listing: { businessId, systems, connections }, observations, websiteParts, offers, listings };
}
