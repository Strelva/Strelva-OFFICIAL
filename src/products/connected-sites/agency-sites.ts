/**
 * The agency's Client websites view, server side. Server only.
 *
 * Reads every staffed client's website, what it is built with (from the live
 * page), and whether the Strelva lines are installed and reporting. An agency
 * can get the lines and per-platform steps, and check installs, in bulk,
 * without leaving Clients. Nothing on a client's site changes and nothing is
 * emailed. Every agency, Strelva Agency included, takes this same path: no
 * agency is recognised by name.
 */
import { z } from "zod";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { WorkspaceConflictError, WorkspaceStoreError } from "@/platform/workspaces/types";
import {
  CLIENT_BULK_LIMIT, DETECTION_STALE_MS, clientAddress, clientSiteHealth, type AgencyClientSiteRow, type AgencyClientSitesView, type ClientDetection,
} from "./agency-sites-model";
import { connectedSiteChangesStore, type ConnectedSiteChangesStore } from "./changes-store";
import type { ConnectedSite, SitePlatform } from "./contracts";
import { installStepsText } from "./install-guides";
import { keepYourSiteReleasedFor } from "./keep-your-site-release";
import { checkConnectedSite, fetchSiteFingerprint, recordDetectedBuilder } from "./site-checks";
import { ConnectedSiteInputError } from "./store";

export { CLIENT_BULK_LIMIT, DETECTION_STALE_MS };

const CONCURRENCY = 4;
const MAX_PAGES = 10;

export interface AgencySitesDeps {
  changes?: ConnectedSiteChangesStore;
  released?: (actor: WorkspaceActor, workspaceId: string) => Promise<boolean>;
  fingerprint?: typeof fetchSiteFingerprint;
  normalizeSiteUrl?: (raw: string) => { siteUrl: string; siteHost: string };
  connectSite?: (actor: WorkspaceActor, raw: unknown) => Promise<ConnectedSite>;
  verifySite?: (actor: WorkspaceActor, businessId: string, siteId: string, deps?: { observe?: (site: ConnectedSite, html: string) => Promise<unknown> }) => Promise<ConnectedSite>;
  checkSite?: typeof checkConnectedSite;
  present?: (site: ConnectedSite) => { snippet: { script: string; meta: string | null }; systemId: string } & Record<string, unknown>;
  now?: () => number;
}

/** Lazy, so this module and the product entry point never import each other at load. */
async function productServer() {
  return import("./server");
}

async function mapLimit<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index]!);
    }
  }));
  return results;
}

/** One page of the clients this person is staffed on, each marked with whether keep your site is on for it. */
export async function readAgencyClientSites(actor: WorkspaceActor, agencyId: string, cursor: { name: string; id: string } | null = null, deps: AgencySitesDeps = {}): Promise<AgencyClientSitesView> {
  const page = await (deps.changes ?? connectedSiteChangesStore()).agencyClientSites(actor, agencyId, cursor);
  const released = deps.released ?? ((who, workspaceId) => keepYourSiteReleasedFor(who, workspaceId));
  const now = deps.now?.() ?? Date.now();
  const clients: AgencyClientSiteRow[] = await Promise.all(page.clients.map(async row => ({
    ...row,
    enabled: await released(actor, row.workspaceId).catch(() => false),
    health: row.site ? clientSiteHealth(row.site, now) : null,
  })));
  return { clients, nextCursor: page.nextCursor };
}

/** Re-read the page rows server-side: only clients this person is staffed on, with keep your site on, are acted on. */
async function actionableRows(actor: WorkspaceActor, agencyId: string, workspaceIds: string[], deps: AgencySitesDeps): Promise<Map<string, AgencyClientSiteRow>> {
  const wanted = new Set(z.array(z.string().uuid()).min(1).max(CLIENT_BULK_LIMIT).parse(workspaceIds));
  const found = new Map<string, AgencyClientSiteRow>();
  let cursor: { name: string; id: string } | null = null;
  for (let pages = 0; pages < MAX_PAGES && found.size < wanted.size; pages += 1) {
    const view: AgencyClientSitesView = await readAgencyClientSites(actor, agencyId, cursor, deps);
    for (const row of view.clients) if (wanted.has(row.workspaceId) && row.enabled) found.set(row.workspaceId, row);
    if (!view.nextCursor) break;
    cursor = view.nextCursor;
  }
  return found;
}

export interface ClientCheckResult { workspaceId: string; status: "ok" | "failed" | "skipped"; message?: string }
export interface ClientDetectResult extends ClientCheckResult { detection?: ClientDetection }

/** Only our own plain-words refusals reach the screen; anything else is a general sentence. */
const refusal = (error: unknown, fallback: string) =>
  error instanceof WorkspaceConflictError || error instanceof ConnectedSiteInputError || error instanceof WorkspaceStoreError ? error.message : fallback;

/** Read each client's live page and record what it is built with. Concurrency is bounded; one failure never stops the rest. */
export async function detectClientSites(actor: WorkspaceActor, agencyId: string, workspaceIds: string[], deps: AgencySitesDeps = {}): Promise<ClientDetectResult[]> {
  const rows = await actionableRows(actor, agencyId, workspaceIds, deps);
  const changes = deps.changes ?? connectedSiteChangesStore();
  const normalize = deps.normalizeSiteUrl ?? (await productServer()).normalizeSiteUrl;
  const fingerprint = deps.fingerprint ?? fetchSiteFingerprint;
  const targets = [...new Set(workspaceIds)];
  return mapLimit(targets, CONCURRENCY, async (workspaceId): Promise<ClientDetectResult> => {
    const row = rows.get(workspaceId);
    if (!row) return { workspaceId, status: "skipped", message: "Keep your site isn't on for this client." };
    const address = clientAddress(row);
    if (!address) return { workspaceId, status: "skipped", message: "No website on record." };
    try {
      const { siteUrl, siteHost } = normalize(address);
      const read = await fingerprint(siteUrl);
      const detection = await changes.recordDetection(actor, workspaceId, {
        siteUrl, siteHost, platform: read.reachable ? read.detection.platform : "unknown", evidence: read.reachable ? read.detection.evidence : [], reachable: read.reachable,
      });
      return { workspaceId, status: "ok", detection };
    } catch (error) {
      return { workspaceId, status: "failed", message: refusal(error, "Couldn't read this site just now.") };
    }
  });
}

/** Get the two lines for a client's site, with the steps for what it is built with. The agency is the recorded installer. */
export async function connectClientSite(actor: WorkspaceActor, agencyId: string, workspaceId: string, deps: AgencySitesDeps = {}) {
  const row = (await actionableRows(actor, agencyId, [workspaceId], deps)).get(workspaceId);
  if (!row) throw new WorkspaceConflictError("Keep your site isn't on for this client.");
  const address = clientAddress(row);
  if (!address || row.site) throw new WorkspaceConflictError(row.site ? "This client's site is already connected." : "No website on record for this client.");
  const server = await productServer();
  const detected = row.detection?.reachable && row.detection.platform !== "unknown" ? row.detection.platform : undefined;
  const site = await (deps.connectSite ?? ((who, raw) => server.connectSite(who, raw)))(actor, { businessId: workspaceId, siteUrl: address, ...(detected ? { platform: detected } : {}) });
  const presented = (deps.present ?? server.presentConnectedSite)(site);
  const platform: SitePlatform = site.platform !== "unknown" ? site.platform : detected ?? "unknown";
  return {
    site: presented,
    stepsText: installStepsText({ platform, siteHost: site.siteHost, lines: [presented.snippet.meta, presented.snippet.script].filter(Boolean).join("\n") }),
  };
}

/** Check the lines on each client's site: unproven sites are verified, proven ones are re-read. A failure is reported per client. */
export async function checkClientSites(actor: WorkspaceActor, agencyId: string, workspaceIds: string[], deps: AgencySitesDeps = {}): Promise<ClientCheckResult[]> {
  const rows = await actionableRows(actor, agencyId, workspaceIds, deps);
  const verify = deps.verifySite ?? (await productServer()).verifySite;
  const check = deps.checkSite ?? checkConnectedSite;
  return mapLimit([...new Set(workspaceIds)], CONCURRENCY, async (workspaceId): Promise<ClientCheckResult> => {
    const row = rows.get(workspaceId);
    if (!row) return { workspaceId, status: "skipped", message: "Keep your site isn't on for this client." };
    if (!row.site) return { workspaceId, status: "skipped", message: "Get the two lines first." };
    try {
      if (row.site.verifiedAt) await check(actor, workspaceId, row.site.id);
      else await verify(actor, workspaceId, row.site.id, { observe: recordDetectedBuilder(actor, workspaceId) });
      return { workspaceId, status: "ok" };
    } catch (error) {
      return { workspaceId, status: "failed", message: refusal(error, "Couldn't check this site just now.") };
    }
  });
}
