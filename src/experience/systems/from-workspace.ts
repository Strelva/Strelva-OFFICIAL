/**
 * Read adapter: the server's spine projection -> Systems view-model.
 *
 * Systems, lifecycle, Connections, health and Possibilities all come from
 * `snapshot.systems` (src/experience/systems/server.ts over
 * src/platform/systems, system-health and possibilities). This adapter only
 * resolves what opens (the site, the inquiry inbox or the saved work), the
 * sentences customers read, and Versions recorded on saved work. It infers no
 * System, health or lineage the server did not send.
 *
 * Unless the snapshot says STRELVA_SYSTEMS_RELEASE is on, there are no
 * Systems: every saved result stays a file, as before the Systems model.
 */
import type { OfferingInstallation } from "@/platform/offerings";
import type { ManagedWork, WorkspaceSnapshot, WorkspaceSystemEntry, WorkspaceSystems, WorkspaceWork } from "@/experience/workspace/contracts";
import { sameAppHref } from "@/experience/workspace/workspace-discovery";
import { systemsReleased, type SystemConnection, type SystemKind, type SystemPossibility, type SystemSurface, type SystemVersion, type SystemView } from "./model";

export interface SystemsInput {
  snapshot: Pick<WorkspaceSnapshot, "workspaceId" | "workspaces" | "work" | "delegations" | "systems" | "releases">;
  /** Managed sites this account can open, for the site surface (address, controls). */
  sites: readonly ManagedWork[];
  installations?: readonly OfferingInstallation[];
  definitionNames?: ReadonlyMap<string, string>;
  /** Workspace exit stopped new work: every System is paused, records retained. */
  stopped?: boolean;
}

export interface BusinessSystems {
  systems: SystemView[];
  /** Saved results that are not Systems: assessments, audits, plans, experiments. */
  files: WorkspaceWork[];
  /** The spine projection could not be read. Nothing about Systems is claimed. */
  unavailable: boolean;
}

/** Spine descriptor -> what the workspace draws. Kind is a descriptor, not identity. */
const KIND_VIEW: Record<string, SystemKind> = {
  website: "website",
  inquiry: "inquiries",
  booking: "bookings",
  document: "document",
  report: "document",
  proposal: "document",
  tracker: "tracker",
  onboarding: "onboarding",
  internal_app: "app",
  portal: "app",
  pricing: "app",
};

function hostname(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    return url.hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

const bare = (host: string | undefined) => host?.replace(/^www\./, "");

function provider(installation: OfferingInstallation | undefined): string | undefined {
  if (!installation) return undefined;
  return installation.responsibility.kind === "provider_requested" ? installation.responsibility.providerName : undefined;
}

const CONNECTION_STATUS = { connected: "connected", disconnected: "not_connected", stale: "unknown" } as const;

function detailFor(kind: SystemKind, work: WorkspaceWork | undefined, entry: WorkspaceSystemEntry): string {
  if (kind === "document" && work?.document) return `Revision ${work.document.revision}`;
  if (kind === "app") return "Used by your team";
  if (kind === "bookings") return "Time people can reserve";
  if (kind === "tracker") return "Working data";
  if (kind === "onboarding") return "New-client intake";
  if (kind === "website" && !entry.tenantId) return "Website draft";
  return "";
}

export function readBusinessSystems(input: SystemsInput): BusinessSystems {
  const { snapshot, sites, installations = [], definitionNames = new Map(), stopped = false } = input;
  const projection: WorkspaceSystems | undefined = systemsReleased(snapshot) ? snapshot.systems : undefined;
  const ready = projection?.status === "ready" ? projection : null;
  const entries = ready?.systems ?? [];
  const installationFor = new Map<string, OfferingInstallation>();
  for (const installation of installations) {
    if (installation.status === "retired") continue;
    for (const resource of installation.nativeResources) installationFor.set(resource.id, installation);
  }
  const agencyNames = new Map(snapshot.workspaces.filter(item => item.kind === "agency").map(item => [item.id, item.name]));
  const delegationAgency = new Map(snapshot.delegations.filter(item => item.status === "active").map(item => [item.workId, item.agencyWorkspaceId]));
  const businessName = snapshot.workspaces.find(item => item.id === snapshot.workspaceId)?.name || "This business";
  const workById = new Map(snapshot.work.map(work => [work.id, work]));
  const siteById = new Map(sites.map(site => [site.id, site]));
  const claimedWork = new Set<string>([
    ...entries.flatMap(entry => entry.savedWorkId ? [entry.savedWorkId] : []),
    ...(ready?.possibilities ?? []).map(item => item.workId),
  ]);

  const systems: SystemView[] = entries.map(entry => {
    const kind = KIND_VIEW[entry.kind] ?? "app";
    const work = entry.savedWorkId ? workById.get(entry.savedWorkId) : undefined;
    const site = entry.tenantId ? siteById.get(entry.tenantId) : undefined;
    const domain = bare(hostname(site?.domain));
    const installation = entry.savedWorkId ? installationFor.get(entry.savedWorkId) : undefined;
    let surface: SystemSurface | null = null;
    if (kind === "website" && entry.tenantId) {
      const liveUrl = site?.domain ? `https://${site.domain.replace(/^https?:\/\//, "")}` : undefined;
      const previewSrc = (site?.previewHref && sameAppHref(site.previewHref)) || liveUrl;
      surface = { kind: "website", domain, liveUrl, previewSrc, previewLabel: site?.previewHref ? `Rendered from the saved copy of ${domain || entry.name}` : `${domain || entry.name}, as visitors see it now`, manageHref: site?.href && sameAppHref(site.href) ? sameAppHref(site.href) || undefined : undefined };
    } else if (work) {
      surface = { kind: "work", workId: work.id, productId: work.productId };
    }
    const versions: SystemVersion[] = [];
    if (work && installation) versions.push({ id: `${work.id}:offering`, relation: "version", context: businessName, title: work.title, lineage: `Adapted from ${definitionNames.get(installation.definitionId) || installation.definitionId}, version ${installation.definitionVersion}.` });
    if (work?.sourceWorkId && kind !== "document") {
      const agency = delegationAgency.get(work.id);
      versions.push({ id: `${work.id}:source`, relation: "version", context: businessName, title: work.title, lineage: `Adapted from a source system${agency && agencyNames.get(agency) ? ` kept by ${agencyNames.get(agency)}` : " your provider keeps"}. Your records and access stay here.` });
    }
    return {
      id: entry.ref.systemId,
      kind,
      // A managed website reads by its address; the spine keeps the site name.
      name: kind === "website" && domain ? domain : entry.name,
      detail: kind === "website" && domain ? entry.name : detailFor(kind, work, entry),
      ...(entry.basis ? { basis: entry.basis } : {}),
      lifecycle: stopped ? "paused" : entry.lifecycle,
      health: { state: entry.health.status, summary: work?.unavailableReason || entry.health.summary, lastVerifiedAt: entry.health.lastVerifiedAt },
      surface: surface ?? { kind: "work", workId: entry.savedWorkId ?? entry.ref.systemId, productId: "unknown" },
      operatedBy: kind === "website" && site ? site.relationship === "enterprise" ? "Your enterprise team" : "Strelva" : provider(installation),
      connections: [], possibilities: [], versions,
    };
  });
  const byId = new Map(systems.map(system => [system.id, system]));

  // The inquiry inbox opens for the tenant of the site its form appears on.
  for (const connection of ready?.connections ?? []) {
    const source = byId.get(connection.sourceId);
    const target = connection.targetSystemId ? byId.get(connection.targetSystemId) : undefined;
    if (!source) continue;
    const status = CONNECTION_STATUS[connection.state];
    const outgoing: SystemConnection = { id: connection.id, kind: connection.kind, target: target?.name ?? connection.targetLabel, systemId: target?.id, sentence: connection.purpose ?? `${source.name} works with ${target?.name ?? connection.targetLabel}.`, status };
    source.connections.push(outgoing);
    if (target) target.connections.push({ id: `${connection.id}:in`, kind: connection.kind, target: source.name, systemId: source.id, sentence: `${source.name}: ${connection.purpose ?? "connected here"}.`, status, direction: "in" });
    const tenantId = target ? entries.find(entry => entry.ref.systemId === target.id)?.tenantId : null;
    if (source.kind === "inquiries" && connection.kind === "appear" && tenantId && source.surface.kind === "work" && source.surface.productId === "unknown") {
      source.surface = { kind: "inquiries", tenantId };
      source.operatedBy = target?.operatedBy;
      source.detail = `From ${target?.name}`;
    }
  }

  // A Possibility is business-level: show it from every System it would change.
  for (const possibility of ready?.possibilities ?? []) {
    const view: SystemPossibility = {
      id: possibility.id, title: possibility.title, summary: possibility.summary, status: possibility.status,
      affects: possibility.affects.filter(id => byId.has(id)),
      ...(possibility.evidence ? { evidence: possibility.evidence } : {}),
      ...(possibility.previewHref && sameAppHref(possibility.previewHref) ? { previewSrc: sameAppHref(possibility.previewHref) || undefined } : {}),
      openHref: `/workspace?workspaceId=${encodeURIComponent(snapshot.workspaceId)}&view=websites&work=${encodeURIComponent(possibility.workId)}`,
    };
    for (const id of view.affects) byId.get(id)!.possibilities.push(view);
  }

  // Several websites under one business are location Versions of one website (Twin Trees: one account, two locations).
  const websites = systems.filter(item => item.kind === "website" && item.surface.kind === "website");
  if (websites.length > 1) for (const site of websites) {
    site.versions.push(...websites.filter(other => other.id !== site.id).map(other => ({
      id: `${site.id}->${other.id}`, relation: "version" as const, context: other.detail || other.name, title: other.name, systemId: other.id,
      lineage: "Another location's website on this account. Shared changes are not linked between them yet.",
    })));
  }

  const files = snapshot.work.filter(work => !claimedWork.has(work.id));
  return { systems, files, unavailable: projection?.status === "unavailable" };
}

/** A Possibility can touch several Systems; this resolves the names a customer will recognize. */
export function possibilityScope(possibility: SystemPossibility, systems: readonly SystemView[]): string[] {
  return [
    ...possibility.affects.map(id => systems.find(item => item.id === id)?.name || "A system"),
    ...(possibility.introduces || []).map(name => `New: ${name}`),
  ];
}

/** Saved-work products the spine maps to Systems (systems/from-existing SAVED_WORK_KINDS), less websites. */
const SYSTEM_PRODUCTS: ReadonlySet<string> = new Set(["applications", "custom-applications", "scheduling", "documents", "tracker"]);

export interface AgencyLineage {
  sources: Array<{ source: WorkspaceWork; versions: Array<{ businessId: string; businessName: string; work: WorkspaceWork }> }>;
  /** Client systems with no recorded source in this agency. */
  unlinked: Array<{ businessId: string; businessName: string; work: WorkspaceWork }>;
}

/**
 * Agency view: its own source Systems and the client Versions adapted from them.
 * Only `sourceWorkId` establishes lineage; matching titles never do.
 */
export function agencySystemLineage(agencyWork: readonly WorkspaceWork[], clients: readonly { workspace: { id: string; name: string }; work: readonly WorkspaceWork[] }[]): AgencyLineage {
  const sources = agencyWork.filter(work => SYSTEM_PRODUCTS.has(work.productId) && work.operation?.status !== "retired").map(source => ({ source, versions: [] as AgencyLineage["sources"][number]["versions"] }));
  const byId = new Map(sources.map(entry => [entry.source.id, entry]));
  const unlinked: AgencyLineage["unlinked"] = [];
  for (const client of clients) for (const work of client.work) {
    if (!SYSTEM_PRODUCTS.has(work.productId) && work.productId !== "websites") continue;
    const entry = work.sourceWorkId ? byId.get(work.sourceWorkId) : undefined;
    const item = { businessId: client.workspace.id, businessName: client.workspace.name, work };
    if (entry) entry.versions.push(item); else unlinked.push(item);
  }
  return { sources, unlinked };
}
