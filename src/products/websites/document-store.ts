import { createHash } from "node:crypto";
import { z } from "zod";
import { provisionHostedWebsiteTenant } from "@/lib/tenants";
import type { CrawledPage } from "./rebuild-crawl";
import { getRedis } from "@/lib/redis";
import { websiteRebuildReleaseEnabled } from "./rebuild-release";
import { getSupabase } from "@/lib/db/client";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type SavedWork, type WorkspaceActor } from "@/platform/workspaces/types";
import { siteDocumentHash, siteDocumentSchema, unresolvedSiteFacts, type SiteDocument } from "./site-document";
import { websiteLaunchReceiptSchema, type WebsiteLaunchReceipt } from "./contracts";

export interface WebsiteDocumentRevision {
  workspaceId: string; workId: string; revision: number; contentHash: string;
  document: SiteDocument; createdBy: string; createdAt: string; tenantId?: string;
  receipt?: WebsiteLaunchReceipt;
}
export interface WebsiteDocumentKey { workspaceId: string; workId: string; }
export interface WebsiteDocumentCandidate extends WebsiteDocumentKey { revision: number; contentHash: string; }
export interface AgencyWebsiteDocumentCandidate { work: SavedWork; section: string; sections: string[]; }
export interface WebsiteDocumentStore {
  readAgencyCandidate(actor: WorkspaceActor, input: { bindingId: string; workId?: string; section?: string; subscriptionExemption: boolean }): Promise<AgencyWebsiteDocumentCandidate | null>;
  commitAgencyCandidate(actor: WorkspaceActor, input: { bindingId: string; workId: string; section: string; expectedWorkRevision: number; expectedRevision: number; expectedCandidateRevision: number; expectedCandidateHash: string; document: SiteDocument; payload: unknown; subscriptionExemption: boolean }): Promise<SavedWork>;
  manage(actor: WorkspaceActor, input: WebsiteDocumentKey): Promise<void>;
  managePublishedTenant(actor: WorkspaceActor, input: WebsiteDocumentKey & { tenantId: string }): Promise<void>;
  retainCrawlPage(actor: WorkspaceActor, input: WebsiteDocumentKey & { page: CrawledPage }): Promise<void>;
  pruneCrawls(): Promise<number>;
  commitCandidate(actor: WorkspaceActor, input: WebsiteDocumentKey & { expectedRevision: number; expectedWorkRevision: number; document: SiteDocument; payload: unknown }): Promise<SavedWork>;
  reserveHostedTenant(actor: WorkspaceActor, input: WebsiteDocumentCandidate & { tenantId: string }): Promise<string>;
  append(actor: WorkspaceActor, input: WebsiteDocumentKey & { expectedRevision: number; document: SiteDocument }): Promise<WebsiteDocumentRevision>;
  read(actor: WorkspaceActor, input: WebsiteDocumentKey & { revision?: number }): Promise<WebsiteDocumentRevision | null>;
  list(actor: WorkspaceActor, input: WebsiteDocumentKey): Promise<WebsiteDocumentRevision[]>;
  receipts(actor: WorkspaceActor, input: WebsiteDocumentKey): Promise<WebsiteLaunchReceipt[]>;
  approve(actor: WorkspaceActor, input: WebsiteDocumentCandidate): Promise<void>;
  publish(actor: WorkspaceActor, input: WebsiteDocumentCandidate & { tenantId: string; receipt: WebsiteLaunchReceipt }): Promise<WebsiteDocumentRevision>;
  published(tenantId: string): Promise<WebsiteDocumentRevision | null>;
  listPublished(): Promise<WebsiteDocumentRevision[]>;
  recordHealth(input: WebsiteDocumentCandidate & { checkedAt: string; status: "healthy" | "unreachable" | "hash_mismatch" | "hash_missing"; observedHash?: string }): Promise<void>;
  claimRebuild(actor: WorkspaceActor, workspaceId: string, input: { requestId: string; domainKey: string; input: unknown; payload: unknown }): Promise<SavedWork>;
}
export interface WebsiteDocumentRpc { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>; }
const id = z.string().uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const tenant = z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/);
const revision = z.number().int().positive();
function key(input: WebsiteDocumentKey): Record<string, unknown> { return { p_workspace_id: id.parse(input.workspaceId), p_work_id: id.parse(input.workId) }; }
function identity(actor: WorkspaceActor) { return { p_user_id: id.parse(actor.userId), p_verified_email: z.string().email().parse(actor.verifiedEmail) }; }
function candidate(input: WebsiteDocumentCandidate) { return { ...key(input), p_revision: revision.parse(input.revision), p_content_hash: hash.parse(input.contentHash) }; }
function rows(data: unknown): Record<string, unknown>[] { return Array.isArray(data) ? data as Record<string,unknown>[] : data && typeof data === "object" ? [data as Record<string,unknown>] : []; }
function workRow(work: Record<string,unknown>): SavedWork {
  return { id: String(work.id), workspaceId: String(work.workspace_id), productId: String(work.product_id), resourceKind: String(work.resource_kind), title: String(work.title), payload: work.payload, input: work.input, createdBy: String(work.created_by), createdAt: String(work.created_at), updatedAt: String(work.updated_at) };
}
function documentRow(raw: Record<string,unknown>): WebsiteDocumentRevision {
  const document = siteDocumentSchema.parse(raw.document);
  const contentHash = hash.parse(raw.content_hash);
  if (siteDocumentHash(document) !== contentHash) throw new WorkspaceStoreError("The stored website document does not match its immutable hash.");
  return { workspaceId: String(raw.workspace_id), workId: String(raw.website_work_id), revision: revision.parse(Number(raw.revision)), contentHash, document, createdBy: String(raw.created_by), createdAt: String(raw.created_at), ...(typeof raw.tenant_id === "string" ? { tenantId: raw.tenant_id } : {}), ...(raw.receipt ? { receipt: websiteLaunchReceiptSchema.parse(raw.receipt) } : {}) };
}
export function createWebsiteDocumentStore(db?: WebsiteDocumentRpc): WebsiteDocumentStore {
  async function rpc(name: string, args: Record<string,unknown>): Promise<Record<string,unknown>[]> {
    const client = db ?? getSupabase() as unknown as WebsiteDocumentRpc | null;
    if (!client) throw new WorkspaceStoreError("Website document storage is unavailable.");
    const result = await client.rpc(name,args);
    if (result.error) {
      if (result.error.message.includes("workspace_access_denied") || result.error.message.includes("website_tenant_access_denied") || result.error.message.includes("agency_managed_website_draft_denied")) throw new WorkspaceAccessError();
      if (/website_.*(?:conflict|unresolved|approval_required)|workspace_exit_future_work_blocked|website_rebuild_in_progress|bounded_revision_conflict/.test(result.error.message)) throw new WorkspaceConflictError(result.error.message.includes("unresolved") ? "Resolve the flagged website facts before approval." : "This website changed or is already rebuilding. Reload before continuing.");
      throw new WorkspaceStoreError("The website document operation could not be confirmed.");
    }
    return rows(result.data);
  }
  const store: WebsiteDocumentStore = {
    async readAgencyCandidate(actor,input) {
      const result = await rpc("read_agency_website_document_candidate", { ...identity(actor), p_binding_id: id.parse(input.bindingId), p_work_id: input.workId ? id.parse(input.workId) : null, p_section: input.section === undefined ? null : z.string().min(1).max(80).parse(input.section), p_subscription_exemption: z.boolean().parse(input.subscriptionExemption) });
      if (!result[0]) return null;
      const work = workRow(z.record(z.string(),z.unknown()).parse(result[0].work));
      const payload = z.object({ candidate: z.object({ contentHash: hash, document: siteDocumentSchema }) }).parse(work.payload);
      if (siteDocumentHash(payload.candidate.document) !== payload.candidate.contentHash) throw new WorkspaceStoreError("The stored agency website candidate does not match its immutable hash.");
      return { work, section: z.string().min(1).max(80).parse(result[0].section), sections: z.array(z.string().min(1).max(80)).parse(result[0].sections) };
    },
    async commitAgencyCandidate(actor,input) {
      const document = siteDocumentSchema.parse(input.document);
      const result = await rpc("commit_agency_website_document_candidate", { ...identity(actor), p_binding_id: id.parse(input.bindingId), p_work_id: id.parse(input.workId), p_section: z.string().min(1).max(80).parse(input.section), p_expected_work_revision: z.number().int().nonnegative().parse(input.expectedWorkRevision), p_expected_document_revision: revision.parse(input.expectedRevision), p_expected_candidate_revision: revision.parse(input.expectedCandidateRevision), p_expected_candidate_hash: hash.parse(input.expectedCandidateHash), p_content_hash: siteDocumentHash(document), p_document: document, p_payload: input.payload, p_subscription_exemption: z.boolean().parse(input.subscriptionExemption) });
      if (!result[0]) throw new WorkspaceStoreError("The agency website candidate could not be confirmed.");
      return workRow(result[0]);
    },
    async manage(actor,input) { await rpc("manage_website_document",{ ...identity(actor), ...key(input) }); },
    async managePublishedTenant(actor,input) { await rpc("manage_published_website_tenant",{ ...identity(actor), ...key(input), p_tenant_id: tenant.parse(input.tenantId) }); },
    async retainCrawlPage(actor,input) {
      const { page } = input;
      if (Buffer.byteLength(page.html,"utf8") > 8 * 1024 * 1024 || page.sourceId !== `${page.url}#sha256=${createHash("sha256").update(page.html).digest("hex")}`) throw new WorkspaceStoreError("The crawl source does not match its original content hash.");
      const retained = { ...page, headings: page.headings.slice(0,300), links: page.links.slice(0,1000), assets: page.assets.slice(0,300) };
      await rpc("retain_website_crawl_page", { ...identity(actor), ...key(input), p_page: retained });
    },
    async pruneCrawls() {
      const result = await rpc("prune_website_crawl_pages",{});
      return Number(result[0]?.removed ?? 0);
    },
    async commitCandidate(actor,input) {
      const document = siteDocumentSchema.parse(input.document);
      const result = await rpc("commit_website_document_candidate", { ...identity(actor), ...key(input), p_expected_document_revision: z.number().int().nonnegative().parse(input.expectedRevision), p_expected_work_revision: z.number().int().nonnegative().parse(input.expectedWorkRevision), p_content_hash: siteDocumentHash(document), p_document: document, p_payload: input.payload });
      if (!result[0]) throw new WorkspaceStoreError("The website candidate could not be confirmed.");
      return workRow(result[0]);
    },
    async reserveHostedTenant(actor,input) {
      const args = { ...identity(actor), ...candidate(input), p_tenant_id: tenant.parse(input.tenantId) };
      return provisionHostedWebsiteTenant(async () => {
        const result = await rpc("reserve_website_hosted_tenant", args);
        if (!result[0] || typeof result[0].tenant_id !== "string") throw new WorkspaceStoreError("The hosted tenant could not be confirmed.");
        return result[0].tenant_id;
      });
    },
    async append(actor,input) {
      const document = siteDocumentSchema.parse(input.document);
      const saved = await rpc("append_website_document", { ...identity(actor), ...key(input), p_expected_revision: z.number().int().nonnegative().parse(input.expectedRevision), p_content_hash: siteDocumentHash(document), p_document: document });
      if (!saved[0]) throw new WorkspaceStoreError("The website revision could not be confirmed.");
      return documentRow(saved[0]);
    },
    async read(actor,input) { const result = await rpc("read_website_documents",{ ...identity(actor), ...key(input), p_revision: input.revision === undefined ? null : revision.parse(input.revision), p_all: false }); return result[0] ? documentRow(result[0]) : null; },
    async list(actor,input) { return (await rpc("read_website_documents", { ...identity(actor), ...key(input), p_revision: null, p_all: true })).map(documentRow); },
    async receipts(actor,input) { return (await rpc("read_website_document_receipts", { ...identity(actor), ...key(input) })).map(row => websiteLaunchReceiptSchema.parse(row.receipt)); },
    async approve(actor,input) {
      const row = await store.read(actor,{ ...input, revision: input.revision });
      if (!row || row.contentHash !== input.contentHash) throw new WorkspaceConflictError("The website candidate changed.");
      if (unresolvedSiteFacts(row.document).length || Object.values(row.document.nodes).some(node => node.verification?.needsReview)) throw new WorkspaceConflictError("Resolve the flagged website facts before approval.");
      await rpc("approve_website_document", { ...identity(actor), ...candidate(input) });
    },
    async publish(actor,input) {
      const receipt = websiteLaunchReceiptSchema.parse(input.receipt);
      if (receipt.status !== "published" || receipt.provider !== "strelva-hosted" || receipt.artifactHash !== input.contentHash || receipt.candidateRevision !== input.revision) throw new WorkspaceConflictError("The launch receipt must identify the exact approved hosted revision.");
      const result = await rpc("publish_website_document", { ...identity(actor), ...candidate(input), p_tenant_id: tenant.parse(input.tenantId), p_receipt: receipt });
      if (!result[0]) throw new WorkspaceStoreError("The published website could not be confirmed.");
      const published = { ...documentRow(result[0]), tenantId: input.tenantId, receipt: result[0].receipt ? websiteLaunchReceiptSchema.parse(result[0].receipt) : receipt };
      // The authoritative write has completed. Cache failure cannot make this
      // publication retryable; the short cache TTL bounds recovery.
      try { await getRedis()?.set(`reb:website-document:${input.tenantId}`, published.document, { ex: 60 }); } catch { /* Postgres remains authoritative. */ }
      return published;
    },
    async published(tenantId) { const result = await rpc("read_published_website_documents", { p_tenant_id: tenant.parse(tenantId) }); return result[0] ? documentRow(result[0]) : null; },
    async listPublished() { return (await rpc("read_published_website_documents", { p_tenant_id: null })).map(documentRow); },
    async recordHealth(input) {
      await rpc("record_website_document_health", { ...key(input), p_revision: revision.parse(input.revision), p_content_hash: hash.parse(input.contentHash), p_checked_at: z.string().datetime({ offset: true }).parse(input.checkedAt), p_status: z.enum(["healthy", "unreachable", "hash_mismatch", "hash_missing"]).parse(input.status), p_observed_hash: input.observedHash === undefined ? null : hash.parse(input.observedHash) });
    },
    async claimRebuild(actor,workspaceId,input) {
      const result = await rpc("claim_website_rebuild", { ...identity(actor), p_workspace_id: id.parse(workspaceId), p_request_id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{7,159}$/).parse(input.requestId), p_domain_key: z.string().min(1).max(253).parse(input.domainKey), p_input: input.input, p_payload: input.payload });
      const work = result[0]; if (!work) throw new WorkspaceStoreError("The website rebuild could not be confirmed.");
      return workRow(work);
    },
  }; return store;
}
export const websiteDocumentStore = createWebsiteDocumentStore();
export const saveDocument = websiteDocumentStore.append;
export const readDocument = websiteDocumentStore.read;
export async function getPublishedSiteDocument(tenantId: string): Promise<SiteDocument | null> {
  if (!websiteRebuildReleaseEnabled()) return null;
  tenant.parse(tenantId);
  const redis = getRedis();
  try {
    const cached = await redis?.get<unknown>(`reb:website-document:${tenantId}`);
    if (cached) { const parsed = siteDocumentSchema.safeParse(cached); if (parsed.success) return parsed.data; }
  } catch { /* Cache misses and failures both read durable authority. */ }
  const published = (await websiteDocumentStore.published(tenantId))?.document ?? null;
  if (published) { try { await redis?.set(`reb:website-document:${tenantId}`, published, { ex: 60 }); } catch { /* Optional cache only. */ } }
  return published;
}
export async function invalidatePublishedSiteDocument(tenantId: string): Promise<void> {
  tenant.parse(tenantId); try { await getRedis()?.del(`reb:website-document:${tenantId}`); } catch { /* TTL bounds recovery. */ }
}
export const listPublishedSiteDocuments = websiteDocumentStore.listPublished;
