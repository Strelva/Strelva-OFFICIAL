import { z } from "zod";
import { uuidFromSeed } from "@/platform/business-record/tenant-import";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type {
  ConnectionKind,
  ConnectionState,
  ConnectionTarget,
  System,
  SystemConnection,
  SystemGraph,
  SystemKind,
  SystemLifecycle,
  SystemOrigin,
  SystemProvenance,
} from "./contracts";
import { INQUIRY_CAPABILITY_STATUSES, defaultPropagation, inquiryCapabilityLifecycle, systemOriginId } from "./invariants";
import { callSystems, type SystemsDb } from "./supabase-store";
import type { SystemStore } from "./store";

/**
 * Read-only map from what a business already has onto Systems, so a business
 * sees its real Systems before anything is stored in `systems`.
 *
 * Identity is never minted in parallel. A System adopted from an existing
 * thing has id = systemOriginId(businessId, origin), where origin points at
 * the identity that existed FIRST: saved_product_work.id for anything made in
 * the workspace, tenants.stable_id for a managed website, and
 * inquiry_workspaces.id for a managed tenant's inquiry handling. Storing the
 * System later (createSystem with the same origin) keeps the same id.
 *
 * A native website's work row and the tenant it publishes to are ONE System,
 * and its id never changes as a site converts. A managed site keeps its
 * tenant-derived id when a native rebuild publishes to it (bound, linked,
 * linked + rebuild, rebuild only). A native-first site keeps its work-derived
 * id after it reserves its own hosted tenant (hostedTenantReserved).
 * tenant_workspace_links is the canonical workspace-to-tenant link; an active
 * offering_website_bindings row is read only for a tenant with no link.
 * Inquiry workspaces are listed only for tenants this business holds.
 *
 * Scope. A direct member reads the whole business (`scope: "business"`). An
 * agency reads only the exact work it was delegated or assigned
 * (`scope: "assigned"`): the SQL reader returns that work, the website
 * tenants it stands for and its booking grants, and nothing that belongs to
 * the business as a whole (inquiry handling, calendar connections, other
 * sites). The projection applies the same rule again, so it never derives a
 * System or Connection from anything outside that work.
 *
 * Not mapped, on purpose: plans, investigations, responsibilities, learning
 * items and onboarding cases are work or records inside a System, not
 * Systems themselves (RULE_SYSTEM_OUTPUT_IDENTITY boundary). Private
 * documents are supporting files under the business ("All apps and files"),
 * not Systems, at 1.0.0 (docs/product/specs/systems-catalog.md 3.5). A saved
 * check is evidence in the health of the System it watches (3.6). Retired
 * applications are omitted.
 */

const iso = z.string().min(1);
const nullableText = z.string().nullable().optional().transform((value) => value ?? null);
const nullableInt = z.number().int().nullable().optional().transform((value) => value ?? null);

export const existingSavedWorkSchema = z.object({
  id: z.string().uuid(),
  productId: z.string(),
  resourceKind: z.string(),
  title: nullableText,
  createdAt: iso,
  updatedAt: iso,
  applicationStatus: nullableText,
  applicationRelease: nullableInt,
  customApplicationStatus: nullableText,
  customApplicationRelease: nullableInt,
  websiteHeadRevision: nullableInt,
  websiteApprovedRevision: nullableInt,
  websitePublishedRevision: nullableInt,
  websitePublishedHash: nullableText,
  /** A rebuilt connected site keeps the website identity it had first. */
  connectedSiteId: nullableText,
  hostedTenantStableId: nullableText,
  hostedTenantId: nullableText,
  /** True when this work row created its own hosted tenant (native first).
   * False or absent: the tenant existed first and keeps the identity. */
  hostedTenantReserved: z.boolean().nullable().optional().transform((value) => value ?? false),
  /** The schedule's own `pause` field. A stored booking System and its
   * schedule share one pause (SQL keeps them in one transaction); the
   * projection reads the same field so it cannot disagree either. */
  schedulePaused: z.boolean().nullable().optional().transform((value) => value ?? false),
});

export const existingManagedWebsiteSchema = z.object({
  link: z.enum(["tenant_link", "website_binding"]),
  tenantStableId: z.string().uuid(),
  tenantId: z.string(),
  siteName: z.string(),
  tenantActive: z.boolean(),
  linkedAt: iso,
});

/** A website the business runs elsewhere and connected by script (connected_sites). */
export const existingConnectedSiteSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  siteUrl: z.string(),
  siteHost: z.string(),
  status: z.enum(["active", "revoked"]),
  verifiedAt: z.string().nullable(),
  lastEventAt: z.string().nullable(),
  createdAt: iso,
  updatedAt: iso,
});
export type ExistingConnectedSite = z.input<typeof existingConnectedSiteSchema>;

export const existingSystemsSnapshotSchema = z.object({
  businessId: z.string().uuid(),
  /** What the reader may see: the whole business, or only assigned work.
   * read_existing_business_systems always sends it; fixtures may omit it. */
  scope: z.enum(["business", "assigned"]).optional().transform((value) => value ?? "business"),
  savedWork: z.array(existingSavedWorkSchema),
  managedWebsites: z.array(existingManagedWebsiteSchema),
  inquiryWorkspaces: z.array(z.object({
    id: z.string().uuid(), tenantStableId: z.string().uuid(), businessId: z.string(), createdAt: iso, updatedAt: iso,
    /** The inquiry capability's status, when the reader supplies it. The SQL
     * snapshot does not yet; without it a serving site means Live. */
    capabilityStatus: z.enum(INQUIRY_CAPABILITY_STATUSES).nullable().optional().transform((value) => value ?? null),
  })),
  bookingGrants: z.array(z.object({
    id: z.string().uuid(), tenantStableId: z.string().uuid(), workId: z.string().uuid(),
    displayName: z.string(), provider: z.string(), status: z.enum(["published", "revoked"]),
  })),
  calendarConnections: z.array(z.object({
    id: z.string().uuid(), provider: z.string(), calendarName: z.string(),
    status: z.enum(["authorized", "connected", "revoked", "error"]),
  })),
  /** Read separately (list_connected_sites) while STRELVA_CONNECTED_SITES_RELEASE is on. */
  connectedSites: z.array(existingConnectedSiteSchema).optional().transform((value) => value ?? []),
});
export type ExistingSystemsSnapshot = z.input<typeof existingSystemsSnapshotSchema>;
type Snapshot = z.output<typeof existingSystemsSnapshotSchema>;
type SavedWork = Snapshot["savedWork"][number];

/** An assigned (agency) snapshot keeps only what its own work stands for:
 * the sites that work hosts and the booking grants of that work. Inquiry
 * handling and calendar connections belong to the business, so they go. */
function withinScope(snapshot: Snapshot): Snapshot {
  if (snapshot.scope === "business") return snapshot;
  const workIds = new Set(snapshot.savedWork.map((work) => work.id));
  const hosted = new Set(snapshot.savedWork.flatMap((work) => work.hostedTenantStableId ? [work.hostedTenantStableId] : []));
  return {
    ...snapshot,
    managedWebsites: snapshot.managedWebsites.filter((site) => hosted.has(site.tenantStableId)),
    inquiryWorkspaces: [],
    bookingGrants: snapshot.bookingGrants.filter((grant) => workIds.has(grant.workId)),
    calendarConnections: [],
    connectedSites: [],
  };
}

/** A System as a business sees it, with where it came from and, for an
 * existing thing, the plain reason for its lifecycle. */
export interface SystemListing {
  system: System;
  provenance: SystemProvenance;
  /** Why the lifecycle reads as it does, for an existing thing. */
  basis: string | null;
  /** Native ids this System stands for (work id, tenant id, connected site). */
  references: { savedWorkId: string | null; tenantStableId: string | null; tenantId: string | null; connectedSiteId?: string | null; inquiryBusinessId?: string };
  /** A connected site's address and reporting, for its surface and health. */
  connectedSite?: { siteUrl: string; siteHost: string; verified: boolean; lastEventAt: string | null };
}

export interface ConnectionListing {
  connection: SystemConnection;
  provenance: SystemProvenance;
}

export interface BusinessSystems {
  businessId: string;
  systems: SystemListing[];
  connections: ConnectionListing[];
}

const SAVED_WORK_KINDS: Record<string, { kind: SystemKind; fallbackName: string }> = {
  "websites/website": { kind: "website", fallbackName: "Website" },
  "applications/application": { kind: "internal_app", fallbackName: "App" },
  "custom-applications/custom-application": { kind: "internal_app", fallbackName: "Custom app" },
  "scheduling/schedule": { kind: "booking", fallbackName: "Bookings" },
  "inquiry/inquiry_capability": { kind: "inquiry", fallbackName: "Inquiries" },
  // A tracker is an internal tool that started from a list or CSV: the same
  // System kind as an application, with its own engine and data kept.
  "tracker/tracker": { kind: "internal_app", fallbackName: "Internal tool" },
};

function savedWorkLifecycle(work: SavedWork, snapshot: Snapshot): { lifecycle: SystemLifecycle; basis: string } | null {
  switch (`${work.productId}/${work.resourceKind}`) {
    case "websites/website":
      return work.websitePublishedRevision !== null
        ? { lifecycle: "live", basis: `Revision ${work.websitePublishedRevision} is published.` }
        : { lifecycle: "draft", basis: "Not published yet." };
    case "applications/application":
      if (work.applicationStatus === "retired") return null;
      return work.applicationStatus === "installed"
        ? { lifecycle: "live", basis: `Release ${work.applicationRelease ?? "?"} is installed.` }
        : { lifecycle: "draft", basis: "Not installed yet." };
    case "custom-applications/custom-application":
      if (work.customApplicationStatus === "retired") return null;
      return work.customApplicationStatus === "released"
        ? { lifecycle: "live", basis: `Release ${work.customApplicationRelease ?? "?"} is out.` }
        : { lifecycle: "draft", basis: "Not released yet." };
    case "scheduling/schedule": {
      const grants = snapshot.bookingGrants.filter((grant) => grant.workId === work.id);
      if (work.schedulePaused && grants.length > 0) return { lifecycle: "paused", basis: "Bookings are paused on the schedule." };
      if (grants.some((grant) => grant.status === "published")) return { lifecycle: "live", basis: "Booking is published on a website." };
      if (grants.length > 0) return { lifecycle: "paused", basis: "Public booking was revoked." };
      return { lifecycle: "draft", basis: "Not published for booking yet." };
    }
    case "tracker/tracker":
      return { lifecycle: "live", basis: "In use in the workspace." };
    default:
      return { lifecycle: "draft", basis: "Saved in the workspace." };
  }
}

function existingSystem(
  businessId: string, origin: SystemOrigin, fields: { name: string; kind: SystemKind; lifecycle: SystemLifecycle; createdAt: string; updatedAt: string },
): System {
  return {
    id: systemOriginId(businessId, origin), businessId, name: fields.name.trim().slice(0, 160) || "Untitled",
    purpose: null, kind: fields.kind, lifecycle: fields.lifecycle, currentRevision: null, origin,
    changeNumber: 1, createdAt: fields.createdAt, updatedAt: fields.updatedAt,
  };
}

function existingConnection(
  source: System, kind: ConnectionKind, target: ConnectionTarget, state: ConnectionState, purpose: string,
): SystemConnection {
  const targetKey = target.type === "system" ? `system:${target.system.systemId}` : `${target.type}:${JSON.stringify(target)}`;
  return {
    id: uuidFromSeed(`system-connection:${source.businessId}:${source.id}:${kind}:${targetKey}`),
    businessId: source.businessId, source: { businessId: source.businessId, systemId: source.id }, kind, target, state,
    propagation: defaultPropagation(kind), contractVersion: 1, purpose, createdAt: source.createdAt, updatedAt: source.updatedAt,
  };
}

/** Lifecycle is intent only. An unverified or failed publication is still a
 * Live System; that evidence belongs to System health, not here. */
function inquiryWorkspaceLifecycle(
  status: Snapshot["inquiryWorkspaces"][number]["capabilityStatus"], siteServing: boolean,
): { lifecycle: SystemLifecycle; basis: string } {
  const intended = status ? inquiryCapabilityLifecycle(status) : "live";
  if (intended === "draft") return { lifecycle: "draft", basis: "The inquiry form is not published yet." };
  if (intended === "paused") return { lifecycle: "paused", basis: "Inquiries are paused." };
  if (!siteServing) return { lifecycle: "paused", basis: "Its site is not serving." };
  if (status === "live_unverified" || status === "failed") {
    return { lifecycle: "live", basis: "Published; whether the form works is tracked as health." };
  }
  return { lifecycle: "live", basis: "Takes inquiries from a serving site." };
}

const calendarState = (status: string): ConnectionState =>
  status === "connected" ? "connected" : status === "error" ? "stale" : "disconnected";

/** Pure projection of a snapshot. Deterministic: the same snapshot always
 * yields the same ids, order and states. */
export function systemsFromExisting(raw: ExistingSystemsSnapshot): BusinessSystems {
  const snapshot = withinScope(existingSystemsSnapshotSchema.parse(raw));
  const { businessId } = snapshot;
  const systems: SystemListing[] = [];
  const connections: ConnectionListing[] = [];
  const websiteByTenant = new Map<string, System>();

  for (const work of snapshot.savedWork) {
    const mapping = SAVED_WORK_KINDS[`${work.productId}/${work.resourceKind}`];
    if (!mapping) continue;
    const state = savedWorkLifecycle(work, snapshot);
    if (!state) continue;
    // A rebuild of a managed site stands for that site: the tenant came first.
    const origin: SystemOrigin = mapping.kind === "website" && work.connectedSiteId
      ? { kind: "connected_site", ref: work.connectedSiteId }
      : mapping.kind === "website" && work.hostedTenantStableId && !work.hostedTenantReserved
      ? { kind: "tenant", ref: work.hostedTenantStableId }
      : { kind: "saved_work", ref: work.id };
    const system = existingSystem(businessId, origin, {
      name: work.title ?? mapping.fallbackName, kind: mapping.kind, lifecycle: state.lifecycle,
      createdAt: work.createdAt, updatedAt: work.updatedAt,
    });
    systems.push({
      system, provenance: "existing", basis: state.basis,
      references: { savedWorkId: work.id, tenantStableId: work.hostedTenantStableId, tenantId: work.hostedTenantId,
        ...(work.connectedSiteId ? { connectedSiteId: work.connectedSiteId } : {}) },
    });
    if (mapping.kind === "website" && work.hostedTenantStableId) websiteByTenant.set(work.hostedTenantStableId, system);
  }

  for (const site of snapshot.managedWebsites) {
    const native = websiteByTenant.get(site.tenantStableId);
    if (native) {
      // Same website: the native work row already stands for it.
      const listing = systems.find((item) => item.system.id === native.id);
      if (listing) listing.references = { ...listing.references, tenantStableId: site.tenantStableId, tenantId: site.tenantId };
      continue;
    }
    const system = existingSystem(businessId, { kind: "tenant", ref: site.tenantStableId }, {
      name: site.siteName, kind: "website", lifecycle: site.tenantActive ? "live" : "paused",
      createdAt: site.linkedAt, updatedAt: site.linkedAt,
    });
    systems.push({
      system, provenance: "existing",
      basis: site.tenantActive ? `Managed site ${site.tenantId} is serving.` : `Managed site ${site.tenantId} is inactive.`,
      references: { savedWorkId: null, tenantStableId: site.tenantStableId, tenantId: site.tenantId },
    });
    websiteByTenant.set(site.tenantStableId, system);
  }

  // A site the business already runs elsewhere, connected by script. Its id is
  // connected_site:<id> and survives a later rebuild (a new revision, same System).
  for (const site of snapshot.connectedSites) {
    const rebuilt = systems.find(item => item.references.connectedSiteId === site.id);
    if (rebuilt) {
      rebuilt.connectedSite = { siteUrl: site.siteUrl, siteHost: site.siteHost, verified: site.verifiedAt !== null, lastEventAt: site.lastEventAt };
      // A draft alternative does not pause the site that is already live.
      if (rebuilt.system.lifecycle === "draft" && site.status === "active" && site.verifiedAt) {
        rebuilt.system.lifecycle = "live";
        rebuilt.basis = `Connected; ${site.siteHost} is proven to be this business's. A rebuild is prepared beside it.`;
      }
      connections.push({ provenance: "existing", connection: existingConnection(rebuilt.system, "read",
        { type: "business_resource", resource: "business_record:facts" }, site.verifiedAt && site.status === "active" ? "connected" : "disconnected",
        "Confirmed facts from the business record are available to this website") });
      continue;
    }
    const verified = site.verifiedAt !== null;
    const lifecycle: SystemLifecycle = site.status === "revoked" ? "paused" : verified ? "live" : "draft";
    const system = existingSystem(businessId, { kind: "connected_site", ref: site.id }, {
      name: site.siteHost.replace(/^www\./, ""), kind: "website", lifecycle, createdAt: site.createdAt, updatedAt: site.updatedAt,
    });
    systems.push({
      system, provenance: "existing",
      basis: site.status === "revoked" ? "Disconnected from Strelva; the site itself is unchanged." : verified ? `Connected; ${site.siteHost} is proven to be this business's.` : `Waiting for proof that ${site.siteHost} is this business's.`,
      references: { savedWorkId: null, tenantStableId: null, tenantId: null, connectedSiteId: site.id },
      connectedSite: { siteUrl: site.siteUrl, siteHost: site.siteHost, verified, lastEventAt: site.lastEventAt },
    });
    connections.push({ provenance: "existing", connection: existingConnection(system, "read",
      { type: "business_resource", resource: "business_record:facts" }, verified && site.status === "active" ? "connected" : "disconnected",
      "Confirmed facts from the business record are filled into the site") });
  }

  // Only tenants this business holds now; a stale binding never leaks another
  // business's inquiries (the SQL reader applies the same rule).
  const heldTenants = new Set(snapshot.managedWebsites.map((site) => site.tenantStableId));
  for (const inquiry of snapshot.inquiryWorkspaces) {
    if (!heldTenants.has(inquiry.tenantStableId)) continue;
    const website = websiteByTenant.get(inquiry.tenantStableId);
    const state = inquiryWorkspaceLifecycle(inquiry.capabilityStatus, website?.lifecycle === "live");
    const system = existingSystem(businessId, { kind: "inquiry_workspace", ref: inquiry.id }, {
      name: website ? `${website.name} inquiries` : "Inquiries", kind: "inquiry",
      lifecycle: state.lifecycle,
      createdAt: inquiry.createdAt, updatedAt: inquiry.updatedAt,
    });
    systems.push({
      system, provenance: "existing",
      basis: state.basis,
      references: { savedWorkId: null, tenantStableId: inquiry.tenantStableId, tenantId: null, inquiryBusinessId: inquiry.businessId },
    });
    if (website) {
      connections.push({ provenance: "existing", connection: existingConnection(system, "appear",
        { type: "system", system: { businessId, systemId: website.id } }, "connected", "Inquiry form on the site") });
    }
  }

  for (const listing of systems.filter((item) => item.system.kind === "booking")) {
    const source = listing.system;
    for (const grant of snapshot.bookingGrants.filter((item) => item.workId === listing.references.savedWorkId)) {
      const website = websiteByTenant.get(grant.tenantStableId);
      if (!website) continue;
      connections.push({ provenance: "existing", connection: existingConnection(source, "appear",
        { type: "system", system: { businessId, systemId: website.id } },
        grant.status === "published" ? "connected" : "disconnected", `Booking on the site as ${grant.displayName}`) });
    }
    const selectedProviders = new Set(snapshot.bookingGrants.filter(grant => grant.workId === listing.references.savedWorkId && grant.status === "published").map(grant => grant.provider));
    for (const calendar of snapshot.calendarConnections.filter(calendar => selectedProviders.has(calendar.provider))) {
      connections.push({ provenance: "existing", connection: existingConnection(source, "read",
        { type: "account_binding", bindingId: calendar.id }, calendarState(calendar.status),
        `Availability from ${calendar.provider} calendar ${calendar.calendarName}`) });
    }
  }

  return { businessId, systems, connections };
}

/** Stored Systems win over the projection: same id, real lifecycle and
 * revisions. A stored System also claims a listing whose native ids its
 * origin names (a System saved under a rebuild's work id before it published
 * to its managed tenant), so one thing never lists twice. Existing things not
 * yet stored still appear. */
export function mergeBusinessSystems(graph: SystemGraph, existing: BusinessSystems): BusinessSystems {
  const stored = new Map(graph.systems.map((system) => [system.id, system]));
  const claimed = new Set<string>();
  const renamed = new Map<string, string>();
  const claim = (listing: SystemListing): System | undefined => {
    const exact = stored.get(listing.system.id);
    if (exact && !claimed.has(exact.id)) return exact;
    const { savedWorkId, tenantStableId } = listing.references;
    return graph.systems.find((system) => !claimed.has(system.id) && !existing.systems.some((item) => item.system.id === system.id) && (
      (system.origin?.kind === "saved_work" && system.origin.ref === savedWorkId)
      || (system.origin?.kind === "tenant" && listing.system.kind === "website" && system.origin.ref === tenantStableId)));
  };
  const systems: SystemListing[] = existing.systems.map((listing) => {
    const match = claim(listing);
    if (!match) return listing;
    claimed.add(match.id);
    if (match.id !== listing.system.id) renamed.set(listing.system.id, match.id);
    return { ...listing, system: match, provenance: "stored", basis: null };
  });
  const seen = new Set(systems.map((listing) => listing.system.id));
  for (const system of graph.systems) {
    if (seen.has(system.id)) continue;
    systems.push({ system, provenance: "stored", basis: null, references: { savedWorkId: system.origin?.kind === "saved_work" ? system.origin.ref : null, tenantStableId: system.origin?.kind === "tenant" ? system.origin.ref : null, tenantId: null } });
  }
  const storedConnections = graph.connections.map((connection) => ({ connection, provenance: "stored" as const }));
  const storedKeys = new Set(graph.connections.map((c) => `${c.source.systemId}:${c.kind}:${JSON.stringify(c.target)}`));
  const rename = (id: string) => renamed.get(id) ?? id;
  const derived = existing.connections.map(({ connection: c, provenance }) => ({ provenance, connection: {
    ...c,
    source: { ...c.source, systemId: rename(c.source.systemId) },
    target: c.target.type === "system" ? { ...c.target, system: { ...c.target.system, systemId: rename(c.target.system.systemId) } } : c.target,
  } })).filter(({ connection: c }) => !storedKeys.has(`${c.source.systemId}:${c.kind}:${JSON.stringify(c.target)}`));
  return { businessId: existing.businessId, systems, connections: [...storedConnections, ...derived] };
}

/**
 * What the tenant side says about a managed site this business holds, read
 * on the server from the tenant's own config (never copied into the
 * workspace). Absent means unknown, and nothing is added for it.
 */
export interface TenantSiteFacts {
  /** `tenants.features` as stored (legacy aliases allowed). */
  features: readonly string[];
  /** Public hostname of the live site, when the tenant records one. */
  domain?: string | null;
}

/** Feature ids that mean the client runs its own checkout. */
const CLIENT_CHECKOUT_FEATURES = new Set(["commerce", "shop", "products"]);
/** Wellness surfaces that are views of the Bookings System, not Systems. */
const BOOKING_VIEW_FEATURES = ["schedule", "roster"] as const;
export type BookingView = (typeof BOOKING_VIEW_FEATURES)[number];

/** The Store Connection's contract, in the words a customer reads. */
export function clientStorePurpose(domain: string | null): string {
  const where = domain ? `Store on ${domain}` : "Store on the site";
  return `${where} · runs in the client's own checkout. Strelva has no authority there: the client's Stripe is the source of truth, and Strelva does not read it.`;
}

/** Projection-only identity for a managed site's tenant booking widget. */
export function tenantBookingsSystemId(businessId: string, tenantStableId: string): string {
  return uuidFromSeed(`system:${businessId}:tenant_bookings:${tenantStableId}`);
}

export interface TenantSurfaceListing extends BusinessSystems {
  /** Day and week views of a Bookings System, by System id. */
  bookingViews: Map<string, BookingView[]>;
}

/**
 * Adds what the tenant side runs beside a managed website, without copying
 * it (docs/product/specs/systems-catalog.md 3.2, 3.3):
 *
 * - A client checkout (`commerce`) is a Store Connection on the website
 *   System: it appears with the site, Strelva has no authority, the client's
 *   Stripe is the source of truth and Strelva does not read it. Never a
 *   System, never a write.
 * - Wellness schedule and roster are the Bookings System's day and week
 *   views. When a Bookings System already appears on that site they attach to
 *   it. Otherwise the site's own booking widget is shown as a Bookings System
 *   that appears on the site. Its id is projection-only (origin null) until
 *   the bookings spec gives the one booking store a stored origin; Make real
 *   never targets it. Members stay frozen and are not shown.
 */
export function withTenantSurfaces(listing: BusinessSystems, facts: ReadonlyMap<string, TenantSiteFacts>): TenantSurfaceListing {
  const systems = [...listing.systems];
  const connections = [...listing.connections];
  const bookingViews = new Map<string, BookingView[]>();
  const websites = listing.systems.filter((item) => item.system.kind === "website" && item.references.tenantId);
  for (const site of websites) {
    const fact = facts.get(site.references.tenantId!);
    if (!fact) continue;
    const features = new Set(fact.features);
    if ([...features].some((feature) => CLIENT_CHECKOUT_FEATURES.has(feature))) {
      connections.push({ provenance: "existing", connection: existingConnection(site.system, "appear",
        { type: "api", api: `client-checkout:${site.references.tenantId}` }, "connected", clientStorePurpose(fact.domain ?? null)) });
    }
    const views = BOOKING_VIEW_FEATURES.filter((feature) => features.has(feature));
    if (!views.length || !site.references.tenantStableId) continue;
    const onSite = listing.connections.find(({ connection }) => connection.kind === "appear"
      && connection.target.type === "system" && connection.target.system.systemId === site.system.id
      && listing.systems.some((item) => item.system.id === connection.source.systemId && item.system.kind === "booking"));
    if (onSite) {
      const id = onSite.connection.source.systemId;
      bookingViews.set(id, [...new Set([...(bookingViews.get(id) ?? []), ...views])]);
      continue;
    }
    const system: System = {
      id: tenantBookingsSystemId(listing.businessId, site.references.tenantStableId),
      businessId: listing.businessId, name: `${site.system.name} bookings`.slice(0, 160), purpose: null, kind: "booking",
      lifecycle: site.system.lifecycle, currentRevision: null, origin: null, changeNumber: 1,
      createdAt: site.system.createdAt, updatedAt: site.system.updatedAt,
    };
    systems.push({
      system, provenance: "existing",
      basis: "Bookings taken by the site's booking widget. The schedule and roster are its day and week views.",
      references: { savedWorkId: null, tenantStableId: site.references.tenantStableId, tenantId: site.references.tenantId },
    });
    connections.push({ provenance: "existing", connection: existingConnection(system, "appear",
      { type: "system", system: { businessId: listing.businessId, systemId: site.system.id } }, "connected", "Booking on the site") });
    bookingViews.set(system.id, views);
  }
  return { businessId: listing.businessId, systems, connections, bookingViews };
}

/** Reads what the business already has (actor-checked, read-only). */
export function readExistingSystemsSnapshot(actor: WorkspaceActor, businessId: string, db?: SystemsDb): Promise<Snapshot> {
  return callSystems("read_existing_business_systems", {
    p_workspace_id: z.string().uuid().parse(businessId),
    p_user_id: z.string().uuid().parse(actor.userId),
    p_verified_email: z.string().email().parse(actor.verifiedEmail.trim().toLowerCase()),
  }, existingSystemsSnapshotSchema, "The existing Systems could not be loaded.", db);
}

/** Everything a business should see as its Systems: stored ones plus every
 * existing thing not yet stored. Both reads recheck the actor. */
export async function listBusinessSystems(
  actor: WorkspaceActor, businessId: string,
  deps: { store: SystemStore; db?: SystemsDb; connectedSites?: () => Promise<ExistingConnectedSite[]> },
): Promise<BusinessSystems> {
  const [graph, snapshot, connectedSites] = await Promise.all([
    deps.store.readGraph(actor, businessId),
    readExistingSystemsSnapshot(actor, businessId, deps.db),
    deps.connectedSites ? deps.connectedSites().catch(() => []) : Promise.resolve([]),
  ]);
  return mergeBusinessSystems(graph, systemsFromExisting({ ...snapshot, connectedSites }));
}
