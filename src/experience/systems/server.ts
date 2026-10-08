import { publishingEnabledForWorkspace } from "@/products/publishing/server";
/**
 * Server projection for the Systems experience. Server only: it reads the
 * spine, existing monitors and saved rebuilds, and runs Make real on an
 * isolated copy. The browser receives `WorkspaceSystems` and
 * `WorkspaceMakeRealResult`, never payloads, observations or activations.
 *
 * - Systems and Connections: `listBusinessSystems` (stored plus existing).
 * - Health: `healthGraphFromSystems` over the same listing, with evidence from
 *   the domain monitor, the scanner and cron heartbeats. No evidence stays
 *   `unknown`.
 * - Possibilities: a saved website rebuild becomes a Possibility of the site
 *   it rebuilds, prepared and marked Ready through src/platform/possibilities.
 */
import { checkHeartbeats } from "@/platform/infra/heartbeat";
import { getDomainHealth } from "@/lib/domain-monitor-store";
import { getScanSummaries } from "@/lib/scan-store";
import { readDailyTraffic } from "@/platform/infra/analytics/traffic";
import { readSearchConnection } from "@/platform/catalog-reports/search-connection";
import { searchConsoleObservation, trafficObservation } from "@/platform/system-health/catalog-observations";
import { readToolNoticeReceipts, toolNoticeObservations } from "@/platform/catalog-reports/tool-notices";
import { readToolReleases } from "@/platform/catalog-reports/tool-history";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { BusinessSystems, SystemListing } from "@/platform/systems/from-existing";
import { listBusinessSystems, withTenantSurfaces, type BookingView, type ExistingConnectedSite, type TenantSiteFacts } from "@/platform/systems/from-existing";
import { connectedSitesReleaseEnabled, connectedSitesReleasedFor } from "@/products/connected-sites/server";
import { connectedSitesStore } from "@/products/connected-sites/store";
import { getTenantConfig } from "@/lib/tenants";
import { siteEditingFor, type SiteEditing } from "@/products/websites/server";
import { getPublishedSiteDocument, readHostedBusinessFacts } from "@/products/websites";
import { savedCheckObservations } from "@/products/investigations/system-health";
import { createSupabaseSystemStore } from "@/platform/systems/supabase-store";
import { readBusinessVersions } from "@/platform/system-versions/supabase-store";
import type { System } from "@/platform/systems/contracts";
import {
  deriveSystemHealth,
  domainObservations,
  healthGraphFromSystems,
  heartbeatObservations,
  scanObservation,
  type HealthReason,
  type HealthStatus,
  type Observation,
  type SystemHealth,
} from "@/platform/system-health";
import { prepareIsolatedPossibility, type IsolatedSandbox, type SandboxRunOptions } from "@/platform/make-real/sandbox";
import { planFingerprint } from "@/platform/make-real/approvals";
import { bareHostname, websiteRebuildCandidate, readWebsiteRebuild, type WebsiteRebuildCandidate } from "@/products/websites/index";
import type { WorkspaceMakeRealResult, WorkspacePublishing, WorkspaceSystems } from "@/experience/workspace/contracts";
import { addPublishingSystems, type PublishingProjection } from "@/products/publishing/projection";
import { readPublishingExtras, readPublishingSnapshot } from "@/products/publishing/server";
import { receiptHeadline } from "@/products/google-listing/service";
import {
  REBUILD_SOURCE_PREFIX,
  activationViews,
  makeRealReceipts,
  revisionHistory,
  storedPossibilityViews,
  storedTargets,
  syncRebuildPossibilities,
  syncAskPageSetPossibilities,
  syncAskInquiryFollowUpPossibilities,
} from "./stored-possibilities";

export interface SystemsProjectionInput {
  listing: BusinessSystems;
  /** Public hostname of each managed site this business holds, by tenant id. */
  siteDomains: ReadonlyMap<string, string>;
  candidates: readonly WebsiteRebuildCandidate[];
  observations: readonly Observation[];
  actorId: string;
  now: number;
  /** Day and week views of a Bookings System (wellness schedule, roster), by System id. */
  bookingViews?: ReadonlyMap<string, readonly BookingView[]>;
  /** How each managed site changes, by tenant id. Absent: not known, nothing is claimed. */
  siteEditing?: ReadonlyMap<string, SiteEditing>;
  businessFactsConnected?: ReadonlySet<string>;
  /** Set while STRELVA_PUBLISHING_RELEASE is on. Null: the read failed. */
  publishing?: Omit<PublishingProjection, "listing" | "observations"> | null;
}

/** The browser-safe publishing block. Receipts become sentences here. */
export function publishingView(publishing: SystemsProjectionInput["publishing"]): WorkspacePublishing | undefined {
  if (publishing === undefined) return undefined;
  if (publishing === null) return { status: "unavailable", listings: [], websiteParts: {}, offers: [] };
  return {
    status: "ready",
    listings: publishing.listings.map((item) => ({
      systemId: item.systemId, health: item.health, healthMessage: item.healthMessage,
      receipts: item.recentReceipts.map((receipt) => ({ id: receipt.id, headline: receiptHeadline(receipt), status: receipt.status, at: receipt.createdAt })),
    })),
    websiteParts: Object.fromEntries(Object.entries(publishing.websiteParts).map(([id, parts]) => [id, parts.map(({ type, label, published, drafts }) => ({ type, label, published, drafts }))])),
    offers: publishing.offers.map((offer) => ({ ...offer })),
  };
}

/** Adds the listing and newsletter Systems and website parts to a listing.
 * A failed read leaves the listing as it was and says publishing is unavailable. */
export async function withPublishing(
  listing: BusinessSystems, actor: WorkspaceActor, now: number,
  read: { snapshot: typeof readPublishingSnapshot; extras: typeof readPublishingExtras } = { snapshot: readPublishingSnapshot, extras: readPublishingExtras },
): Promise<{ listing: BusinessSystems; observations: Observation[]; publishing: SystemsProjectionInput["publishing"] }> {
  try {
    const [snapshot, extras] = await Promise.all([read.snapshot(actor, listing.businessId), read.extras(listing)]);
    const { listing: next, observations, ...publishing } = addPublishingSystems(listing, snapshot, { ...extras, now });
    return { listing: next, observations, publishing };
  } catch {
    return { listing, observations: [], publishing: null };
  }
}

const RANK: Record<HealthStatus, number> = { healthy: 0, unknown: 1, degraded: 2, blocked: 3 };

function healthSummary(health: SystemHealth | undefined): WorkspaceSystems["systems"][number]["health"] {
  if (!health) return { status: "unknown", summary: "Nothing has checked this yet.", lastVerifiedAt: null };
  const reasons = health.reasons.filter((reason): reason is HealthReason & { effect: HealthStatus } => reason.effect !== "notice");
  const worst = [...reasons].sort((a, b) => RANK[b.effect] - RANK[a.effect])[0];
  const summary = worst?.message
    ?? (health.lastVerifiedAt ? "The latest checks passed." : "Nothing needs to keep running for this to work.");
  return { status: health.status, summary: summary.slice(0, 300), lastVerifiedAt: health.lastVerifiedAt };
}

function siteDomain(listing: SystemListing, domains: ReadonlyMap<string, string>): string | null {
  const tenantId = listing.references.tenantId;
  const domain = tenantId ? domains.get(tenantId) : undefined;
  return domain ? bareHostname(domain) : null;
}

interface RebuildPossibility {
  candidate: WebsiteRebuildCandidate;
  site: SystemListing;
  affects: System[];
  sandbox: IsolatedSandbox;
}

/** The website System a rebuild is a candidate for: its bound tenant, else its source hostname. */
function targetSite(candidate: WebsiteRebuildCandidate, listing: BusinessSystems, domains: ReadonlyMap<string, string>): SystemListing | undefined {
  const websites = listing.systems.filter((item) => item.system.kind === "website" && item.references.tenantId);
  return websites.find((item) => candidate.tenantId && item.references.tenantId === candidate.tenantId)
    ?? websites.find((item) => candidate.sourceHost && siteDomain(item, domains) === candidate.sourceHost);
}

export function rebuildPossibilityId(workId: string): string {
  return `website-rebuild:${workId}`;
}

/** Prepare every saved rebuild that targets a site this business runs. */
export async function prepareRebuildPossibilities(input: Omit<SystemsProjectionInput, "observations">): Promise<RebuildPossibility[]> {
  const at = new Date(input.now).toISOString();
  const prepared: RebuildPossibility[] = [];
  for (const candidate of input.candidates) {
    const site = targetSite(candidate, input.listing, input.siteDomains);
    if (!site) continue;
    const domain = siteDomain(site, input.siteDomains) ?? site.system.name;
    const draft = candidate.origin !== "rebuild";
    const author = candidate.origin === "agent_draft" ? "connected agent" : "agency";
    // The rebuilt site carries the contact form, so the inquiries it feeds change too.
    const inquiries = input.listing.connections
      .filter(({ connection }) => connection.kind === "appear" && connection.state !== "disconnected"
        && connection.target.type === "system" && connection.target.system.systemId === site.system.id)
      .map(({ connection }) => input.listing.systems.find((item) => item.system.id === connection.source.systemId))
      .filter((item): item is SystemListing => Boolean(item && item.system.kind === "inquiry"));
    const affects = [site.system, ...inquiries.map((item) => item.system)];
    const sandbox = await prepareIsolatedPossibility({
      businessId: input.listing.businessId,
      possibilityId: rebuildPossibilityId(candidate.workId),
      title: draft ? `A proposed change to ${domain}` : `A rebuilt ${domain}`,
      intent: draft ? `Apply the ${author}'s proposed change to ${domain}.` : `Replace ${domain} with ${candidate.title}.`,
      systems: [
        { ref: { businessId: site.system.businessId, systemId: site.system.id }, name: site.system.name, content: { website: domain, tenantId: site.references.tenantId } },
        ...inquiries.map((item) => ({ ref: { businessId: item.system.businessId, systemId: item.system.id }, name: item.system.name, content: { form: `Contact form on ${domain}` } })),
      ],
      changes: [
        { systemId: site.system.id, summary: draft ? `the ${author}'s change to ${domain}` : `the rebuilt ${domain}`, content: { website: domain, rebuildWorkId: candidate.workId, candidateRevision: candidate.candidateRevision, candidateContentHash: candidate.candidateContentHash } },
        ...inquiries.map((item) => ({ systemId: item.system.id, summary: "inquiries from the rebuilt contact form", content: { form: `Rebuilt contact form on ${domain}`, rebuildWorkId: candidate.workId } })),
      ],
      checks: [
        { id: "site-serves", description: `${domain} serves every carried-over page from the rebuilt site.` },
        ...(inquiries.length ? [{ id: "form-delivers", description: "A test message from the rebuilt contact form arrives in Inquiries." }] : []),
      ],
      ready: candidate.ready,
      actorId: input.actorId,
      at,
    });
    prepared.push({ candidate, site, affects, sandbox });
  }
  return prepared;
}

export async function projectWorkspaceSystems(input: SystemsProjectionInput): Promise<WorkspaceSystems> {
  const possibilities = await prepareRebuildPossibilities(input);
  // A rebuild that is a Possibility of an existing site is not a second website.
  const claimed = new Set(possibilities.flatMap(({ candidate, site }) => input.listing.systems
    .filter((item) => item.references.savedWorkId === candidate.workId && item.system.id !== site.system.id)
    .map((item) => item.system.id)));
  const listings = input.listing.systems.filter((item) => !claimed.has(item.system.id));
  const connections = input.listing.connections.filter(({ connection }) => !claimed.has(connection.source.systemId));
  const health = deriveSystemHealth(healthGraphFromSystems({
    systems: listings.map((item) => item.system),
    connections: connections.map((item) => item.connection),
    observations: input.observations,
  }), input.now);
  const names = new Map(listings.map((item) => [item.system.id, item.system.name]));
  return {
    status: "ready",
    systems: listings.map((item) => ({
      ref: { businessId: item.system.businessId, systemId: item.system.id },
      name: item.system.name,
      kind: item.system.kind,
      lifecycle: item.system.lifecycle,
      basis: item.basis,
      savedWorkId: item.references.savedWorkId,
      tenantId: item.references.tenantId,
      health: { ...healthSummary(health.get(item.system.id)),
        ...(input.observations.some(observation => observation.subjectId === item.system.id && observation.source === "traffic") ? { signals: input.observations.filter(observation => observation.subjectId === item.system.id && ["domain-monitor", "traffic", "search-console"].includes(observation.source)).map(observation => observation.message) } : {}),
      },
      ...(input.bookingViews?.get(item.system.id)?.length ? { views: [...input.bookingViews.get(item.system.id)!] } : {}),
      ...(item.system.kind === "website" && item.references.tenantId && input.siteEditing?.get(item.references.tenantId) ? { editing: input.siteEditing.get(item.references.tenantId)! } : {}),
      ...(item.system.kind === "website" && item.references.tenantId && input.businessFactsConnected?.has(item.references.tenantId) ? { businessFactsConnected: true } : {}),
      ...(item.connectedSite ? { connectedSite: { ...item.connectedSite } } : {}),
    })),
    connections: [...connections.map(({ connection }) => {
      const targetSystemId = connection.target.type === "system" ? connection.target.system.systemId : null;
      return {
        id: connection.id,
        sourceId: connection.source.systemId,
        kind: connection.kind,
        targetSystemId,
        targetLabel: targetSystemId ? names.get(targetSystemId) ?? "Another system" : connection.purpose ?? connection.target.type.replace("_", " "),
        state: connection.state,
        purpose: connection.purpose,
      };
    }), ...listings.flatMap(item => {
      const search = input.observations.find(observation => observation.subjectId === item.system.id && observation.source === "search-console");
      const fresh = search?.observedAt && input.now - Date.parse(search.observedAt) <= search.maxAgeSeconds * 1000;
      return search ? [{ id: `search-console:${item.system.id}`, sourceId: item.system.id, kind: "read" as const, targetSystemId: null, targetLabel: "Google Search Console", state: search.outcome === "pass" && fresh ? "connected" as const : "stale" as const,
        purpose: `${search.message} Authority: Strelva's service account was added to the property. Source of truth: Google. Freshness: daily, 07:00 UTC.` }] : [];
    })],
    ...(input.publishing !== undefined ? { publishing: publishingView(input.publishing) } : {}),
    possibilities: possibilities.map(({ candidate, sandbox, affects }) => ({
      id: sandbox.possibility.id,
      title: sandbox.possibility.title,
      summary: candidate.summary,
      status: sandbox.possibility.status === "ready" ? "ready" : "exploring",
      affects: affects.map((system) => system.id),
      evidence: candidate.evidence,
      previewHref: candidate.previewHref,
      workId: candidate.workId,
    })),
  };
}

/**
 * Evidence from the monitors that already run. A source that is missing or
 * unreadable produces `unknown` evidence, never a pass.
 */
export async function readSystemsEvidence(listing: BusinessSystems, now: number = Date.now()): Promise<Observation[]> {
  const websites = listing.systems.filter((item) => item.system.kind === "website" && item.references.tenantId);
  const inquiries = listing.systems.filter((item) => item.system.kind === "inquiry");
  const connected = listing.systems.flatMap((item) => item.connectedSite ? [connectedSiteObservation(item.system.id, item.connectedSite)] : []);
  if (!websites.length && !inquiries.length) return connected;
  const [heartbeats, domains, scans] = await Promise.all([
    checkHeartbeats(now).catch(() => []),
    getDomainHealth().catch(() => null),
    getScanSummaries(websites.map((item) => item.references.tenantId!)).catch(() => ({} as Record<string, null>)),
  ]);
  const observations: Observation[] = [];
  await Promise.all(websites.map(async (site) => {
    const tenantId = site.references.tenantId!;
    observations.push(...domainObservations(site.system.id, domains?.results.find((result) => result.tenantId === tenantId) ?? null, domains?.scannedAt ?? null));
    observations.push(scanObservation(site.system.id, scans[tenantId] ?? null));
    observations.push(...heartbeatObservations(site.system.id, heartbeats, ["domain-monitor", "portfolio-scan"]));
    const [daily, search] = await Promise.all([
      readDailyTraffic(tenantId, 30).catch(() => null),
      readSearchConnection(tenantId, listing.businessId).catch(() => null),
    ]);
    observations.push(trafficObservation(site.system.id, daily), searchConsoleObservation(site.system.id, search));
  }));
  for (const inquiry of inquiries) {
    observations.push(inquiryFormUnchecked(inquiry.system.id));
    observations.push(...heartbeatObservations(inquiry.system.id, heartbeats, ["inquiry-follow-ups"]));
  }
  return [...observations, ...connected];
}

/** A connected site is "reporting" while its script sends visits; silence for a week is worth a look. */
export function connectedSiteObservation(subjectId: string, site: { siteHost: string; verified: boolean; lastEventAt: string | null }): Observation {
  if (!site.verified) return { subjectId, signal: "connected_site.reporting", outcome: "unknown", observedAt: null, maxAgeSeconds: 7 * 24 * 3600, source: "connected-site", message: `Waiting for proof that ${site.siteHost} is this business's site.` };
  if (!site.lastEventAt) return { subjectId, signal: "connected_site.reporting", outcome: "unknown", observedAt: null, maxAgeSeconds: 7 * 24 * 3600, source: "connected-site", message: `${site.siteHost} has not reported a visit yet. Check the Strelva script is on the page.` };
  return { subjectId, signal: "connected_site.reporting", outcome: "pass", observedAt: site.lastEventAt, maxAgeSeconds: 7 * 24 * 3600, source: "connected-site", message: `${site.siteHost} is reporting visits.` };
}

/** Follow-ups running says nothing about whether the form on the site works. */
export function inquiryFormUnchecked(subjectId: string): Observation {
  return { subjectId, signal: "inquiry.publication", outcome: "unknown", observedAt: null, maxAgeSeconds: 7 * 24 * 3600, source: "inquiry-capability", message: "Whether the form on the site delivers has not been checked." };
}

/** Connected sites join the projection only while their release is on for this business. */
function connectedSitesReader(actor: WorkspaceActor, businessId: string): (() => Promise<ExistingConnectedSite[]>) | undefined {
  if (!connectedSitesReleaseEnabled()) return undefined;
  return async () => !(await connectedSitesReleasedFor(actor, businessId).catch(() => false)) ? [] : (await connectedSitesStore().list(actor, businessId)).map((site) => ({
    id: site.id, label: site.label, siteUrl: site.siteUrl, siteHost: site.siteHost, status: site.status,
    verifiedAt: site.verifiedAt, lastEventAt: site.lastEventAt, createdAt: site.createdAt, updatedAt: site.updatedAt,
  }));
}

export interface LiveSystemsDeps {
  actor: WorkspaceActor;
  businessId: string;
  siteDomains: ReadonlyMap<string, string>;
  savedWork: ReadonlyArray<{ id: string; productId: string; resourceKind: string; title?: string | null; payload: unknown }>;
  now?: number;
  /** An owner or admin: stored Possibilities may be created or refreshed on read. */
  canWrite?: boolean;
}

/**
 * What each held managed site runs on the tenant side, read from the tenant's
 * own config. A failed read adds nothing for that site: no Store Connection
 * and no booking views are claimed without the fact.
 */
async function readTenantSiteFacts(listing: BusinessSystems, siteDomains: ReadonlyMap<string, string>): Promise<{ facts: Map<string, TenantSiteFacts>; editing: Map<string, SiteEditing>; businessFactsConnected: Set<string> }> {
  const tenantIds = [...new Set(listing.systems.flatMap((item) => item.system.kind === "website" && item.references.tenantId ? [item.references.tenantId] : []))];
  const facts = new Map<string, TenantSiteFacts>();
  const editing = new Map<string, SiteEditing>();
  const businessFactsConnected = new Set<string>();
  await Promise.all(tenantIds.map(async (tenantId) => {
    const tenant = await getTenantConfig(tenantId).catch(() => undefined);
    if (!tenant || tenant.id !== tenantId) return;
    const domain = siteDomains.get(tenantId);
    facts.set(tenantId, { features: tenant.features ?? [], domain: domain ? bareHostname(domain) : null });
    editing.set(tenantId, siteEditingFor(tenant));
    if (process.env.STRELVA_WEBSITE_BUSINESS_FACTS_ENABLED === "1") {
      try {
        const document = await getPublishedSiteDocument(tenantId);
        if (document?.businessRecord?.bindings.length && await readHostedBusinessFacts(tenantId)) businessFactsConnected.add(tenantId);
      } catch { /* A failed runtime read never claims a working Connection. */ }
    }
  }));
  return { facts, editing, businessFactsConnected };
}

/** Saved checks become health evidence of the Systems they watch. */
export function savedCheckEvidence(listing: BusinessSystems, siteDomains: ReadonlyMap<string, string>, savedWork: LiveSystemsDeps["savedWork"]): Observation[] {
  return savedCheckObservations(savedWork, listing.systems.map((item) => ({
    systemId: item.system.id, savedWorkId: item.references.savedWorkId, domain: item.system.kind === "website" ? siteDomain(item, siteDomains) : null,
  })));
}

async function liveProjectionInput(deps: LiveSystemsDeps): Promise<SystemsProjectionInput> {
  const now = deps.now ?? Date.now();
  // Connected sites are read here only because Systems is already on for this business.
  const spine = await listBusinessSystems(deps.actor, deps.businessId, { store: createSupabaseSystemStore(), connectedSites: connectedSitesReader(deps.actor, deps.businessId) });
  const tenantFacts = await readTenantSiteFacts(spine, deps.siteDomains);
  const { bookingViews, ...surfaced } = withTenantSurfaces(spine, tenantFacts.facts);
  const published = await publishingEnabledForWorkspace(surfaced.businessId, deps.actor) ? await withPublishing(surfaced, deps.actor, now) : null;
  const listing = published?.listing ?? surfaced;
  const noticeRows = await readToolNoticeReceipts(deps.actor, deps.businessId, new Date(now - 7 * 86400_000).toISOString()).catch(() => null);
  return {
    listing,
    siteDomains: deps.siteDomains,
    candidates: deps.savedWork.flatMap((work) => websiteRebuildCandidate(work) ?? []),
    observations: [...await readSystemsEvidence(listing, now), ...savedCheckEvidence(listing, deps.siteDomains, deps.savedWork), ...(published?.observations ?? []),
      ...toolNoticeObservations(noticeRows ?? [], listing.systems.map(item => ({ systemId: item.system.id, workId: item.references.savedWorkId })))],
    actorId: deps.actor.userId,
    now,
    bookingViews,
    siteEditing: tenantFacts.editing,
    businessFactsConnected: tenantFacts.businessFactsConnected,
    ...(published ? { publishing: published.publishing } : {}),
  };
}

/**
 * Stored Version lineage joined onto the projection. A hidden same-business
 * source is never listed as a System. If lineage cannot be read, the
 * Systems still show and no lineage is claimed (`versions` stays absent).
 */
export function withVersions(projection: WorkspaceSystems, lineage: { hiddenSources: string[]; versions: NonNullable<WorkspaceSystems["versions"]> } | null): WorkspaceSystems {
  if (!lineage || projection.status !== "ready") return projection;
  const hidden = new Set(lineage.hiddenSources);
  return {
    ...projection,
    systems: projection.systems.filter((system) => !hidden.has(system.ref.systemId)),
    connections: projection.connections.filter((connection) => !hidden.has(connection.sourceId) && !(connection.targetSystemId && hidden.has(connection.targetSystemId))),
    possibilities: projection.possibilities.map((possibility) => ({ ...possibility, affects: possibility.affects.filter((id) => !hidden.has(id)) })),
    versions: lineage.versions,
  };
}

/** The `systems` field of GET /api/workspace. A failed spine read is reported, not hidden. */
export async function readWorkspaceSystems(deps: LiveSystemsDeps): Promise<WorkspaceSystems> {
  try {
    const input = await liveProjectionInput(deps);
    const projection = await projectWorkspaceSystems(input);
    const stored = await withStoredPossibilities(projection, input, deps).catch(() => projection);
    const lineage = await readBusinessVersions(deps.actor, deps.businessId).catch(() => null);
    const releases = await readToolReleases(deps.actor, deps.businessId);
    const releaseHistory = releases.flatMap(release => {
      const system = input.listing.systems.find(item => item.references.savedWorkId === release.workId);
      return system ? [{ systemId: system.system.id, id: `tool-release:${release.workId}:${release.version}`, at: release.at,
        sentence: `Strelva ${release.provenance === "rollback" ? "restored" : "released"} ${system.system.name}, release ${release.version}.` }] : [];
    });
    return withVersions({ ...stored, history: [...(stored.history ?? []), ...releaseHistory] }, lineage);
  } catch {
    return { status: "unavailable", systems: [], connections: [], possibilities: [] };
  }
}

const HANDLED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Possibilities in Postgres, Make real activations, History and Strelva
 * handled receipts, laid over the per-request projection. A stored
 * Possibility replaces the per-request one for the same rebuild. Any read
 * failure leaves the projection as it was and claims none of these.
 */
export async function withStoredPossibilities(projection: WorkspaceSystems, input: SystemsProjectionInput, deps: LiveSystemsDeps): Promise<WorkspaceSystems> {
  if (projection.status !== "ready") return projection;
  const [{ createSupabasePossibilityRepository }, { createSupabaseActivationRepository }, { createSupabaseRevisionContent }, { createSystemStoreLiveSystems }] = await Promise.all([
    import("@/platform/possibilities/supabase-repository"), import("@/platform/make-real/supabase-repository"),
    import("@/platform/make-real/supabase-content"), import("@/platform/make-real/systems-adapter"),
  ]);
  const store = createSupabaseSystemStore();
  const repo = createSupabasePossibilityRepository(deps.actor);
  const live = createSystemStoreLiveSystems({ store, content: createSupabaseRevisionContent(deps.actor), actor: deps.actor });
  const targets = storedTargets(input.listing, input.candidates, (candidate) => {
    const site = targetSite(candidate, input.listing, input.siteDomains);
    return site ? { site, domain: siteDomain(site, input.siteDomains) ?? site.system.name } : undefined;
  });
  const revisions = new Map(input.listing.systems.flatMap((item) => item.provenance === "stored" && item.system.currentRevision
    ? [[item.system.id, { revisionId: item.system.currentRevision.revisionId, number: item.system.currentRevision.number }] as const] : []));
  const rebuilds = await syncRebuildPossibilities({
    repo, live, businessId: deps.businessId, targets, revisions, actorId: deps.actor.userId,
    at: new Date(input.now).toISOString(), canWrite: deps.canWrite === true,
  });
  const websiteStored = await syncAskPageSetPossibilities({
    repo, live, stored: rebuilds, actorId: deps.actor.userId, at: new Date(input.now).toISOString(),
    canWrite: deps.canWrite === true, read: workId => readWebsiteRebuild(deps.actor, workId),
  });
  const { askInquiryFollowUpStillCurrent } = await import("@/products/inquiries/server");
  const stored = await syncAskInquiryFollowUpPossibilities({ repo, live, stored: websiteStored, actorId: deps.actor.userId, at: new Date(input.now).toISOString(), canWrite: deps.canWrite === true, current: selection => askInquiryFollowUpStillCurrent(deps.actor, selection) });
  const activations = createSupabaseActivationRepository(deps.actor);
  const withActivation = await Promise.all(stored.map(async ({ possibility }) => ({
    possibility,
    activation: possibility.activationId ? await activations.get(deps.businessId, possibility.activationId).catch(() => null) : null,
  })));
  const storedWork = new Set(stored.flatMap(({ sourceRef }) => sourceRef?.startsWith(REBUILD_SOURCE_PREFIX) ? [sourceRef.slice(REBUILD_SOURCE_PREFIX.length)] : []));
  const visible = new Set(projection.systems.map((system) => system.ref.systemId));
  const storedSystems = input.listing.systems.filter((item) => item.provenance === "stored" && visible.has(item.system.id)).slice(0, 12);
  const history = (await Promise.all(storedSystems.map(async (item) => {
    const detail = await store.readSystem(deps.actor, { businessId: deps.businessId, systemId: item.system.id }).catch(() => null);
    return detail ? revisionHistory(item.system.id, detail.revisions) : [];
  }))).flat();
  const running = withActivation.flatMap((row) => row.activation && row.activation.status !== "made_real" && row.activation.status !== "rolled_back" ? [{ possibility: row.possibility, activation: row.activation }] : []);
  return {
    ...projection,
    possibilities: [
      ...projection.possibilities.filter((item) => !storedWork.has(item.workId)),
      ...storedPossibilityViews(stored, input.candidates),
    ],
    activations: activationViews(running),
    history,
    handled: makeRealReceipts(withActivation, input.now - HANDLED_WINDOW_MS),
  };
}

/**
 * Make real on an isolated copy. Returns null when the possibility is not
 * one this business has. Callers check workspace permission first; the
 * sandbox still refuses to activate without it.
 */
export async function makeRealInSandbox(
  input: Omit<SystemsProjectionInput, "observations">,
  actor: WorkspaceActor,
  possibilityId: string,
  permission: { canActivate: boolean; reason?: string },
  options: SandboxRunOptions = {},
): Promise<WorkspaceMakeRealResult | null> {
  const prepared = (await prepareRebuildPossibilities(input)).find((item) => item.sandbox.possibility.id === possibilityId);
  if (!prepared) return null;
  const { activation, view, stoppedBefore } = await prepared.sandbox.run(actor, permission, options);
  // Step labels name Systems by id; customers read names.
  const names = new Map(prepared.affects.map((system) => [system.id, system.name]));
  const readable = (label: string) => [...names].reduce((text, [id, name]) => text.replaceAll(id, name), label);
  const domain = siteDomain(prepared.site, input.siteDomains) ?? prepared.site.system.name;
  return {
    isolated: true,
    status: activation.status,
    headline: view.headline,
    done: view.done.map((item) => ({ label: readable(item.label), mode: item.mode ?? null })),
    waiting: view.waiting.map((item) => ({ label: readable(item.label), reason: readable(item.reason) })),
    unknown: view.unknown.map((item) => readable(item.label)),
    notStarted: stoppedBefore.map(readable),
    liveUnchanged: view.liveUnchanged,
    notConnected: [`Publishing the rebuilt site at ${domain}`, ...(prepared.affects.length > 1 ? ["Sending contact-form messages from the rebuilt site to Inquiries"] : [])],
  };
}

export async function makeRealForWorkspace(deps: LiveSystemsDeps, possibilityId: string, permission: { canActivate: boolean; reason?: string }, options: SandboxRunOptions = {}): Promise<WorkspaceMakeRealResult | null> {
  const input = await liveProjectionInput(deps);
  return makeRealInSandbox(input, deps.actor, possibilityId, permission, options);
}

/** A Ready plan as Needs you sees it: one owner decision per plan. */
export interface ReadyMakeRealPlan {
  possibilityId: string;
  candidateRevision: number;
  /** Covers every effect, change, connection and introduced System of this candidate. */
  fingerprint: string;
  title: string;
  intent: string;
  /** The Systems it changes, by name. */
  affects: string[];
  /** It brings a new System live (system.go_live) rather than changing a live one. */
  introducesSystem: boolean;
  /** The System page the owner opens to see it. */
  systemId: string;
  /** The rebuild it came from, so a stored live plan of the same rebuild replaces it in Needs you. */
  sourceRebuild?: string;
}

/** Every Ready Possibility of this business, for Needs you. */
export async function readyMakeRealPlans(deps: LiveSystemsDeps): Promise<ReadyMakeRealPlan[]> {
  const input = await liveProjectionInput(deps);
  return (await prepareRebuildPossibilities(input))
    .filter((item) => item.sandbox.possibility.status === "ready")
    .map((item) => {
      const p = item.sandbox.possibility;
      return {
        possibilityId: p.id,
        candidateRevision: p.candidateRevision,
        fingerprint: planFingerprint(p),
        title: p.title,
        intent: p.intent,
        affects: item.affects.map((system) => system.name),
        introducesSystem: p.introduces.length > 0,
        systemId: item.site.system.id,
        sourceRebuild: item.candidate.workId,
      };
    });
}
