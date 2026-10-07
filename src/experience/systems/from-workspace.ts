/**
 * Read adapter: the server's spine projection -> Systems view-model.
 *
 * Systems, lifecycle, Connections, health and Possibilities all come from
 * `snapshot.systems` (src/experience/systems/server.ts over
 * src/platform/systems, system-health and possibilities). This adapter only
 * resolves what opens (the site, the inquiry inbox or the saved work), the
 * sentences customers read, and the stored Version rows the server sent
 * (`systems.versions`). It infers no System, health or lineage the server did
 * not send. The agency's source and Version list is the Library
 * (GET /api/workspace/agency-library), read from system_versions.
 *
 * Unless the snapshot says STRELVA_SYSTEMS_RELEASE is on, there are no
 * Systems: every saved result stays a file, as before the Systems model.
 */
import type { OfferingInstallation } from "@/platform/offerings";
import type { ManagedWork, WorkspaceSnapshot, WorkspaceSystemEntry, WorkspaceSystems, WorkspaceWork } from "@/experience/workspace/contracts";
import { sameAppHref } from "@/experience/workspace/workspace-discovery";
import { systemsReleased, type SystemConnection, type SystemHistoryRow, type SystemKind, type SystemPossibility, type SystemSurface, type SystemVersion, type SystemView } from "./model";

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
  // Stored Systems made before the merge keep their slug; a tracker reads as an internal tool.
  tracker: "app",
  onboarding: "onboarding",
  internal_app: "app",
  portal: "app",
  pricing: "app",
  listing: "listing",
  newsletter: "newsletter",
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
  if (kind === "app") return work?.productId === "tracker" ? "Used by your team · started from a list" : "Used by your team";
  if (kind === "bookings") return "Time people can reserve";
  if (kind === "onboarding") return "New-client intake";
  if (kind === "website" && !entry.tenantId) return "Website draft";
  if (kind === "listing") return "Reviews, hours and posts on Google";
  if (kind === "newsletter") return "Issues to your subscribers";
  return "";
}

const BOOKING_VIEW_LABEL = { schedule: "Day and week schedule", roster: "Roster" } as const;

/** Wellness schedule and roster are views of the Bookings System on the managed site's dashboard. */
function bookingViews(views: NonNullable<WorkspaceSystemEntry["views"]>, site: ManagedWork | undefined): NonNullable<SystemView["views"]> {
  const dashboard = site?.href && /\/dashboard\/?$/.test(site.href) ? site.href.replace(/\/$/, "") : undefined;
  return views.map(view => ({ id: view, label: BOOKING_VIEW_LABEL[view], ...(dashboard ? { href: `${dashboard}/${view}` } : {}) }));
}

/**
 * Assessments and website audits are one thing on a website: issued
 * outputs about that site. They open from its page, never as a separate
 * presentation or System. Matched by the address they were run against.
 */
function auditsFor(domain: string, work: readonly WorkspaceWork[]): Pick<SystemView, "audits"> {
  const audits = work.flatMap(item => {
    const subject = item.assessment?.subject.url;
    if (!subject || bare(hostname(subject)) !== domain) return [];
    const method = item.assessment!.method.id === "website_audit" ? "Website audit" : "Website audit · AI visibility";
    return [{ workId: item.id, title: method, at: item.assessment!.observedAt ?? item.assessment!.recordedAt }];
  });
  return audits.length ? { audits } : {};
}

export function readBusinessSystems(input: SystemsInput): BusinessSystems {
  const { snapshot, sites, installations = [], definitionNames = new Map(), stopped = false } = input;
  const projection: WorkspaceSystems | undefined = systemsReleased(snapshot) ? snapshot.systems : undefined;
  const ready = projection?.status === "ready" ? projection : null;
  const entries = ready?.systems ?? [];
  const publishing = ready?.publishing?.status === "ready" ? ready.publishing : undefined;
  const installationFor = new Map<string, OfferingInstallation>();
  for (const installation of installations) {
    if (installation.status === "retired") continue;
    for (const resource of installation.nativeResources) installationFor.set(resource.id, installation);
  }
  const agencyNames = new Map(snapshot.workspaces.filter(item => item.kind === "agency").map(item => [item.id, item.name]));
  const versionBySystem = new Map((ready?.versions ?? []).map(item => [item.systemId, item]));
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
    if (kind === "website" && entry.connectedSite) {
      // The business's own site, built elsewhere. Strelva frames it and never edits it.
      const liveUrl = entry.connectedSite.siteUrl;
      surface = { kind: "website", domain: bare(hostname(liveUrl)), liveUrl, previewSrc: liveUrl, previewLabel: `${bare(entry.connectedSite.siteHost)}, as visitors see it now` };
    } else if (kind === "website" && entry.tenantId) {
      const liveUrl = site?.domain ? `https://${site.domain.replace(/^https?:\/\//, "")}` : undefined;
      const previewSrc = (site?.previewHref && sameAppHref(site.previewHref)) || liveUrl;
      surface = { kind: "website", domain, liveUrl, previewSrc, previewLabel: site?.previewHref ? `Rendered from the saved copy of ${domain || entry.name}` : `${domain || entry.name}, as visitors see it now`, manageHref: site?.href && sameAppHref(site.href) ? sameAppHref(site.href) || undefined : undefined, ...(entry.editing ? { editing: entry.editing } : {}) };
    } else if (kind === "listing") {
      const listing = publishing?.listings.find(item => item.systemId === entry.ref.systemId);
      surface = listing
        ? { kind: "listing", healthMessage: listing.healthMessage, receipts: listing.receipts }
        : { kind: "listing", healthMessage: "Strelva couldn't read this listing just now.", receipts: [], unavailable: true };
    } else if (kind === "newsletter") {
      surface = { kind: "newsletter", audience: entry.basis ?? "Sent to active subscribers." };
    } else if (work) {
      surface = { kind: "work", workId: work.id, productId: work.productId };
    }
    const versions: SystemVersion[] = [];
    if (work && installation) versions.push({ id: `${work.id}:offering`, relation: "version", context: businessName, title: work.title, lineage: `Adapted from ${definitionNames.get(installation.definitionId) || installation.definitionId}, version ${installation.definitionVersion}.` });
    // Lineage comes only from stored Version rows (system_versions). Saved
    // work's sourceWorkId is work-to-work history and never a Version.
    const stored = versionBySystem.get(entry.ref.systemId);
    if (stored) {
      const sourceBusiness = stored.source.businessId === snapshot.workspaceId ? null : agencyNames.get(stored.source.businessId);
      const sourceLabel = stored.source.hidden ? "this business's shared setup" : stored.source.name ?? (sourceBusiness ? `a source kept by ${sourceBusiness}` : "a source your provider keeps");
      const waiting = stored.latestRevision !== null && stored.latestRevision > stored.baselineRevision && !stored.declined.includes(stored.latestRevision);
      versions.push({ id: `${stored.id}:source`, relation: "source", context: stored.context.label, title: stored.source.name ?? "Source",
        lineage: `${stored.context.label} is adapted from ${sourceLabel}.${waiting ? " An improvement is waiting for a decision." : ""} Records and accounts stay here.` });
      for (const sibling of stored.siblings) {
        versions.push({ id: `${stored.id}->${sibling.id}`, relation: "version", context: sibling.context.label, title: sibling.context.label, systemId: sibling.systemId,
          comparison: sibling.comparison, lineage: `Another Version of the same ${stored.source.hidden ? "setup" : "source"}, with its own accounts.` });
      }
    }
    return {
      id: entry.ref.systemId,
      kind,
      // A managed website reads by its address; the spine keeps the site name.
      name: kind === "website" && domain ? domain : entry.name,
      detail: kind === "website" && entry.connectedSite ? "Connected site" : kind === "website" && domain ? entry.name : detailFor(kind, work, entry),
      ...(entry.basis ? { basis: entry.basis } : {}),
      lifecycle: stopped ? "paused" : entry.lifecycle,
      health: { state: entry.health.status, summary: work?.unavailableReason || entry.health.summary, lastVerifiedAt: entry.health.lastVerifiedAt, ...(entry.health.signals ? { signals: entry.health.signals } : {}) },
      ...(publishing && entry.tenantId && (kind === "website" || kind === "newsletter") ? { publishing: true } : {}),
      surface: surface ?? { kind: "work", workId: entry.savedWorkId ?? entry.ref.systemId, productId: "unknown" },
      operatedBy: kind === "website" && site ? site.relationship === "enterprise" ? "Your enterprise team" : "Strelva" : provider(installation),
      ...(kind === "bookings" && entry.views?.length ? { views: bookingViews(entry.views, entry.tenantId ? siteById.get(entry.tenantId) : undefined) } : {}),
      ...(kind === "website" && domain ? auditsFor(domain, snapshot.work) : {}),
      connections: [], possibilities: [], versions,
      ...(stored ? { storedVersionId: stored.id } : {}),
      ...(publishing?.websiteParts[entry.ref.systemId]?.length ? { parts: publishing.websiteParts[entry.ref.systemId]!.map(({ label, published, drafts }) => ({ label, published, drafts })) } : {}),
      ...(publishing?.offers.some(offer => offer.systemId === entry.ref.systemId)
        ? { offers: publishing.offers.filter(offer => offer.systemId === entry.ref.systemId).map(({ kind, label }) => ({ kind, label })) } : {}),
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

  // Website contracts never imply that a repo-only site reads business facts.
  // These are read-only presentation of the existing authorized delivery paths.
  for (const entry of entries.filter(entry => entry.kind === "website")) {
    const system = byId.get(entry.ref.systemId);
    if (!system) continue;
    const connectedOnly = Boolean(entry.connectedSite && !entry.tenantId);
    const document = Boolean(entry.businessFactsConnected);
    const automatic = document || (connectedOnly && entry.connectedSite?.verified);
    const native = entry.editing === "native";
    const facts: SystemConnection = {
      id: `${system.id}:business-facts`, kind: "read", target: "Business record", status: automatic ? "connected" : "not_connected",
      sentence: document ? "This website reads confirmed business facts when it renders."
        : connectedOnly ? "Confirmed business facts are filled into the connected site after ownership is proven."
          : entry.savedWorkId ? "This website uses its approved content. Business fact reads are not connected."
          : native ? "Strelva prepares business fact changes as native website content for review and publishing."
            : "Strelva updates this site by hand; it does not read the business record.",
      contract: { sourceOfTruth: "The business record's confirmed facts", authority: "Only confirmed public business facts; no contacts, requests or owner-only details.",
        freshness: automatic ? "Read when the website renders or the connected page loads." : "Changes reach the live site only after Strelva publishes them.",
        failureBehavior: automatic ? "If facts cannot be read, the last approved website content stays available." : "A business record change does not automatically change this website." },
    };
    // The spine already projects the connected-site read. Enrich it once,
    // including when that same System later becomes a hosted document.
    const existing = system.connections.findIndex(connection => connection.kind === "read" && !connection.systemId && /business record/i.test(connection.sentence));
    if (existing >= 0) system.connections[existing] = { ...facts, id: system.connections[existing]!.id };
    else system.connections.push(facts);
  }

  // A Possibility is business-level: show it from every System it would change.
  for (const possibility of ready?.possibilities ?? []) {
    const view: SystemPossibility = {
      id: possibility.id, title: possibility.title, summary: possibility.summary, status: possibility.status,
      affects: possibility.affects.filter(id => byId.has(id)),
      ...(possibility.evidence ? { evidence: possibility.evidence } : {}),
      ...(possibility.previewHref && sameAppHref(possibility.previewHref) ? { previewSrc: sameAppHref(possibility.previewHref) || undefined } : {}),
      openHref: (possibility.tryHref && sameAppHref(possibility.tryHref)) || `/workspace?workspaceId=${encodeURIComponent(snapshot.workspaceId)}&view=websites&work=${encodeURIComponent(possibility.workId)}`,
      ...(possibility.staleReason ? { staleReason: possibility.staleReason } : {}),
    };
    for (const id of view.affects) byId.get(id)!.possibilities.push(view);
  }

  // Make real in progress or partly live, on every System it changes.
  for (const activation of ready?.activations ?? []) {
    const view = { id: activation.id, title: activation.title, headline: activation.headline, partlyLive: activation.partlyLive, done: activation.done, total: activation.total, lines: activation.lines };
    for (const id of activation.affects) {
      const system = byId.get(id);
      if (system) system.activations = [...(system.activations ?? []), view];
    }
  }
  // History: the System's own changes and Strelva handled receipts for it, newest first, last five.
  const history = new Map<string, SystemHistoryRow[]>();
  for (const row of ready?.history ?? []) history.set(row.systemId, [...(history.get(row.systemId) ?? []), { id: row.id, sentence: row.sentence, at: row.at, releaseRef: row.releaseRef, implementationKind: row.implementationKind }]);
  for (const receipt of ready?.handled ?? []) if (receipt.systemId) history.set(receipt.systemId, [...(history.get(receipt.systemId) ?? []), { id: receipt.id, sentence: receipt.sentence, at: receipt.at }]);
  for (const [id, rows] of history) {
    const system = byId.get(id);
    if (system) system.history = rows.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 5);
  }

  // Several websites under one business with no stored Versions yet are
  // shown as location siblings (Twin Trees: one account, two locations).
  // Stored Version rows replace this.
  const websites = systems.filter(item => item.kind === "website" && item.surface.kind === "website" && !versionBySystem.has(item.id));
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
