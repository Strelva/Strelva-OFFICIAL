/**
 * Read adapter: existing workspace data -> Systems view-model.
 *
 * // reconcile with src/platform/systems
 * This is a presentation projection of data the workspace already returns
 * (managed sites, saved work, offering installations, delegations). It infers
 * no health it has not seen and no lineage that was not recorded. When the
 * platform Systems module exposes `SystemRef`s, swap this adapter for it.
 */
import type { OfferingInstallation } from "@/platform/offerings";
import type { ManagedWork, WorkspaceSnapshot, WorkspaceWork } from "@/experience/workspace/contracts";
import { sameAppHref } from "@/experience/workspace/workspace-discovery";
import {
  inquirySystemId, siteSystemId, workSystemId,
  type SystemHealth, type SystemKind, type SystemLifecycle, type SystemPossibility, type SystemVersion, type SystemView,
} from "./model";

export interface SystemsInput {
  snapshot: Pick<WorkspaceSnapshot, "workspaceId" | "workspaces" | "work" | "delegations">;
  /** Websites assigned to this business. */
  sites: readonly ManagedWork[];
  /** Businesses whose inquiries this workspace can open. */
  inquiryBusinesses?: readonly { id: string; title: string }[];
  installations?: readonly OfferingInstallation[];
  definitionNames?: ReadonlyMap<string, string>;
  /** Workspace exit stopped new work: every System is paused, records retained. */
  stopped?: boolean;
  /** Site discovery partially failed. */
  sitesUnavailable?: boolean;
}

export interface BusinessSystems {
  systems: SystemView[];
  /** Saved results that are not Systems: assessments, audits, plans, experiments. */
  files: WorkspaceWork[];
}

const WORK_KINDS: Record<string, SystemKind> = {
  applications: "app",
  "custom-applications": "app",
  scheduling: "bookings",
  documents: "document",
  tracker: "tracker",
  onboarding: "onboarding",
};

const UNCHECKED: SystemHealth = { state: "unchecked", summary: "No recent check is recorded for this system." };

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

function workLifecycle(work: WorkspaceWork, stopped: boolean): SystemLifecycle | null {
  if (stopped) return "paused";
  const status = work.operation?.status;
  if (status === "retired") return null;
  if (status === "draft" || status === "review" || status === "building") return "draft";
  return "live";
}

function workHealth(work: WorkspaceWork): SystemHealth {
  if (work.unavailableReason) return { state: "degraded", summary: work.unavailableReason };
  if (work.operation?.status === "needs_attention") return { state: "needs_you", summary: work.operation.reason || "A decision is waiting." };
  return UNCHECKED;
}

function provider(installation: OfferingInstallation | undefined): string | undefined {
  if (!installation) return undefined;
  return installation.responsibility.kind === "provider_requested" ? installation.responsibility.providerName : undefined;
}

export function readBusinessSystems(input: SystemsInput): BusinessSystems {
  const { snapshot, sites, inquiryBusinesses = [], installations = [], definitionNames = new Map(), stopped = false, sitesUnavailable = false } = input;
  const systems: SystemView[] = [];
  const files: WorkspaceWork[] = [];
  const installationFor = new Map<string, OfferingInstallation>();
  for (const installation of installations) {
    if (installation.status === "retired") continue;
    for (const resource of installation.nativeResources) installationFor.set(resource.id, installation);
  }
  const agencyNames = new Map(snapshot.workspaces.filter(item => item.kind === "agency").map(item => [item.id, item.name]));
  const delegationAgency = new Map(snapshot.delegations.filter(item => item.status === "active").map(item => [item.workId, item.agencyWorkspaceId]));

  // Websites first: for most managed clients this is the system they know.
  for (const site of sites) {
    const domain = bare(hostname(site.domain));
    const liveUrl = site.domain ? `https://${site.domain.replace(/^https?:\/\//, "")}` : undefined;
    const previewSrc = (site.previewHref && sameAppHref(site.previewHref)) || liveUrl;
    systems.push({
      id: siteSystemId(site.id),
      kind: "website",
      name: domain || site.title,
      detail: domain ? site.title : "Public website",
      lifecycle: stopped ? "paused" : "live",
      health: sitesUnavailable ? { state: "degraded", summary: "Website access could not be confirmed just now." } : UNCHECKED,
      surface: { kind: "website", domain, liveUrl, previewSrc, previewLabel: site.previewHref ? `Rendered from the saved copy of ${domain || site.title}` : `${domain || site.title}, as visitors see it now`, manageHref: site.href },
      operatedBy: site.relationship === "enterprise" ? "Your enterprise team" : "Strelva",
      connections: [],
      possibilities: [],
      versions: [],
    });
  }

  for (const business of inquiryBusinesses) {
    const site = systems.find(item => item.id === siteSystemId(business.id));
    systems.push({
      id: inquirySystemId(business.id),
      kind: "inquiries",
      name: "Inquiries",
      detail: site ? `From ${site.name}` : business.title,
      lifecycle: stopped ? "paused" : "live",
      health: UNCHECKED,
      surface: { kind: "inquiries", tenantId: business.id },
      operatedBy: site?.operatedBy,
      connections: site ? [{ id: `${business.id}:appear`, kind: "appear", target: site.name, systemId: site.id, sentence: `People ask through the contact form on ${site.name}.`, status: "connected" }] : [],
      possibilities: [],
      versions: [],
    });
    if (site) site.connections.push({ id: `${business.id}:trigger`, kind: "trigger", target: "Inquiries", systemId: inquirySystemId(business.id), sentence: "Every contact-form message becomes an inquiry.", status: "connected" });
  }

  const websiteWork: WorkspaceWork[] = [];
  for (const work of snapshot.work) {
    if (work.productId === "websites") { websiteWork.push(work); continue; }
    const kind = WORK_KINDS[work.productId];
    const lifecycle = kind ? workLifecycle(work, stopped) : null;
    if (!kind || !lifecycle) { files.push(work); continue; }
    const installation = installationFor.get(work.id);
    const versions: SystemVersion[] = [];
    if (installation) versions.push({ id: `${work.id}:offering`, relation: "version", context: snapshot.workspaces.find(item => item.id === snapshot.workspaceId)?.name || "This business", title: work.title, lineage: `Adapted from ${definitionNames.get(installation.definitionId) || installation.definitionId}, version ${installation.definitionVersion}.` });
    if (work.sourceWorkId && kind !== "document") {
      const agency = delegationAgency.get(work.id);
      versions.push({ id: `${work.id}:source`, relation: "version", context: snapshot.workspaces.find(item => item.id === snapshot.workspaceId)?.name || "This business", title: work.title, lineage: `Adapted from a source system${agency && agencyNames.get(agency) ? ` kept by ${agencyNames.get(agency)}` : " your provider keeps"}. Your records and access stay here.` });
    }
    const possibilities: SystemPossibility[] = [];
    if (kind === "app" && work.operation?.status === "draft" && installation?.status === "active") {
      possibilities.push({ id: `${work.id}:candidate`, title: `Unpublished changes to ${work.title}`, summary: "A changed version is saved but not published. People keep using the current one.", status: "exploring", affects: [workSystemId(work.id)] });
    }
    systems.push({
      id: workSystemId(work.id), kind, name: work.title,
      detail: kind === "document" && work.document ? `Revision ${work.document.revision}` : kind === "app" ? "Used by your team" : kind === "bookings" ? "Time people can reserve" : kind === "tracker" ? "Working data" : kind === "onboarding" ? "New-client intake" : "",
      lifecycle, health: workHealth(work),
      surface: { kind: "work", workId: work.id, productId: work.productId },
      operatedBy: provider(installation),
      connections: [], possibilities, versions,
    });
  }

  // A saved website build is either a Possibility for an existing site or a draft website of its own.
  for (const work of websiteWork) {
    const source = bare(hostname(work.input.sourceUrl));
    const site = systems.find(item => item.kind === "website" && item.surface.kind === "website" && ((source && item.surface.domain === source) || item.detail === work.title || item.name === work.title));
    const ready = ["review", "approved", "ready"].includes(work.operation?.status || "");
    const previewSrc = typeof work.input.candidatePreviewHref === "string" ? sameAppHref(work.input.candidatePreviewHref) || undefined : undefined;
    if (site) {
      site.possibilities.push({
        id: workSystemId(work.id),
        title: `A rebuilt ${site.name}`,
        summary: typeof work.input.summary === "string" ? work.input.summary : "The same business, pages and facts, rebuilt on Strelva's website system.",
        status: ready ? "ready" : "exploring",
        // The rebuilt site carries the contact form, so the inquiries it feeds change too.
        affects: [site.id, ...systems.filter(item => item.kind === "inquiries" && item.connections.some(connection => connection.systemId === site.id)).map(item => item.id)],
        evidence: typeof work.input.evidence === "string" ? work.input.evidence : undefined,
        previewSrc,
        openHref: `/workspace?workspaceId=${encodeURIComponent(snapshot.workspaceId)}&view=websites&work=${encodeURIComponent(work.id)}`,
      });
      continue;
    }
    if (work.operation?.status === "retired") { files.push(work); continue; }
    systems.push({
      id: workSystemId(work.id), kind: "website", name: work.title, detail: "Website draft",
      lifecycle: stopped ? "paused" : work.operation?.status === "published" ? "live" : "draft",
      health: workHealth(work),
      surface: { kind: "work", workId: work.id, productId: "websites" },
      connections: [], possibilities: [], versions: [],
    });
  }

  // Several websites under one business are location Versions of one website (Twin Trees: one account, two locations).
  const websites = systems.filter(item => item.kind === "website" && item.surface.kind === "website");
  if (websites.length > 1) for (const site of websites) {
    site.versions.push(...websites.filter(other => other.id !== site.id).map(other => ({
      id: `${site.id}->${other.id}`, relation: "version" as const, context: other.detail || other.name, title: other.name, systemId: other.id,
      lineage: "Another location's website on this account. Shared changes are not linked between them yet.",
    })));
  }

  // A Possibility is business-level: show it from every System it would change.
  for (const system of systems) for (const possibility of system.possibilities) for (const id of possibility.affects) {
    const other = systems.find(item => item.id === id);
    if (other && !other.possibilities.some(item => item.id === possibility.id)) other.possibilities.push(possibility);
  }

  return { systems, files };
}

/** A Possibility can touch several Systems; this resolves the names a customer will recognize. */
export function possibilityScope(possibility: SystemPossibility, systems: readonly SystemView[]): string[] {
  return [
    ...possibility.affects.map(id => systems.find(item => item.id === id)?.name || "A system"),
    ...(possibility.introduces || []).map(name => `New: ${name}`),
  ];
}

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
  const sources = agencyWork.filter(work => WORK_KINDS[work.productId] && work.operation?.status !== "retired").map(source => ({ source, versions: [] as AgencyLineage["sources"][number]["versions"] }));
  const byId = new Map(sources.map(entry => [entry.source.id, entry]));
  const unlinked: AgencyLineage["unlinked"] = [];
  for (const client of clients) for (const work of client.work) {
    if (!WORK_KINDS[work.productId] && work.productId !== "websites") continue;
    const entry = work.sourceWorkId ? byId.get(work.sourceWorkId) : undefined;
    const item = { businessId: client.workspace.id, businessName: client.workspace.name, work };
    if (entry) entry.versions.push(item); else unlinked.push(item);
  }
  return { sources, unlinked };
}
