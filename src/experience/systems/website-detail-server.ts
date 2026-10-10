/**
 * Server loader for the website System page's own lists. Server only.
 *
 * The System and its tenant come from the actor-checked Systems listing
 * (listBusinessSystems rechecks membership, and an agency sees only its
 * assigned work), so every tenant read below is for a site this business
 * holds. Each source is read where it already lives and nothing is copied:
 *
 * - Domains: the operator's one domain view (claims + domain monitor).
 * - Waiting on you: Needs you items for this System, filtered from the same
 *   list Home shows (or, with Needs you off, the tenant's pending owner
 *   asks), content drafts no ask already covers, and a hosted candidate
 *   awaiting approval.
 * - Requests: tenant change requests and service requests about this site.
 * - History: content_versions, site_snapshots, website_documents revisions
 *   (with linked-site cutovers) and shipped repo changes.
 *
 * A source that cannot be read is named in `unavailable`; it never reads as
 * empty.
 */
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { listBusinessSystems } from "@/platform/systems/from-existing";
import { createSupabaseSystemStore } from "@/platform/systems/supabase-store";
import { loadDomainView } from "@/platform/operator-queue/domain-view-loader";
import { getEvents } from "@/lib/events";
import { listDrafts } from "@/lib/storage/draft-store";
import { getRecentVersions } from "@/lib/storage/version-store";
import { getSiteSnapshots } from "@/lib/storage/site-snapshot-store";
import { selectWebsiteRequestHistory } from "@/lib/website-history";
import { tenantEventItem } from "@/platform/needs-you/adapters";
import { needsYouReleaseEnabled, needsYouService } from "@/experience/workspace/needs-you-server";
import { PostgresServiceRequestStore } from "@/platform/service-requests";
import { websiteDocumentStore } from "@/products/websites";
import { websiteRebuildReleaseEnabled } from "@/products/websites/index";
import { createSiteChangeStore } from "@/products/websites/index";
import { reconcileWebsiteSystemReleases } from "@/products/websites/index";
import { connectedSitesReleaseEnabled, connectedSitesReleasedFor, readConnectedSites, type ConnectedSitesOverview } from "@/products/connected-sites/server";
import { buildWebsiteSystemDetail, type WebsiteDetailInputs, type WebsiteDomainItem, type WebsiteSystemDetail } from "./website-detail";

export interface WebsiteDetailSources {
  listSystems: typeof listBusinessSystems;
  domains: typeof loadDomainView;
  events: typeof getEvents;
  drafts: typeof listDrafts;
  versions: typeof getRecentVersions;
  snapshots: typeof getSiteSnapshots;
  needsYou: () => { enabled: boolean; list: (actor: WorkspaceActor, workspaceId: string) => Promise<{ items: Array<{ id: string; systemId: string | null; sourceId: string; title: string; detail: string | null; openedAt: string; openHref: string | null }> }> };
  serviceRequests: (actor: WorkspaceActor, businessId: string) => Promise<Array<{ id: string; status: string; outcome: string; createdAt: string; context: Record<string, unknown>; deliveryCommitment?: { status: string } | null }>>;
  documents: Pick<typeof websiteDocumentStore, "list" | "receipts" | "linkedPublications">;
  rebuild: (actor: WorkspaceActor, workId: string) => Promise<{ rebuild: { status: string; candidate: { revision: number } | null; history: Array<{ at: string }> } } | null>;
  /** Null while STRELVA_CONNECTED_SITES_RELEASE is off. */
  connectedSites: (actor: WorkspaceActor, businessId: string) => Promise<ConnectedSitesOverview> | null;
  repoChanges?: ReturnType<typeof createSiteChangeStore>["list"];
  reconcileReleases?: typeof reconcileWebsiteSystemReleases;
}

const liveSources: WebsiteDetailSources = {
  listSystems: listBusinessSystems,
  domains: loadDomainView,
  events: getEvents,
  drafts: listDrafts,
  versions: getRecentVersions,
  snapshots: getSiteSnapshots,
  needsYou: () => ({ enabled: needsYouReleaseEnabled(), list: (actor, workspaceId) => needsYouService().list(actor, workspaceId) }),
  serviceRequests: (actor, businessId) => PostgresServiceRequestStore.list(actor, { businessId }),
  documents: websiteDocumentStore,
  repoChanges: (actor, businessId, systemId) => createSiteChangeStore().list(actor, businessId, systemId),
  reconcileReleases: reconcileWebsiteSystemReleases,
  rebuild: async (actor, workId) => {
    if (!websiteRebuildReleaseEnabled()) return null;
    const { readWebsiteRebuild } = await import("@/products/websites/index");
    return readWebsiteRebuild(actor, workId);
  },
  connectedSites: (actor, businessId) => connectedSitesReleaseEnabled()
    ? connectedSitesReleasedFor(actor, businessId).catch(() => false).then((on) => on ? readConnectedSites(actor, businessId) : { sites: [], inquiries: [] })
    : null,
};

const DOMAIN_STATES = new Set(["verified", "pending", "misconfigured", "conflict", "error", "not_claimed"]);

async function read<T>(label: string, unavailable: string[], fallback: T, run: () => Promise<T>): Promise<T> {
  try { return await run(); } catch { unavailable.push(label); return fallback; }
}

/** Null when the System is not a website this actor can see in this business. */
export async function readWebsiteSystemDetail(actor: WorkspaceActor, businessId: string, systemId: string, sources: WebsiteDetailSources = liveSources): Promise<WebsiteSystemDetail | null> {
  const connectedRead = sources.connectedSites(actor, businessId);
  const connected = connectedRead ? await connectedRead.catch(() => null) : null;
  const listing = await sources.listSystems(actor, businessId, {
    store: createSupabaseSystemStore(),
    ...(connected ? { connectedSites: async () => connected.sites.map(item => ({ id: item.id, label: item.label, siteUrl: item.siteUrl, siteHost: item.siteHost, status: item.status, verifiedAt: item.verifiedAt, lastEventAt: item.lastEventAt, createdAt: item.createdAt, updatedAt: item.updatedAt })) } : {}),
  });
  const site = listing.systems.find(item => item.system.id === systemId);
  if (!site || site.system.kind !== "website") return null;
  const { tenantId, savedWorkId } = site.references;
  const unavailable: string[] = [];
  if (site.system.origin && sources.reconcileReleases) {
    await read("System release history", unavailable, 0, () => sources.reconcileReleases!(actor, businessId, {
      systemId, origin: site.system.origin!, tenantId,
    }));
  }
  if (connectedRead && !connected) unavailable.push("Connected site");
  const connectedSite = site.references.connectedSiteId ? connected?.sites.find(item => item.id === site.references.connectedSiteId) : undefined;
  const workspaceHref = (workId: string) => `/workspace?${new URLSearchParams({ workspaceId: businessId, view: "websites", work: workId })}`;

  const [domainRows, events, drafts, versions, snapshots, decisions, services, documents, linked, rebuild, repoChanges] = await Promise.all([
    tenantId ? read("Domains", unavailable, null, () => sources.domains([{ tenantId, label: site.system.name }])) : Promise.resolve(null),
    tenantId ? read("Requests and pending changes", unavailable, [], () => sources.events(tenantId, { limit: 100 })) : Promise.resolve([]),
    tenantId ? read("Drafts", unavailable, {} as Record<string, boolean>, () => sources.drafts(tenantId)) : Promise.resolve({} as Record<string, boolean>),
    tenantId ? read("Content history", unavailable, [], () => sources.versions(tenantId, 30)) : Promise.resolve([]),
    tenantId ? read("Saved copies", unavailable, [], () => sources.snapshots(tenantId, 12)) : Promise.resolve([]),
    (async () => {
      const needsYou = sources.needsYou();
      if (!needsYou.enabled) return null;
      return read("Decisions", unavailable, null, async () => (await needsYou.list(actor, businessId)).items);
    })(),
    read("Service requests", unavailable, [], () => sources.serviceRequests(actor, businessId)),
    savedWorkId ? read("Site revisions", unavailable, null, async () => {
      const key = { workspaceId: businessId, workId: savedWorkId };
      const [rows, receipts] = await Promise.all([sources.documents.list(actor, key), sources.documents.receipts(actor, key)]);
      return { rows, receipts };
    }) : Promise.resolve(null),
    savedWorkId && sources.documents.linkedPublications ? read("Site replacements", unavailable, [], () => sources.documents.linkedPublications!(actor, { workspaceId: businessId, workId: savedWorkId })) : Promise.resolve([]),
    savedWorkId ? read("Site review", unavailable, null, () => sources.rebuild(actor, savedWorkId)) : Promise.resolve(null),
    sources.repoChanges ? read("Repo deploy history", unavailable, [], () => sources.repoChanges!(actor, businessId, systemId)) : Promise.resolve([]),
  ]);

  const connectedDomains: WebsiteDomainItem[] = connectedSite ? [{
    hostname: connectedSite.siteHost, state: connectedSite.verifiedAt ? "verified" : "pending",
    label: connectedSite.verifiedAt ? "Proven to be this business's" : "Waiting for proof it's yours",
    lastCheckedAt: connectedSite.verifiedAt, whoCanChange: "Your site's builder; Strelva never changes it.",
  }] : [];
  const tenantDomains: WebsiteDomainItem[] = (domainRows?.rows ?? []).map(row => ({
    hostname: row.domain,
    state: (DOMAIN_STATES.has(row.verification.status) ? row.verification.status : "pending") as WebsiteDomainItem["state"],
    label: row.verification.label,
    lastCheckedAt: row.lastCheckedAt,
    whoCanChange: row.whoCanChange,
  }));
  // The connected site's identity survives a hosted rebuild. Its earlier
  // ownership proof must not hide current hosted routing checks or domains.
  // For the same hostname the tenant domain view owns the current status.
  const domains = [...new Map([...connectedDomains, ...tenantDomains]
    .map(domain => [domain.hostname.toLowerCase().replace(/\.$/, ""), domain])).values()];

  // The same items as Home's Needs you, filtered to this System; with Needs
  // you off, the tenant's own pending owner asks, classified the same way.
  const decisionRows: WebsiteDetailInputs["decisions"] = decisions
    ? decisions.filter(item => item.systemId === systemId || (tenantId !== null && item.sourceId.startsWith(`${tenantId}:`)))
      .map(item => ({ id: item.id, title: item.title, detail: item.detail, openedAt: item.openedAt, openHref: item.openHref }))
    : events.filter(event => event.status === "pending" && tenantEventItem(event)?.route === "owner_decides")
      .map(event => ({ id: event.id, title: event.title, detail: event.body || null, openedAt: event.createdAt, openHref: null }));

  const published = new Set((documents?.receipts ?? []).filter(receipt => receipt.status === "published").map(receipt => `${receipt.candidateRevision}:${receipt.artifactHash}`));
  const reviewing = rebuild?.rebuild.status === "review_ready" && rebuild.rebuild.candidate ? rebuild.rebuild.candidate : null;
  const aboutThisSite = (context: Record<string, unknown>) => context.systemId === systemId || (tenantId !== null && (context.tenantId === tenantId || context.siteId === tenantId));

  return buildWebsiteSystemDetail({
    systemId,
    actorId: actor.userId,
    workspaceId: businessId,
    workId: savedWorkId,
    domains,
    decisions: decisionRows,
    draftSections: Object.entries(drafts).filter(([, present]) => present).map(([section]) => section),
    siteReview: reviewing && savedWorkId ? { workId: savedWorkId, revision: reviewing.revision, at: rebuild?.rebuild.history.at(-1)?.at ?? null, href: workspaceHref(savedWorkId) } : null,
    changeRequests: selectWebsiteRequestHistory(events),
    serviceRequests: services.filter(row => row.status !== "draft" && aboutThisSite(row.context))
      .map(row => ({ id: row.id, outcome: row.outcome, createdAt: row.createdAt, status: row.status, commitment: row.deliveryCommitment?.status ?? null })),
    contentVersions: versions,
    snapshots,
    documentRevisions: (documents?.rows ?? []).map(row => ({ revision: row.revision, contentHash: row.contentHash, createdAt: row.createdAt, createdBy: row.createdBy, published: published.has(`${row.revision}:${row.contentHash}`) })),
    linkedPublications: linked,
    repoDeployments: repoChanges.flatMap(request => request.receipts.filter(receipt => receipt.kind === "deployed" && receipt.commitSha && receipt.deploymentUrl && receipt.readBack)
      .map(receipt => ({ id: receipt.id, requestId: request.id, title: request.request,
        commitSha: receipt.commitSha!, deploymentUrl: receipt.deploymentUrl!, readBack: receipt.readBack!, recordedAt: receipt.recordedAt }))),
    ...(connectedSite ? { connectedSite: {
      siteId: connectedSite.id, siteHost: connectedSite.siteHost, verified: connectedSite.verifiedAt !== null,
      install: connectedSite.verifiedAt || !connectedSite.verificationToken ? null : connectedSite.snippet,
      lastEventAt: connectedSite.lastEventAt, activity: connectedSite.activity,
      inquiries: (connected?.inquiries ?? []).filter(item => item.siteId === connectedSite.id).slice(0, 10)
        .map(item => ({ id: item.id, name: item.name, email: item.email, message: item.message, capturedAt: item.capturedAt })),
    } } : {}),
    unavailable,
  });
}
