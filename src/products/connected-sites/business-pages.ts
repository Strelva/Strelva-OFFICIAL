/**
 * Server-side visibility for AI crawlers, server only (#309, #502).
 *
 * connect.js adds JSON-LD in the browser, and AI crawlers don't run
 * JavaScript. Two server-side paths carry the same confirmed facts instead:
 *
 * - The public business page `/biz/{handle}` and its `llms.txt`, rendered
 *   by Strelva. Off unless STRELVA_BUSINESS_PAGES=1 (on top of the connected
 *   sites release), the business's `connected_sites` row is open, and an
 *   owner or admin published the page.
 * - A static JSON-LD block an agency pastes into any site, with a content
 *   hash so a check of the live page can tell whether it still matches.
 *
 * Both use businessJsonLd and schemaBlock, so they never disagree.
 */
import { z } from "zod";
import { WorkspaceConflictError, type WorkspaceActor } from "@/platform/workspaces/types";
import { BUSINESS_HANDLE_PATTERN, businessPageUrl, type PublishedBusinessPage } from "./business-page";
import { businessPagesStore, type BusinessPageSettings, type BusinessPagesStore } from "./business-pages-store";
import { businessJsonLd, publicFactsFromConfirmedRecord, type PublicFacts } from "./contracts";
import { schemaBlock, schemaBlockStatus, type SchemaBlock, type SchemaBlockStatus } from "./schema-block";
import { appOrigin, connectedSitesPublicFor, connectedSitesReleaseEnabled, fetchLiveSitePage } from "./server";
import { connectedSitesStore, type ConnectedSitesStore } from "./store";

/** The public page's own switch, on top of the connected sites release. Unset: no page answers. */
export function businessPagesReleaseEnabled(): boolean {
  return connectedSitesReleaseEnabled() && process.env.STRELVA_BUSINESS_PAGES === "1";
}

/** A published page's confirmed facts, or null (off, unknown, unpublished, or its business closed). */
export async function loadPublishedBusinessPage(handle: string, deps: { store?: BusinessPagesStore; publicFor?: (workspaceId: string) => Promise<boolean> } = {}): Promise<PublishedBusinessPage | null> {
  if (!businessPagesReleaseEnabled()) return null;
  const normalized = handle.toLowerCase();
  if (!BUSINESS_HANDLE_PATTERN.test(normalized)) return null;
  const row = await (deps.store ?? businessPagesStore()).published(normalized);
  if (!row) return null;
  if (!(await (deps.publicFor ?? connectedSitesPublicFor)(row.workspaceId).catch(() => false))) return null;
  const facts = publicFactsFromConfirmedRecord(row.workspaceId, row);
  if (!facts.name) return null;
  return { workspaceId: row.workspaceId, handle: row.handle, facts, confirmedAt: row.confirmedAt };
}

export interface SchemaBlockTarget {
  /** A connected site's id, or `any` for a site that isn't connected. */
  id: string;
  label: string;
  /** The `url` the block names, or null for `any`. */
  url: string | null;
  /** Whether Strelva can read this site to check the block. */
  checkable: boolean;
  block: SchemaBlock;
}

export interface BusinessVisibility {
  pagesEnabled: boolean;
  page: (BusinessPageSettings & { url: string }) | null;
  /** Null until the business has a confirmed name. */
  blocks: SchemaBlockTarget[] | null;
  confirmedAt: string | null;
}

function blockFor(facts: PublicFacts, url: string | null): SchemaBlock | null {
  const ld = businessJsonLd(facts, url);
  return ld ? schemaBlock(ld) : null;
}

/** The page settings and one paste block per active connected site, plus one for any other site. */
export async function readBusinessVisibility(actor: WorkspaceActor, workspaceId: string, deps: { store?: BusinessPagesStore; sites?: ConnectedSitesStore } = {}): Promise<BusinessVisibility> {
  const store = deps.store ?? businessPagesStore();
  const pagesEnabled = businessPagesReleaseEnabled();
  const [page, row, sites] = await Promise.all([
    pagesEnabled ? store.read(actor, workspaceId) : Promise.resolve(null),
    store.confirmedFacts(actor, workspaceId),
    (deps.sites ?? connectedSitesStore()).list(actor, workspaceId),
  ]);
  const facts = publicFactsFromConfirmedRecord(workspaceId, row);
  const generic = blockFor(facts, null);
  const blocks = generic ? [
    ...sites.filter(site => site.status === "active").map(site => ({ id: site.id, label: site.siteHost, url: site.siteUrl, checkable: true, block: blockFor(facts, site.siteUrl)! })),
    { id: "any", label: "Any other site", url: null, checkable: false, block: generic },
  ] : null;
  return { pagesEnabled, page: page ? { ...page, url: businessPageUrl(appOrigin(), page.handle) } : null, blocks, confirmedAt: row.confirmedAt };
}

const pageInput = z.object({
  handle: z.string().trim().toLowerCase().regex(BUSINESS_HANDLE_PATTERN, "Use 3 to 48 lowercase letters, numbers and single hyphens."),
  published: z.boolean(),
}).strict();

export async function setBusinessPage(actor: WorkspaceActor, workspaceId: string, raw: unknown, store: BusinessPagesStore = businessPagesStore()): Promise<BusinessPageSettings & { url: string }> {
  const input = pageInput.parse(raw);
  const page = await store.set(actor, workspaceId, input);
  return { ...page, url: businessPageUrl(appOrigin(), page.handle) };
}

export interface SchemaBlockCheck { siteId: string; siteHost: string; status: SchemaBlockStatus; hash: string; checkedAt: string }

/**
 * Read a connected site's live page (pinned, public addresses only) and
 * compare its Strelva block with the one today's confirmed facts give.
 */
export async function checkSchemaBlock(actor: WorkspaceActor, workspaceId: string, siteId: string, deps: { store?: BusinessPagesStore; sites?: ConnectedSitesStore; fetchPage?: (url: string) => Promise<string | null>; now?: () => Date } = {}): Promise<SchemaBlockCheck> {
  const sitesStore = deps.sites ?? connectedSitesStore();
  const site = (await sitesStore.list(actor, workspaceId)).find(item => item.id === siteId && item.status === "active");
  if (!site) throw new WorkspaceConflictError("This connected site is no longer active here. Reload and try again.");
  const row = await (deps.store ?? businessPagesStore()).confirmedFacts(actor, workspaceId);
  const current = blockFor(publicFactsFromConfirmedRecord(workspaceId, row), site.siteUrl);
  if (!current) throw new WorkspaceConflictError("Confirm the business name first. There is nothing to check yet.");
  let html: string | null = null;
  try { html = await (deps.fetchPage ?? fetchLiveSitePage)(site.siteUrl); } catch { html = null; }
  if (html === null) throw new WorkspaceConflictError(`We couldn't open ${site.siteHost} just now. Check the site is published, then try again.`);
  return { siteId: site.id, siteHost: site.siteHost, status: schemaBlockStatus(html, current), hash: current.hash, checkedAt: (deps.now?.() ?? new Date()).toISOString() };
}
