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
 * the existing identity: saved_product_work.id for anything made in the
 * workspace, tenants.stable_id for a managed website with no native work row,
 * and inquiry_workspaces.id for a managed tenant's inquiry handling. Storing
 * the System later (createSystem with the same origin) keeps the same id.
 *
 * A native website's work row and the tenant it publishes to are ONE System.
 * tenant_workspace_links is the canonical workspace-to-tenant link; an active
 * offering_website_bindings row is read only for a tenant with no link.
 *
 * Not mapped, on purpose: plans, investigations, responsibilities, learning
 * items and onboarding cases are work or records inside a System, not
 * Systems themselves (RULE_SYSTEM_OUTPUT_IDENTITY boundary). Retired
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
  hostedTenantStableId: nullableText,
  hostedTenantId: nullableText,
});

export const existingManagedWebsiteSchema = z.object({
  link: z.enum(["tenant_link", "website_binding"]),
  tenantStableId: z.string().uuid(),
  tenantId: z.string(),
  siteName: z.string(),
  tenantActive: z.boolean(),
  linkedAt: iso,
});

export const existingSystemsSnapshotSchema = z.object({
  businessId: z.string().uuid(),
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
});
export type ExistingSystemsSnapshot = z.input<typeof existingSystemsSnapshotSchema>;
type Snapshot = z.output<typeof existingSystemsSnapshotSchema>;
type SavedWork = Snapshot["savedWork"][number];

/** A System as a business sees it, with where it came from and, for an
 * existing thing, the plain reason for its lifecycle. */
export interface SystemListing {
  system: System;
  provenance: SystemProvenance;
  /** Why the lifecycle reads as it does, for an existing thing. */
  basis: string | null;
  /** Native ids this System stands for (work id, tenant id). */
  references: { savedWorkId: string | null; tenantStableId: string | null; tenantId: string | null };
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
  "documents/document": { kind: "document", fallbackName: "Document" },
  "tracker/tracker": { kind: "tracker", fallbackName: "Tracker" },
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
  status === "revoked" ? "disconnected" : status === "error" ? "stale" : "connected";

/** Pure projection of a snapshot. Deterministic: the same snapshot always
 * yields the same ids, order and states. */
export function systemsFromExisting(raw: ExistingSystemsSnapshot): BusinessSystems {
  const snapshot = existingSystemsSnapshotSchema.parse(raw);
  const { businessId } = snapshot;
  const systems: SystemListing[] = [];
  const connections: ConnectionListing[] = [];
  const websiteByTenant = new Map<string, System>();

  for (const work of snapshot.savedWork) {
    const mapping = SAVED_WORK_KINDS[`${work.productId}/${work.resourceKind}`];
    if (!mapping) continue;
    const state = savedWorkLifecycle(work, snapshot);
    if (!state) continue;
    const system = existingSystem(businessId, { kind: "saved_work", ref: work.id }, {
      name: work.title ?? mapping.fallbackName, kind: mapping.kind, lifecycle: state.lifecycle,
      createdAt: work.createdAt, updatedAt: work.updatedAt,
    });
    systems.push({
      system, provenance: "existing", basis: state.basis,
      references: { savedWorkId: work.id, tenantStableId: work.hostedTenantStableId, tenantId: work.hostedTenantId },
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

  for (const inquiry of snapshot.inquiryWorkspaces) {
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
      references: { savedWorkId: null, tenantStableId: inquiry.tenantStableId, tenantId: null },
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
    for (const calendar of snapshot.calendarConnections) {
      connections.push({ provenance: "existing", connection: existingConnection(source, "read",
        { type: "account_binding", bindingId: calendar.id }, calendarState(calendar.status),
        `Availability from ${calendar.provider} calendar ${calendar.calendarName}`) });
    }
  }

  return { businessId, systems, connections };
}

/** Stored Systems win over the projection: same id, real lifecycle and
 * revisions. Existing things not yet stored still appear. */
export function mergeBusinessSystems(graph: SystemGraph, existing: BusinessSystems): BusinessSystems {
  const stored = new Map(graph.systems.map((system) => [system.id, system]));
  const systems: SystemListing[] = existing.systems.map((listing) => {
    const match = stored.get(listing.system.id);
    return match ? { ...listing, system: match, provenance: "stored", basis: null } : listing;
  });
  const seen = new Set(systems.map((listing) => listing.system.id));
  for (const system of graph.systems) {
    if (seen.has(system.id)) continue;
    systems.push({ system, provenance: "stored", basis: null, references: { savedWorkId: system.origin?.kind === "saved_work" ? system.origin.ref : null, tenantStableId: system.origin?.kind === "tenant" ? system.origin.ref : null, tenantId: null } });
  }
  const storedConnections = graph.connections.map((connection) => ({ connection, provenance: "stored" as const }));
  const storedKeys = new Set(graph.connections.map((c) => `${c.source.systemId}:${c.kind}:${JSON.stringify(c.target)}`));
  const derived = existing.connections.filter(({ connection: c }) => !storedKeys.has(`${c.source.systemId}:${c.kind}:${JSON.stringify(c.target)}`));
  return { businessId: existing.businessId, systems, connections: [...storedConnections, ...derived] };
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
  actor: WorkspaceActor, businessId: string, deps: { store: SystemStore; db?: SystemsDb },
): Promise<BusinessSystems> {
  const [graph, snapshot] = await Promise.all([
    deps.store.readGraph(actor, businessId),
    readExistingSystemsSnapshot(actor, businessId, deps.db),
  ]);
  return mergeBusinessSystems(graph, systemsFromExisting(snapshot));
}
