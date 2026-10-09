import { vi } from "vitest";
import { createWebsiteRebuildService } from "@/products/websites/rebuild-service";
import type { resolvePublishedWebsiteCapabilities } from "@/products/websites/published-capabilities";
import { runWebsiteRebuild, type RebuildOptions } from "@/products/websites/rebuild-pipeline";
import { siteDocumentHash, siteDocumentSchema, unresolvedSiteFacts, } from "@/products/websites/site-document";
import { websiteRebuildSchema, type WebsiteRebuildRecord } from "@/products/websites/rebuild-contracts";
import type { WebsiteDocumentStore, WebsiteDocumentRevision } from "@/products/websites/document-store";
import type { BoundedStore } from "@/platform/bounded-work/repository";
import { WorkspaceAccessError, WorkspaceConflictError, type SavedWork, type WorkspaceActor } from "@/platform/workspaces/types";

vi.mock("@/platform/infra/redis", () => ({ getRedis: () => null }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
export const actor: WorkspaceActor = { userId: "71000000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
export const workspaceId = "71000000-0000-4000-8000-000000000002";
const fixedTime = "2026-10-01T12:00:00.000Z";
const brief = { requestId: "service-description-request", businessName: "Fictional Counsel", description: "We help families prepare wills and trusts." };
const clone = <T,>(value: T): T => structuredClone(value);
export function selection(record: WebsiteRebuildRecord) { return { expectedRevision: record.rebuild.revision, candidateRevision: record.rebuild.candidate!.revision, candidateContentHash: record.rebuild.candidate!.contentHash }; }

/** Independent memory persistence port: production SQL verifies these same
 * transactional guarantees separately against the full historical schema. */
export function harness(options: { pipelineOptions?: RebuildOptions; checkLiveFailure?: boolean; resolveCapabilities?: typeof resolvePublishedWebsiteCapabilities } = {}) {
  const works = new Map<string,SavedWork>(); const revisions = new Map<string,WebsiteDocumentRevision[]>();
  const approvals = new Map<string,{ revision: number; contentHash: string }>(); const publications = new Map<string,WebsiteDocumentRevision>(); const reservations = new Map<string,string>();
  const state = { member: true, manager: true, failWorkKind: null as string | null, failCandidateCas: false };
  let nextId = 10;
  const authorize = (user: WorkspaceActor, ws = workspaceId) => { if (!state.member || user.userId !== actor.userId || ws !== workspaceId) throw new WorkspaceAccessError(); };
  const manage = (user: WorkspaceActor, ws = workspaceId) => { authorize(user,ws); if (!state.manager) throw new WorkspaceAccessError(); };
  const latest = (workId: string) => revisions.get(workId)?.at(-1);
  const store: BoundedStore = {
    async member(user,ws) { authorize(user,ws); },
    async read(user,workId) { authorize(user); return clone(works.get(workId) ?? null); },
    async create(user,ws,input) { authorize(user,ws); const id = `71000000-0000-4000-8000-${String(nextId++).padStart(12,"0")}`; const work = { id, workspaceId: ws, ...input, createdBy: user.userId, createdAt: fixedTime, updatedAt: fixedTime }; works.set(id,clone(work)); return clone(work); },
    async update(user,work,expected,payload) {
      authorize(user,work.workspaceId); const current = works.get(work.id); const parsed = websiteRebuildSchema.parse(payload);
      if (!current || websiteRebuildSchema.parse(current.payload).revision !== expected) throw new WorkspaceConflictError();
      if (state.failWorkKind === parsed.history.at(-1)?.kind) { state.failWorkKind = null; throw new WorkspaceConflictError("Injected lost work CAS"); }
      const next = { ...current, payload: parsed, title: parsed.title, updatedAt: fixedTime }; works.set(work.id,clone(next)); return clone(next);
    },
  };
  const documents: WebsiteDocumentStore = {
    async readAgencyCandidate() { return null; }, async commitAgencyCandidate() { throw new WorkspaceAccessError(); },
    async manage(user,key) { manage(user,key.workspaceId); },
    async managePublishedTenant(user,key) { manage(user,key.workspaceId); const row = publications.get(key.tenantId); if (!row || row.workId !== key.workId) throw new WorkspaceAccessError(); },
    async retainCrawlPage(user,key) { authorize(user,key.workspaceId); }, async pruneCrawls() { return 0; },
    async claimRebuild(user,ws,input) {
      authorize(user,ws); const existing = [...works.values()].find(work => (work.input as {requestId?: string})?.requestId === input.requestId);
      if (existing) { if (JSON.stringify((existing.input as {intake: unknown}).intake) !== JSON.stringify(input.input)) throw new WorkspaceConflictError(); return clone(existing); }
      return store.create(user,ws,{ productId: "websites", resourceKind: "website", title: websiteRebuildSchema.parse(input.payload).title, payload: input.payload, input: { requestId: input.requestId, domainKey: input.domainKey, intake: input.input } });
    },
    async append(user,input) { authorize(user,input.workspaceId); const head = latest(input.workId); if ((head?.revision ?? 0) !== input.expectedRevision) throw new WorkspaceConflictError(); const document = siteDocumentSchema.parse(input.document); const row = { workspaceId: input.workspaceId, workId: input.workId, revision: input.expectedRevision+1, contentHash: siteDocumentHash(document), document, createdBy: user.userId, createdAt: fixedTime }; revisions.set(input.workId,[...(revisions.get(input.workId) ?? []),clone(row)]); approvals.delete(input.workId); return clone(row); },
    async commitCandidate(user,input) {
      authorize(user,input.workspaceId); const current = works.get(input.workId)!; const head = latest(input.workId); const parsed = websiteRebuildSchema.parse(input.payload);
      if (state.failCandidateCas || websiteRebuildSchema.parse(current.payload).revision !== input.expectedWorkRevision || (head?.revision ?? 0) !== input.expectedRevision) throw new WorkspaceConflictError();
      const candidate = parsed.candidate!; const hash = siteDocumentHash(input.document);
      if (candidate.contentHash !== hash) throw new Error("Candidate hash mismatch");
      if (candidate.revision === (head?.revision ?? 0)+1) await documents.append(user,input);
      else if (!head || candidate.revision !== head.revision || hash !== head.contentHash) throw new WorkspaceConflictError();
      const work = { ...current, title: parsed.title, payload: parsed, updatedAt: fixedTime }; works.set(work.id,clone(work)); return clone(work);
    },
    async read(user,key) { authorize(user,key.workspaceId); return clone(key.revision ? revisions.get(key.workId)?.find(row => row.revision === key.revision) ?? null : latest(key.workId) ?? null); },
    async list(user,key) { authorize(user,key.workspaceId); return clone(revisions.get(key.workId) ?? []); },
    async receipts(user,key) { authorize(user,key.workspaceId); return clone([...publications.values()].filter(row => row.workId === key.workId).flatMap(row => row.receipt ? [row.receipt] : [])); },
    async approve(user,key) { manage(user,key.workspaceId); const row = latest(key.workId); if (!row || row.revision !== key.revision || row.contentHash !== key.contentHash || unresolvedSiteFacts(row.document).length || Object.values(row.document.nodes).some(node => node.verification?.needsReview)) throw new WorkspaceConflictError(); approvals.set(key.workId,{ revision: key.revision, contentHash: key.contentHash }); },
    async reserveHostedTenant(user,key) { manage(user,key.workspaceId); const approval = approvals.get(key.workId); if (approval?.revision !== key.revision || approval.contentHash !== key.contentHash) throw new WorkspaceConflictError(); if (!reservations.has(key.workId)) reservations.set(key.workId,key.tenantId); return reservations.get(key.workId)!; },
    async publish(user,key) { manage(user,key.workspaceId); const row = latest(key.workId)!; const approval = approvals.get(key.workId); if (row.revision !== key.revision || approval?.revision !== key.revision || approval.contentHash !== key.contentHash) throw new WorkspaceConflictError(); const prior = publications.get(key.tenantId); if (prior?.revision === key.revision && prior.contentHash === key.contentHash) return clone(prior); const publication = { ...row, tenantId: key.tenantId, receipt: key.receipt }; publications.set(key.tenantId,clone(publication)); return clone(publication); },
    async published(tenantId) { return clone(publications.get(tenantId) ?? null); }, async listPublished() { return clone([...publications.values()]); }, async recordHealth() {},
  };
  documents.publish = vi.fn(documents.publish); documents.commitCandidate = vi.fn(documents.commitCandidate); documents.reserveHostedTenant = vi.fn(documents.reserveHostedTenant); documents.manage = vi.fn(documents.manage);
  const pipeline = vi.fn(runWebsiteRebuild); const rateLimited = vi.fn(async () => false);
  const checkLive = vi.fn(async () => { if (options.checkLiveFailure) throw new Error("Read-back unavailable"); return { status: "verified" as const, checkedAt: fixedTime, message: "Verified local fixture" }; });
  const domainChange = vi.fn(async () => ({ domain: null, domains: [] }));
  const service = createWebsiteRebuildService(store,{ documents, pipeline, pipelineOptions: { now: () => fixedTime, ...options.pipelineOptions }, list: async user => { authorize(user); return clone([...works.values()]); }, now: () => fixedTime, rateLimited, checkLive, revalidate: async () => {}, domainChange, resolveCapabilities: options.resolveCapabilities });
  const create = (input = brief) => service.create(actor,workspaceId,input);
  const launch = async (record: WebsiteRebuildRecord) => { const approved = await service.approve(actor,record.workId,selection(record)); return service.launch(actor,record.workId,selection(approved)); };
  return { service, documents, store, works, revisions, publications, state, pipeline, rateLimited, checkLive, domainChange, create, launch };
}

