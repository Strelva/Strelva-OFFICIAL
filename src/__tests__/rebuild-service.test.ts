import { describe, it, expect, vi } from "vitest";
import { createWebsiteRebuildService } from "@/products/websites/rebuild-service";
import type { resolvePublishedWebsiteCapabilities } from "@/products/websites/published-capabilities";
import { extractBusinessFacts, runWebsiteRebuild, writeSourceContent, type RebuildOptions } from "@/products/websites/rebuild-pipeline";
import { composeRebuildSite } from "@/products/websites/rebuild-composer";
import { siteDocumentHash, siteDocumentSchema, unresolvedSiteFacts, } from "@/products/websites/site-document";
import { renderSiteDocumentHtml, buildSiteDocumentExport } from "@/products/websites/site-export";
import { websiteRebuildSchema, type WebsiteRebuildRecord } from "@/products/websites/rebuild-contracts";
import type { WebsiteDocumentStore, WebsiteDocumentRevision } from "@/products/websites/document-store";
import type { BoundedStore } from "@/platform/bounded-work/repository";
import { WorkspaceAccessError, WorkspaceConflictError, type SavedWork, type WorkspaceActor } from "@/platform/workspaces/types";

vi.mock("@/platform/infra/redis", () => ({ getRedis: () => null }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const actor: WorkspaceActor = { userId: "71000000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
const workspaceId = "71000000-0000-4000-8000-000000000002";
const fixedTime = "2026-10-01T12:00:00.000Z";
const brief = { requestId: "service-description-request", businessName: "Fictional Counsel", description: "We help families prepare wills and trusts." };
const clone = <T,>(value: T): T => structuredClone(value);
function selection(record: WebsiteRebuildRecord) { return { expectedRevision: record.rebuild.revision, candidateRevision: record.rebuild.candidate!.revision, candidateContentHash: record.rebuild.candidate!.contentHash }; }

/** Independent memory persistence port: production SQL verifies these same
 * transactional guarantees separately against the full historical schema. */
function harness(options: { pipelineOptions?: RebuildOptions; checkLiveFailure?: boolean; resolveCapabilities?: typeof resolvePublishedWebsiteCapabilities } = {}) {
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

describe("website rebuild service lifecycle and durable recovery", () => {
  it("runs the actual description pipeline through saved review, approval and hosted publication", async () => {
    const h = harness(); const reviewed = await h.create();
    expect(reviewed.rebuild.status).toBe("review_ready"); expect(reviewed.rebuild.stages.filter(stage => stage.status === "completed").map(stage => stage.stage)).toEqual(["crawl","extract","write","compose","verify"]);
    expect(reviewed.rebuild.candidate!.document.siteName).toBe(brief.businessName); expect(reviewed.rebuild.checkpoint).toBeNull();
    const published = await h.launch(reviewed); expect(published.rebuild.status).toBe("published"); expect(published.rebuild.launch.readBack?.status).toBe("verified");
    expect(published.rebuild.launch.receipt).toMatchObject({ provider: "strelva-hosted", artifactHash: reviewed.rebuild.candidate!.contentHash, candidateRevision: 1 }); expect(h.publications.size).toBe(1);
  });
  it("reopens an idempotent request without rerunning the pipeline or consuming another rate admission", async () => {
    const h = harness(); const first = await h.create(); const again = await h.create(); expect(again.workId).toBe(first.workId); expect(h.pipeline).toHaveBeenCalledTimes(1); expect(h.rateLimited).toHaveBeenCalledTimes(1);
    await expect(h.create({ ...brief, description: "Different owner inputs." })).rejects.toBeInstanceOf(WorkspaceConflictError);
  });
  it("launch preserves the customer's approval instead of re-approving as the launcher (audit finding 6)", async () => {
    const h = harness(); const reviewed = await h.create();
    const approve = vi.spyOn(h.documents, "approve");
    const approved = await h.service.approve(actor,reviewed.workId,selection(reviewed)); expect(approve).toHaveBeenCalledTimes(1);
    const published = await h.service.launch(actor,approved.workId,selection(approved));
    expect(published.rebuild.status).toBe("published"); expect(approve).toHaveBeenCalledTimes(1);
    expect(h.documents.reserveHostedTenant).toHaveBeenCalledTimes(1);
  });
  it("does not publish a preview before approval", async () => { const h = harness(); const record = await h.create(); await expect(h.service.launch(actor,record.workId,selection(record))).rejects.toBeInstanceOf(WorkspaceConflictError); expect(h.documents.reserveHostedTenant).not.toHaveBeenCalled(); expect(h.documents.publish).not.toHaveBeenCalled(); });
  it.each(["work","document","hash"])("rejects a stale %s selection before approving", async kind => { const h = harness(); const record = await h.create(); const input = selection(record); if (kind === "work") input.expectedRevision--; if (kind === "document") input.candidateRevision++; if (kind === "hash") input.candidateContentHash = "f".repeat(64); await expect(h.service.approve(actor,record.workId,input)).rejects.toBeInstanceOf(WorkspaceConflictError); expect(h.documents.publish).not.toHaveBeenCalled(); });
  it("requires the owner's confirmation of a supported high-risk claim", async () => {
    const h = harness(); const record = await h.create({ ...brief, description: "We have 20 years of experience." }); const [factId] = Object.entries(record.rebuild.candidate!.document.facts).find(([,fact]) => fact.highRisk)!;
    await expect(h.service.approve(actor,record.workId,selection(record))).rejects.toBeInstanceOf(WorkspaceConflictError);
    const confirmed = await h.service.resolveFact(actor,record.workId,factId,{ ...selection(record), action: "confirm" }); expect(confirmed.rebuild.candidate!.document.facts[factId]!.origin).toBe("owner_confirmed"); expect(confirmed.rebuild.candidate!.contentHash).not.toBe(record.rebuild.candidate!.contentHash); expect((await h.service.approve(actor,record.workId,selection(confirmed))).rebuild.status).toBe("approved");
  });
  it("edits a flagged fact and the source-derived site sentence in one new revision", async () => {
    const h = harness(); const record = await h.create({ ...brief, description: "We have 20 years of experience." }); const [factId] = Object.entries(record.rebuild.candidate!.document.facts).find(([,fact]) => fact.highRisk)!;
    const edited = await h.service.resolveFact(actor,record.workId,factId,{ ...selection(record), action: "edit", text: "We help families plan their next step." }); const doc = edited.rebuild.candidate!.document;
    expect(doc.facts[factId]).toMatchObject({ text: "We help families plan their next step.", origin: "owner_confirmed", highRisk: false }); expect(JSON.stringify(doc.nodes)).not.toContain("20 years"); expect(JSON.stringify(doc.nodes)).toContain("We help families plan their next step."); expect(edited.rebuild.approvedCandidateRevision).toBeNull();
  });
  it.each([
    ["Phone: (716) 555-0100.", "(716) 555-0100", "+1 716 555 0199", "tel:7165550100", "tel:+17165550199"],
    ["Email:Orders@example.test.", "Orders@example.test", "orders+pickup@example.test", "mailto:Orders@example.test", "mailto:orders+pickup@example.test"],
    ["Email Orders@example.test.", "Orders@example.test", "orders+pickup@example.test", "mailto:Orders@example.test", "mailto:orders+pickup@example.test"],
  ])("updates the exact contact copy and destination together after publication: %s", async (description, before, after, oldHref, newHref) => {
    const h = harness(); let record = await h.create({ ...brief, description });
    for (const id of unresolvedSiteFacts(record.rebuild.candidate!.document)) record = await h.service.resolveFact(actor,record.workId,id,{ ...selection(record), action: "confirm" });
    record = await h.launch(record);
    const [factId] = Object.entries(record.rebuild.candidate!.document.facts).find(([,fact]) => fact.kind === "contact" && fact.text === before)!;
    const published = clone(h.publications.get(record.rebuild.tenantId!)!);
    const edited = await h.service.resolveFact(actor,record.workId,factId,{ ...selection(record), action: "edit", text: after });
    const html = renderSiteDocumentHtml(edited.rebuild.candidate!.document,"/contact",{ preview: true });
    expect(html).toContain(after); expect(html).toContain(`href="${newHref}"`); expect(html).not.toContain(`href="${oldHref}"`);
    const home = renderSiteDocumentHtml(edited.rebuild.candidate!.document,"/",{ preview: true });
    expect(home).toContain(after); expect(home).not.toContain(before);
    expect(edited.rebuild.candidate!.document.facts[factId]).toMatchObject({ text: after, origin: "owner_confirmed" });
    expect(edited.rebuild.status).toBe("review_ready"); expect(edited.rebuild.approvedCandidateRevision).toBeNull();
    expect(edited.rebuild.candidate!.revision).toBeGreaterThan(record.rebuild.candidate!.revision);
    expect(edited.rebuild.candidate!.contentHash).not.toBe(record.rebuild.candidate!.contentHash);
    expect(h.publications.get(record.rebuild.tenantId!)!).toEqual(published);
    const originalClaim = Object.entries(published.document.facts).find(([,fact]) => fact.kind === "claim" && fact.text === description)!;
    expect(edited.rebuild.candidate!.document.facts[originalClaim[0]]).toEqual({ ...originalClaim[1], text: description.replace(before,after) });
    expect(edited.rebuild.input).toEqual(record.rebuild.input);
    const currentFacts = extractBusinessFacts({ ...brief, description }); currentFacts.facts = clone(edited.rebuild.candidate!.document.facts);
    const recomposed = await composeRebuildSite(currentFacts,writeSourceContent(currentFacts));
    const recomposedHome = renderSiteDocumentHtml(recomposed,"/",{ preview: true });
    expect(recomposedHome).toContain(after); expect(recomposedHome).not.toContain(before);
    expect(renderSiteDocumentHtml(recomposed,"/contact",{ preview: true })).toContain(`href="${newHref}"`);
    expect(renderSiteDocumentHtml(published.document,"/contact")).toContain(`href="${oldHref}"`);
    expect(h.documents.manage).toHaveBeenLastCalledWith(actor,{ workspaceId, workId: record.workId });
  });
  it.each([
    ["Email orders@example.test for orders. Email support@example.test for support.", "orders@example.test", "support@example.test"],
    ["Call 716-555-0100 for orders. Call (716) 555-0199 for support.", "716-555-0100", "716.555.0199"],
  ])("refuses a contact correction that would collide with another independently editable destination: %s", async (description, before, after) => {
    const h = harness(); let record = await h.create({ ...brief, description });
    for (const id of unresolvedSiteFacts(record.rebuild.candidate!.document)) record = await h.service.resolveFact(actor,record.workId,id,{ ...selection(record), action: "confirm" });
    record = await h.launch(record); const published = clone(h.publications.get(record.rebuild.tenantId!)!);
    const [factId] = Object.entries(record.rebuild.candidate!.document.facts).find(([,fact]) => fact.kind === "contact" && fact.text === before)!;
    const commits = vi.mocked(h.documents.commitCandidate).mock.calls.length;
    await expect(h.service.resolveFact(actor,record.workId,factId,{ ...selection(record), action: "edit", text: after })).rejects.toThrow("already belongs to another contact fact");
    expect(h.documents.commitCandidate).toHaveBeenCalledTimes(commits);
    expect((await h.service.read(actor,record.workId)).rebuild.candidate).toEqual(record.rebuild.candidate);
    expect(h.publications.get(record.rebuild.tenantId!)!).toEqual(published);
    expect((await h.service.read(actor,record.workId)).rebuild.input).toEqual(record.rebuild.input);
  });
  it("allows formatting corrections and repeated corrections to the same contact fact", async () => {
    const h = harness(); let record = await h.create({ ...brief, description: "Call (716) 555-0100 for orders." });
    const [factId] = Object.entries(record.rebuild.candidate!.document.facts).find(([,fact]) => fact.kind === "contact")!;
    record = await h.service.resolveFact(actor,record.workId,factId,{ ...selection(record), action: "edit", text: "716.555.0100" });
    expect(renderSiteDocumentHtml(record.rebuild.candidate!.document,"/",{ preview: true })).toContain("Call 716.555.0100 for orders.");
    record = await h.service.resolveFact(actor,record.workId,factId,{ ...selection(record), action: "edit", text: "716-555-0199" });
    const html = renderSiteDocumentHtml(record.rebuild.candidate!.document,"/",{ preview: true });
    expect(html).toContain('href="tel:7165550199"'); expect(html).toContain("Call 716-555-0199 for orders."); expect(html).not.toContain("716.555.0100");
    expect(record.rebuild.status).toBe("review_ready"); expect(record.rebuild.approvedCandidateRevision).toBeNull();
  });
  it.each(["javascript:alert(1)", "orders@example.test?subject=unsafe", "orders%0D%0A@example.test", "2026-10-09"])("refuses an unsafe contact correction before committing: %s", async text => {
    const h = harness(); const record = await h.create({ ...brief, description: "Call 716-555-0100." });
    const [factId] = Object.entries(record.rebuild.candidate!.document.facts).find(([,fact]) => fact.kind === "contact")!;
    const commits = vi.mocked(h.documents.commitCandidate).mock.calls.length;
    await expect(h.service.resolveFact(actor,record.workId,factId,{ ...selection(record), action: "edit", text })).rejects.toThrow("valid email address or phone number");
    expect(h.documents.commitCandidate).toHaveBeenCalledTimes(commits);
    expect((await h.service.read(actor,record.workId)).rebuild.candidate).toEqual(record.rebuild.candidate);
    expect(h.revisions.get(record.workId)).toHaveLength(1);
  });
  it("removes the exact normalized contact destination along with its fact and visible copy", async () => {
    const h = harness(); const record = await h.create({ ...brief, description: "Call (716) 555-0100." });
    const [factId] = Object.entries(record.rebuild.candidate!.document.facts).find(([,fact]) => fact.kind === "contact")!;
    const removed = await h.service.resolveFact(actor,record.workId,factId,{ ...selection(record), action: "remove" });
    const html = renderSiteDocumentHtml(removed.rebuild.candidate!.document,"/contact",{ preview: true });
    expect(html).not.toContain('href="tel:7165550100"'); expect(html).not.toContain("(716) 555-0100");
    expect(removed.rebuild.candidate!.document.facts[factId]).toBeUndefined(); expect(removed.rebuild.approvedCandidateRevision).toBeNull();
  });
  it("projects only the exact derived destination in nodes linked to the corrected fact", async () => {
    const h = harness(); const original = await h.create({ ...brief, description: "Email Orders@example.test." });
    const work = h.works.get(original.workId)!; const document = clone(original.rebuild.candidate!.document);
    const [factId] = Object.entries(document.facts).find(([,fact]) => fact.kind === "contact")!;
    const contactRoot = document.nodes[document.pages.find(page => page.path === "/contact")!.root]!;
    document.nodes.external_source = { id: "external_source", type: "Cta", variant: "card", props: { cta: { label: "Directory", href: "https://directory.example.test/Orders@example.test" } }, children: [], factIds: [factId] };
    document.nodes.unbound_link = { id: "unbound_link", type: "Cta", variant: "card", props: { cta: { label: "Independent contact", href: "mailto:Orders@example.test" } }, children: [], factIds: [] };
    contactRoot.children.push("external_source", "unbound_link");
    const contentHash = siteDocumentHash(document); const record = { ...original, rebuild: { ...original.rebuild, candidate: { ...original.rebuild.candidate!, document, contentHash } } };
    h.works.set(work.id,{ ...work, payload: record.rebuild });
    h.revisions.get(work.id)![0] = { ...h.revisions.get(work.id)![0]!, document, contentHash };
    const edited = await h.service.resolveFact(actor,record.workId,factId,{ ...selection(record), action: "edit", text: "pickup@example.test" });
    const next = edited.rebuild.candidate!.document;
    expect(next.nodes.external_source!.props).toEqual(document.nodes.external_source!.props);
    expect(next.nodes.external_source!.factIds).toEqual(document.nodes.external_source!.factIds);
    expect(next.nodes.unbound_link).toEqual(document.nodes.unbound_link);
    expect(renderSiteDocumentHtml(next,"/contact",{ preview: true })).toContain('href="mailto:pickup@example.test"');
  });
  it("changes only offered occurrences in originating current claims and retains historical and unrelated evidence", async () => {
    const description = "Do not call 716-555-0100 for old orders. Call 716-555-0100 for new orders. We bake bread.";
    const h = harness(); const record = await h.create({ ...brief, description });
    const [factId] = Object.entries(record.rebuild.candidate!.document.facts).find(([,fact]) => fact.kind === "contact")!;
    const edited = await h.service.resolveFact(actor,record.workId,factId,{ ...selection(record), action: "edit", text: "716-555-0199" });
    const next = edited.rebuild.candidate!.document;
    const claim = Object.values(next.facts).find(fact => fact.kind === "claim" && fact.text.includes("old orders"))!;
    expect(claim.text).toBe("Do not call 716-555-0100 for old orders. Call 716-555-0199 for new orders. We bake bread.");
    expect(claim.origin).toBe("owner_stated"); expect(claim.sources).toEqual([]);
    expect(next.facts[Object.keys(next.facts).find(id => next.facts[id]!.text === brief.businessName)!]).toEqual(record.rebuild.candidate!.document.facts[Object.keys(record.rebuild.candidate!.document.facts).find(id => record.rebuild.candidate!.document.facts[id]!.text === brief.businessName)!]);
    expect(edited.rebuild.input).toEqual(record.rebuild.input);
    const currentFacts = extractBusinessFacts({ ...brief, description }); currentFacts.facts = clone(next.facts);
    const recomposed = await composeRebuildSite(currentFacts,writeSourceContent(currentFacts));
    const html = renderSiteDocumentHtml(recomposed,"/",{ preview: true });
    expect(html).toContain("Do not call 716-555-0100 for old orders."); expect(html).toContain("Call 716-555-0199 for new orders.");
    expect(html).toContain('href="tel:7165550199"'); expect(html).not.toContain('href="tel:7165550100"');
    const removed = await h.service.resolveFact(actor,edited.workId,factId,{ ...selection(edited), action: "remove" });
    currentFacts.facts = clone(removed.rebuild.candidate!.document.facts); currentFacts.contact = currentFacts.contact.filter(id => id !== factId);
    const without = await composeRebuildSite(currentFacts,writeSourceContent(currentFacts));
    const removedHtml = renderSiteDocumentHtml(without,"/",{ preview: true });
    expect(removedHtml).toContain("Do not call 716-555-0100 for old orders.");
    expect(removedHtml).not.toContain('href="tel:7165550100"'); expect(removedHtml).not.toContain('href="tel:7165550199"');
  });
  it.each(["email", "phone"] as const)("keeps %s routing coherent across description chunks, equivalent displays, corrections and removal", async kind => {
    const prefix = "Fresh bread for local pickup. " + "bread ".repeat(41) + (kind === "email" ? "Email " : "Call ");
    const before = kind === "email" ? "orders@example.test" : "(716) 555-0100";
    const alternate = kind === "email" ? "orders@example.test" : "716.555.0100";
    const after = kind === "email" ? "pickup@example.test" : "+1 716 555 0199";
    const newHref = kind === "email" ? "mailto:pickup@example.test" : "tel:+17165550199";
    const description = prefix + before + ". " + (kind === "email" ? "Email " : "Call ") + alternate + ". We bake rye bread.";
    const h = harness(); const record = await h.create({ ...brief, description }); const document = record.rebuild.candidate!.document;
    const contacts = Object.entries(document.facts).filter(([,fact]) => fact.kind === "contact"); expect(contacts).toHaveLength(1);
    const [factId] = contacts[0]!;
    const initial = extractBusinessFacts({ ...brief, description });
    expect(initial.claims.filter(id => id !== initial.nameFactId).map(id => initial.facts[id]!.text).join(" ")).toBe(description.trim());
    const edited = await h.service.resolveFact(actor,record.workId,factId,{ ...selection(record), action: "edit", text: after });
    const current = { ...initial, facts: clone(edited.rebuild.candidate!.document.facts) };
    const recomposed = await composeRebuildSite(current,writeSourceContent(current));
    for (const doc of [edited.rebuild.candidate!.document,recomposed]) {
      const html = renderSiteDocumentHtml(doc,"/",{ preview: true });
      expect(html).toContain(`href="${newHref}"`); expect(html).not.toContain(before); expect(html).not.toContain(alternate); expect(html).toContain("We bake rye bread.");
    }
    expect(edited.rebuild.input).toEqual(record.rebuild.input);
    const removed = await h.service.resolveFact(actor,edited.workId,factId,{ ...selection(edited), action: "remove" });
    current.facts = clone(removed.rebuild.candidate!.document.facts); current.contact = current.contact.filter(id => id !== factId);
    const removedCopy = renderSiteDocumentHtml(await composeRebuildSite(current,writeSourceContent(current)),"/",{ preview: true });
    expect(removedCopy).not.toContain(newHref); expect(removedCopy).not.toContain(after); expect(removedCopy).not.toContain(before); expect(removedCopy).toContain("We bake rye bread.");
  });
  it("allows unrelated ordinary copy corrections while preserving the offered destination", async () => {
    const h = harness(); const record = await h.create({ ...brief, description: "Email orders@example.test. We bake bread." });
    const [claimId] = Object.entries(record.rebuild.candidate!.document.facts).find(([,fact]) => fact.kind === "claim" && fact.text.includes("Email"))!;
    const edited = await h.service.resolveFact(actor,record.workId,claimId,{ ...selection(record), action: "edit", text: "Email orders@example.test. We bake rye bread." });
    expect(renderSiteDocumentHtml(edited.rebuild.candidate!.document,"/",{ preview: true })).toContain("We bake rye bread.");
    expect(renderSiteDocumentHtml(edited.rebuild.candidate!.document,"/contact",{ preview: true })).toContain('href="mailto:orders@example.test"');
  });
  it.each(["edit", "remove"] as const)("refuses reciprocal %s of supplied routing in the ordinary claim before commit", async action => {
    const h = harness(); const record = await h.create({ ...brief, description: "Email orders@example.test. We bake bread." });
    const [claimId] = Object.entries(record.rebuild.candidate!.document.facts).find(([,fact]) => fact.kind === "claim" && fact.text.includes("Email"))!;
    const commits = vi.mocked(h.documents.commitCandidate).mock.calls.length;
    await expect(h.service.resolveFact(actor,record.workId,claimId,{ ...selection(record), action, ...(action === "edit" ? { text: "Email new@example.test. We bake bread." } : {}) })).rejects.toThrow("Edit the separate email or phone fact first");
    expect(h.documents.commitCandidate).toHaveBeenCalledTimes(commits);
    expect((await h.service.read(actor,record.workId)).rebuild.candidate).toEqual(record.rebuild.candidate);
  });
  it("removes a flagged claim from dependent content and metadata", async () => {
    const h = harness(); const record = await h.create({ ...brief, description: "We have 20 years of experience." }); const [factId] = Object.entries(record.rebuild.candidate!.document.facts).find(([,fact]) => fact.highRisk)!;
    const removed = await h.service.resolveFact(actor,record.workId,factId,{ ...selection(record), action: "remove" }); const doc = removed.rebuild.candidate!.document; expect(doc.facts[factId]).toBeUndefined(); expect(Object.values(doc.nodes).every(node => !node.factIds.includes(factId))).toBe(true); expect(JSON.stringify(doc.nodes)).not.toContain("20 years"); expect(JSON.stringify(doc.pages)).not.toContain("20 years");
  });
  it("removes one source fact from RichText while preserving the other paragraph and evidence", async () => {
    const h = harness(); const original = await h.create(); const work = h.works.get(original.workId)!;
    const document = structuredClone(original.rebuild.candidate!.document); const root = document.nodes[document.pages[0]!.root]!;
    document.facts.first_claim = {text:"We have 20 years of experience.",kind:"claim",highRisk:true,origin:"source",sources:[{sourceId:"fixture-source",quote:"We have 20 years of experience."}],verification:{supported:true,confidence:1}};
    document.facts.second_claim = {text:"We help families prepare wills and trusts.",kind:"service",highRisk:false,origin:"source",sources:[{sourceId:"fixture-source",quote:"We help families prepare wills and trusts."}],verification:{supported:true,confidence:1}};
    document.nodes.two_claims = {id:"two_claims",type:"RichText",variant:"standard",props:{text:"We have 20 years of experience.\n\nWe help families prepare wills and trusts."},children:[],factIds:["first_claim","second_claim"],verification:{supported:true,confidence:1,needsReview:true}};
    root.children.push("two_claims"); const hash = siteDocumentHash(document);
    const record = { ...original,rebuild:{...original.rebuild,candidate:{...original.rebuild.candidate!,document,contentHash:hash}} };
    h.works.set(work.id,{...work,payload:record.rebuild}); h.revisions.get(work.id)![0] = {...h.revisions.get(work.id)![0]!,document,contentHash:hash};
    const removed = await h.service.resolveFact(actor,work.id,"first_claim",{...selection(record),action:"remove"}); const next = removed.rebuild.candidate!.document;
    expect(next.nodes.two_claims).toMatchObject({type:"RichText",props:{text:"We help families prepare wills and trusts."},factIds:["second_claim"]});
    expect(next.facts.first_claim).toBeUndefined(); expect(next.facts.second_claim).toEqual(document.facts.second_claim); expect(next.nodes[root.id]!.children).toEqual(root.children);
    expect(removed.rebuild.status).toBe("review_ready"); expect(removed.rebuild.approvedCandidateRevision).toBeNull();
  });
  it("removes a metadata-only claim without clearing the root body, children or unrelated evidence", async () => {
    const h = harness(); const original = await h.create(); const work = h.works.get(original.workId)!;
    const document = structuredClone(original.rebuild.candidate!.document); const page = document.pages[0]!; const root = document.nodes[page.root]!;
    document.facts.metadata_claim = {text:"We have 20 years of experience.",kind:"claim",highRisk:true,origin:"owner_stated",sources:[]};
    document.facts.retained_copy = {text:"We help families prepare wills and trusts.",kind:"service",highRisk:false,origin:"source",sources:[{sourceId:"fixture-source",quote:"We help families prepare wills and trusts."}],verification:{supported:true,confidence:1}};
    document.nodes.metadata_root = {id:"metadata_root",type:"Story",variant:"long-form",props:{title:"About the firm",body:"We help families prepare wills and trusts."},children:root.children,factIds:["metadata_claim","retained_copy"],verification:{supported:false,confidence:0,needsReview:true}};
    page.root = "metadata_root"; page.description = "We have 20 years of experience."; const hash = siteDocumentHash(document);
    const record = { ...original,rebuild:{...original.rebuild,candidate:{...original.rebuild.candidate!,document,contentHash:hash}} };
    h.works.set(work.id,{...work,payload:record.rebuild}); h.revisions.get(work.id)![0] = {...h.revisions.get(work.id)![0]!,document,contentHash:hash};
    const removed = await h.service.resolveFact(actor,work.id,"metadata_claim",{...selection(record),action:"remove"}); const next = removed.rebuild.candidate!.document;
    expect(next.pages[0]!.description).toBe(""); expect(next.nodes.metadata_root).toMatchObject({type:"Story",props:{title:"About the firm",body:"We help families prepare wills and trusts."},children:root.children,factIds:["retained_copy"]});
    expect(next.facts.retained_copy).toEqual(document.facts.retained_copy); expect(removed.rebuild.status).toBe("review_ready"); expect(removed.rebuild.approvedCandidateRevision).toBeNull();
    expect((await h.service.approve(actor,work.id,selection(removed))).rebuild.status).toBe("approved");
  });
  it("cannot confirm a fact after owner authority was removed, even with continuing member access", async () => {
    const h = harness(); const record = await h.create({ ...brief, description: "We have 20 years of experience." }); const [factId] = Object.entries(record.rebuild.candidate!.document.facts).find(([,fact]) => fact.highRisk)!; h.state.manager = false;
    await expect(h.service.resolveFact(actor,record.workId,factId,{ ...selection(record), action: "confirm" })).rejects.toBeInstanceOf(WorkspaceAccessError); expect(h.revisions.get(record.workId)).toHaveLength(1); expect(h.documents.manage).toHaveBeenCalledOnce();
  });
  it("records read-back failure after accepted publication and never republishes on retry", async () => {
    const h = harness({ checkLiveFailure: true }); const record = await h.launch(await h.create()); expect(record.rebuild.status).toBe("published"); expect(record.rebuild.launch.readBack?.status).toBe("failed");
    const again = await h.service.launch(actor,record.workId,selection(record)); expect(again.rebuild.launch.receipt).toEqual(record.rebuild.launch.receipt); expect(h.documents.publish).toHaveBeenCalledTimes(1); expect(h.checkLive).toHaveBeenCalledTimes(1);
  });
  it("reconciles an accepted durable publication after its saved-work CAS response is lost", async () => {
    const h = harness(); const reviewed = await h.create(); const approved = await h.service.approve(actor,reviewed.workId,selection(reviewed)); h.state.failWorkKind = "rebuild_published";
    await expect(h.service.launch(actor,approved.workId,selection(approved))).rejects.toBeInstanceOf(WorkspaceConflictError); expect(h.publications.size).toBe(1);
    const recovered = await h.service.read(actor,approved.workId); expect(recovered.rebuild.status).toBe("published"); const again = await h.service.launch(actor,recovered.workId,selection(recovered)); expect(again.rebuild.status).toBe("published"); expect(h.documents.publish).toHaveBeenCalledTimes(1); expect(h.checkLive).not.toHaveBeenCalled();
  });
  it("leaves no candidate document when the atomic work CAS loses", async () => {
    const h = harness(); h.state.failCandidateCas = true; await expect(h.create()).rejects.toBeInstanceOf(WorkspaceConflictError); expect(h.revisions.size).toBe(0); expect(websiteRebuildSchema.parse([...h.works.values()][0]!.payload).candidate).toBeNull();
  });
  it("resumes a failed writer from durable extraction without rerunning completed stages", async () => {
    const writer = vi.fn().mockRejectedValueOnce(new Error("Writer unavailable")).mockImplementation(async facts => ({ pages: writeSourceContent(facts).pages })); const h = harness({ pipelineOptions: { writer } }); const failed = await h.create(); expect(failed.rebuild.status).toBe("failed"); expect((failed.rebuild.checkpoint as { completedStages: string[] }).completedStages).toEqual(["crawl","extract"]);
    const resumed = await h.service.retry(actor,failed.workId,{ expectedRevision: failed.rebuild.revision }); expect(resumed.rebuild.status).toBe("review_ready"); expect(writer).toHaveBeenCalledTimes(2); expect(resumed.rebuild.stages.filter(stage => stage.stage === "extract" && stage.status === "completed")).toHaveLength(1);
  });
  it("reorders a fact-free Section through a new reviewed candidate that the owner can explicitly approve", async () => {
    const h = harness(); const reviewed = await h.create(); const approved = await h.service.approve(actor,reviewed.workId,selection(reviewed));
    const document = approved.rebuild.candidate!.document; const root = document.nodes[document.pages[0]!.root]!;
    expect(root.type).toBe("Section"); expect(root.props).toEqual({}); expect(root.children.length).toBeGreaterThan(1);
    const patched = await h.service.patch(actor,approved.workId,{ ...selection(approved), ops: [{ op: "replace", path: `/nodes/${root.id}/children`, value: [...root.children].reverse() }] });
    expect(patched.rebuild.status).toBe("review_ready"); expect(patched.rebuild.approvedCandidateRevision).toBeNull();
    expect(patched.rebuild.candidate!.revision).toBeGreaterThan(approved.rebuild.candidate!.revision); expect(patched.rebuild.candidate!.contentHash).not.toBe(approved.rebuild.candidate!.contentHash);
    expect(patched.rebuild.candidate!.document.nodes[root.id]!.children).toEqual([...root.children].reverse());
    expect(patched.rebuild.candidate!.document.nodes[root.id]!.factIds).toEqual([]); expect(patched.rebuild.candidate!.document.nodes[root.id]!.verification?.needsReview).toBe(false);
    await expect(h.service.launch(actor,patched.workId,selection(patched))).rejects.toBeInstanceOf(WorkspaceConflictError); expect(h.documents.publish).not.toHaveBeenCalled();
    const reapproved = await h.service.approve(actor,patched.workId,selection(patched)); expect(reapproved.rebuild.status).toBe("approved"); expect(reapproved.rebuild.approvedCandidateRevision).toBe(patched.rebuild.candidate!.revision);
  });
  it("adds an estate-planning page with navigation through owner review, renders and exports it, then undoes it", async () => {
    const h = harness(); const original = await h.create(); const oldDocument = original.rebuild.candidate!.document;
    const header = Object.values(oldDocument.nodes).find(node => node.type === "Header")!; const footer = Object.values(oldDocument.nodes).find(node => node.type === "Footer")!;
    const oldLinks = header.type === "Header" ? header.props.links ?? [] : [];
    let record = await h.service.patch(actor,original.workId,{ ...selection(original),ops:[
      { op:"add",path:"/nodes/estate_hero",value:{ id:"estate_hero",type:"Hero",variant:"statement",props:{ title:"Estate planning",body:"We help families prepare wills and trusts." },children:[],factIds:[] } },
      { op:"add",path:"/nodes/estate_root",value:{ id:"estate_root",type:"Section",variant:"container",props:{},children:[header.id,"estate_hero",footer.id],factIds:[] } },
      { op:"add",path:"/pages/-",value:{ path:"/estate-planning",title:"Estate planning",description:"We have 20 years of experience.",root:"estate_root" } },
      { op:"add",path:`/nodes/${header.id}/props/links`,value:[...oldLinks,{label:"Estate planning",href:"/estate-planning"}] },
    ] });
    expect(record.rebuild.status).toBe("review_ready"); expect(record.rebuild.approvedCandidateRevision).toBeNull();
    await expect(h.service.approve(actor,record.workId,selection(record))).rejects.toBeInstanceOf(WorkspaceConflictError);
    await expect(h.service.patch(actor,record.workId,{ ...selection(original),ops:[{op:"replace",path:"/pages/0/title",value:"Stale change"}] })).rejects.toBeInstanceOf(WorkspaceConflictError);
    expect(unresolvedSiteFacts(record.rebuild.candidate!.document).some(id => record.rebuild.candidate!.document.facts[id]!.text === "We have 20 years of experience.")).toBe(true);
    for (const id of unresolvedSiteFacts(record.rebuild.candidate!.document)) record = await h.service.resolveFact(actor,record.workId,id,{...selection(record),action:"confirm"});
    record = await h.service.approve(actor,record.workId,selection(record)); expect(record.rebuild.status).toBe("approved");
    const candidate = record.rebuild.candidate!; const html = renderSiteDocumentHtml(candidate.document,"/estate-planning",{preview:true});
    expect(html).toContain("<title>Estate planning</title>"); expect(html).toContain("Estate planning</h1>"); expect(html).toContain('href="/estate-planning"'); expect(html).toContain(candidate.contentHash);
    const exported = buildSiteDocumentExport(candidate.document,{workspaceId,workId:record.workId,revision:candidate.revision});
    expect(exported.contentHash).toBe(candidate.contentHash); expect(exported.files.find(file => file.path === "estate-planning/index.html")?.content).toContain("Estate planning</h1>");
    record = await h.service.undo(actor,record.workId,{...selection(record),targetRevision:original.rebuild.candidate!.revision});
    expect(record.rebuild.status).toBe("review_ready"); expect(record.rebuild.approvedCandidateRevision).toBeNull(); expect(record.rebuild.candidate!.document.pages.some(page => page.path === "/estate-planning")).toBe(false);
    expect(record.rebuild.candidate!.contentHash).toBe(original.rebuild.candidate!.contentHash); expect(h.documents.publish).not.toHaveBeenCalled();
  });
  it("lets an owner edit a metadata-only review fact into a new exact candidate", async () => {
    const h = harness(); const original = await h.create();
    const patched = await h.service.patch(actor,original.workId,{ ...selection(original),ops:[{op:"replace",path:"/pages/0/description",value:"We have 20 years of experience."}] });
    const [factId] = Object.entries(patched.rebuild.candidate!.document.facts).find(([,fact]) => fact.text === "We have 20 years of experience.")!;
    const edited = await h.service.resolveFact(actor,patched.workId,factId,{ ...selection(patched),action:"edit",text:"We help families prepare wills and trusts." });
    expect(edited.rebuild.candidate!.document.pages[0]!.description).toBe("We help families prepare wills and trusts.");
    expect(edited.rebuild.candidate!.document.facts[factId]).toMatchObject({origin:"owner_confirmed",highRisk:false});
    expect(edited.rebuild.candidate!.contentHash).not.toBe(patched.rebuild.candidate!.contentHash); expect(edited.rebuild.approvedCandidateRevision).toBeNull();
  });
  it("creates a new reviewed undo revision even when its content hash equals the live pointer", async () => {
    const h = harness(); let record = await h.launch(await h.create()); const liveRevision = record.rebuild.candidate!.revision; const liveHash = record.rebuild.candidate!.contentHash;
    const heroId = Object.values(record.rebuild.candidate!.document.nodes).find(node => node.type === "Hero")!.id;
    record = await h.service.patch(actor,record.workId,{ ...selection(record), ops: [{ op: "replace", path: `/nodes/${heroId}/props/title`, value: "Talk with our team" }] });
    record = await h.service.undo(actor,record.workId,{ ...selection(record), targetRevision: liveRevision });
    expect(record.rebuild.candidate!.revision).toBeGreaterThan(liveRevision); expect(record.rebuild.candidate!.contentHash).toBe(liveHash); expect(record.rebuild.status).toBe("review_ready"); expect(record.rebuild.approvedCandidateRevision).toBeNull(); expect((await h.service.read(actor,record.workId)).rebuild.status).toBe("review_ready");
    await expect(h.service.launch(actor,record.workId,selection(record))).rejects.toBeInstanceOf(WorkspaceConflictError); expect(h.documents.publish).toHaveBeenCalledTimes(1);
  });
  it("denies saved work after membership revocation without starting another build", async () => {
    const h = harness(); const record = await h.create(); h.state.member = false;
    await expect(h.service.read(actor,record.workId)).rejects.toBeInstanceOf(WorkspaceAccessError);
    await expect(h.service.approve(actor,record.workId,selection(record))).rejects.toBeInstanceOf(WorkspaceAccessError);
    expect(h.pipeline).toHaveBeenCalledTimes(1); expect(h.documents.publish).not.toHaveBeenCalled();
  });
  it("uses the actual published tenant authority for a domain change while a separate draft awaits review", async () => {
    const h = harness(); let record = await h.launch(await h.create()); const publishedHash = record.rebuild.candidate!.contentHash;
    const heroId = Object.values(record.rebuild.candidate!.document.nodes).find(node => node.type === "Hero")!.id;
    record = await h.service.patch(actor,record.workId,{ ...selection(record), ops: [{ op: "replace", path: `/nodes/${heroId}/props/title`, value: "Talk with our team" }] });
    expect(record.rebuild.status).toBe("review_ready"); await h.service.domain(actor,record.workId,{ expectedRevision: record.rebuild.revision, domain: "business.example.test", action: "attach" });
    expect(h.domainChange).toHaveBeenCalledOnce(); expect((await h.documents.published(record.rebuild.tenantId!))!.contentHash).toBe(publishedHash); expect((await h.service.read(actor,record.workId)).rebuild.approvedCandidateRevision).toBeNull();
  });

  it.each(["remove", "edit"] as const)("%s also changes a truncated claim in page metadata", async action => {
    const description = "We have 20 years of experience. " + "We explain the process and answer your questions clearly. ".repeat(7);
    const h = harness(); const record = await h.create({ ...brief, description });
    const [factId, fact] = Object.entries(record.rebuild.candidate!.document.facts).find(([,value]) => value.highRisk)!;
    expect(fact.text.length).toBeGreaterThan(160); expect(record.rebuild.candidate!.document.pages[0]!.description).toContain("20 years");
    const changed = await h.service.resolveFact(actor,record.workId,factId,{ ...selection(record), action, ...(action === "edit" ? { text: "We help families plan their next step." } : {}) });
    expect(changed.rebuild.candidate!.document.pages.every(page => !page.description.includes("20 years"))).toBe(true);
    if (action === "edit") expect(changed.rebuild.candidate!.document.pages[0]!.description).toContain("We help families plan their next step.");
  });
  it("initializes a copied handoff as a new owner-specific review and clears source confirmations", async () => {
    const h = harness(); const source = await h.create({ ...brief, description: "We have 20 years of experience." }); const [factId] = Object.entries(source.rebuild.candidate!.document.facts).find(([,fact]) => fact.highRisk)!;
    const confirmed = await h.service.resolveFact(actor,source.workId,factId,{ ...selection(source), action: "confirm" });
    const copyId = "71000000-0000-4000-8000-000000000099"; const sourceWork = h.works.get(source.workId)!;
    h.works.set(copyId,{ ...clone(sourceWork), id: copyId, sourceWorkId: source.workId, payload: { ...confirmed.rebuild, revision: 0, candidate: null, status: "building", checkpoint: null, approvedCandidateRevision: null, tenantId: null, history: [], launch: { receipt: null, readBack: null } } });
    h.revisions.set(copyId,clone(h.revisions.get(source.workId)!).map(row => ({ ...row, workId: copyId })));
    const accepted = { handoffId: "71000000-0000-4000-8000-000000000098", customerWorkId: copyId, customerWorkspaceId: workspaceId, alreadyAccepted: false };
    const received = await h.service.initializeHandoff(actor,accepted);
    expect(received.rebuild.candidate!.revision).toBeGreaterThan(confirmed.rebuild.candidate!.revision); expect(received.rebuild.candidate!.contentHash).not.toBe(confirmed.rebuild.candidate!.contentHash);
    expect(received.rebuild.candidate!.document.facts[factId]!.origin).toBe("owner_stated"); expect(unresolvedSiteFacts(received.rebuild.candidate!.document)).toContain(factId); expect(received.rebuild.approvedCandidateRevision).toBeNull();
    const replay = await h.service.initializeHandoff(actor,{ ...accepted, alreadyAccepted: true }); expect(replay).toEqual(received);
    await expect(h.service.approve(actor,copyId,selection(received))).rejects.toBeInstanceOf(WorkspaceConflictError);
  });

});

describe("website System: publish onto a linked site, routing after a rename, operator domains (2026-10-08)", () => {
  /** A linked-site publication port over the harness's memory maps. The SQL proof is tests/website-linked-publication-schema.sql. */
  function withLinkedSite(h: ReturnType<typeof harness>, linked = "linked-client") {
    const approvals = new Map<string,{ revision: number; contentHash: string }>();
    const originalApprove = h.documents.approve;
    h.documents.approve = async (user,key) => { await originalApprove(user,key); approvals.set(key.workId,{ revision: key.revision, contentHash: key.contentHash }); };
    h.documents.publishToLinkedTenant = vi.fn(async (_user, key) => {
      if (key.tenantId !== linked) throw new WorkspaceAccessError();
      const approval = approvals.get(key.workId);
      if (!approval || approval.revision !== key.revision || approval.contentHash !== key.contentHash) throw new WorkspaceConflictError("This website changed or is already rebuilding. Reload before continuing.");
      const row = h.revisions.get(key.workId)!.find(item => item.revision === key.revision)!;
      const publication = { ...row, tenantId: key.tenantId, receipt: key.receipt };
      h.publications.set(key.tenantId, clone(publication));
      return { ...clone(publication), priorDeliveryModel: "custom_repo" as const, fallbackUntil: "2026-10-31T12:00:00.000Z" };
    });
    return h;
  }
  it("publishes an approved rebuild onto the linked site and reports each part of the cutover", async () => {
    const h = withLinkedSite(harness()); const reviewed = await h.create();
    const approved = await h.service.approve(actor,reviewed.workId,selection(reviewed));
    const result = await h.service.publishOntoLinkedTenant(actor,approved.workId,{ ...selection(approved), tenantId: "linked-client" });
    expect(h.documents.publishToLinkedTenant).toHaveBeenCalledOnce();
    expect(h.documents.reserveHostedTenant).not.toHaveBeenCalled();
    expect(result.rebuild).toMatchObject({ status: "published", tenantId: "linked-client" });
    expect(result.rebuild.launch.receipt).toMatchObject({ provider: "strelva-hosted", providerUrl: "https://linked-client.strelva.com/", artifactHash: approved.rebuild.candidate!.contentHash });
    expect(Object.fromEntries(result.cutover.map(item => [item.id, item.status]))).toEqual({ document_published: "done", read_back: "done", domain_moved: "waiting", old_project_kept: "waiting", redirects_live: expect.stringMatching(/^(done|not_needed)$/) });
    expect(result.cutover.find(item => item.id === "old_project_kept")!.label).toContain("2026-10-31");
    expect(result.cutover.find(item => item.id === "domain_moved")!.label).toMatch(/DNS step/);
    expect(result.priorDeliveryModel).toBe("custom_repo");
  });
  it("refuses before approval, for an unlinked site and when the store cannot publish onto a site", async () => {
    const h = withLinkedSite(harness()); const reviewed = await h.create();
    await expect(h.service.publishOntoLinkedTenant(actor,reviewed.workId,{ ...selection(reviewed), tenantId: "linked-client" })).rejects.toBeInstanceOf(WorkspaceConflictError);
    expect(h.documents.publishToLinkedTenant).not.toHaveBeenCalled();
    const approved = await h.service.approve(actor,reviewed.workId,selection(reviewed));
    await expect(h.service.publishOntoLinkedTenant(actor,approved.workId,{ ...selection(approved), tenantId: "someone-else" })).rejects.toBeInstanceOf(WorkspaceAccessError);
    await expect(h.service.publishOntoLinkedTenant(actor,approved.workId,{ ...selection(approved), tenantId: "Not A Slug" })).rejects.toThrow();
    const bare = harness(); const other = await bare.create(); const ok = await bare.service.approve(actor,other.workId,selection(other));
    await expect(bare.service.publishOntoLinkedTenant(actor,ok.workId,{ ...selection(ok), tenantId: "linked-client" })).rejects.toThrow(/unavailable/);
  });
  it("records a failed read-back without publishing again", async () => {
    const h = withLinkedSite(harness({ checkLiveFailure: true })); const reviewed = await h.create();
    const approved = await h.service.approve(actor,reviewed.workId,selection(reviewed));
    const result = await h.service.publishOntoLinkedTenant(actor,approved.workId,{ ...selection(approved), tenantId: "linked-client" });
    expect(result.cutover.find(item => item.id === "read_back")!.status).toBe("failed");
    expect(result.rebuild.status).toBe("published");
    expect(h.documents.publishToLinkedTenant).toHaveBeenCalledOnce();
  });
  it.each([undefined, { baseUrl: "https://app.example.test", tenant: "linked-client", inquiry: { capabilityId: "changed-form", version: 2 } }])("refuses a revoked or changed visitor connection before linked publishing", async projection => {
    const resolveCapabilities = vi.fn(async () => projection);
    const h = withLinkedSite(harness({ resolveCapabilities }));
    const reviewed = await h.create();
    const approved = await h.service.approve(actor,reviewed.workId,selection(reviewed));
    const work = h.works.get(approved.workId)!;
    h.works.set(work.id,{ ...work, payload: { ...approved.rebuild, publishedCapabilitySelection: { tenantId: "linked-client", inquiryCapabilityId: "original-form" } } });
    await expect(h.service.publishOntoLinkedTenant(actor,approved.workId,{ ...selection(approved), tenantId: "linked-client" })).rejects.toThrow("connection changed");
    expect(resolveCapabilities).toHaveBeenCalledExactlyOnceWith(actor,workspaceId,approved.workId,{ tenantId: "linked-client", inquiryCapabilityId: "original-form" });
    expect(h.documents.publishToLinkedTenant).not.toHaveBeenCalled();expect(h.publications.size).toBe(0);
  });
  it("reconciles an accepted linked publication after a visitor grant is revoked without another write", async () => {
    const resolveCapabilities = vi.fn(async () => undefined);
    const h = withLinkedSite(harness({ resolveCapabilities }));
    const reviewed = await h.create();
    const approved = await h.service.approve(actor,reviewed.workId,selection(reviewed));
    const published = await h.service.publishOntoLinkedTenant(actor,approved.workId,{ ...selection(approved), tenantId: "linked-client" });
    const work = h.works.get(published.workId)!;
    h.works.set(work.id,{ ...work, payload: { ...published.rebuild, publishedCapabilitySelection: { tenantId: "linked-client", inquiryCapabilityId: "original-form" } } });
    h.documents.linkedPublications = vi.fn(async () => [{ tenantId: "linked-client", tenantSlugAtPublication: "linked-client", publishedBy: actor.userId, revision: published.rebuild.candidate!.revision, contentHash: published.rebuild.candidate!.contentHash, priorDeliveryModel: "custom_repo" as const, fallbackUntil: published.fallbackUntil, publishedAt: fixedTime }]);
    const reconciled = await h.service.publishOntoLinkedTenant(actor,published.workId,{ ...selection(published), tenantId: "linked-client" });
    expect(reconciled.rebuild.launch.receipt).toEqual(published.rebuild.launch.receipt);
    expect(resolveCapabilities).not.toHaveBeenCalled();expect(h.documents.publishToLinkedTenant).toHaveBeenCalledOnce();expect(h.checkLive).toHaveBeenCalledOnce();
  });
  it("routes reads and domain work to the current slug after a rename without rewriting the receipt", async () => {
    const h = harness(); const record = await h.launch(await h.create());
    const oldSlug = record.rebuild.tenantId!; const issued = record.rebuild.launch.receipt!;
    // A rename moves the publication row (on update cascade); the saved payload keeps the old slug.
    const row = h.publications.get(oldSlug)!; h.publications.delete(oldSlug); h.publications.set("renamed-site",{ ...row, tenantId: "renamed-site" });
    h.documents.currentTenant = vi.fn(async () => ({ tenantId: "renamed-site", source: "publication" as const, deliveryModel: "platform_template" }));
    const read = await h.service.read(actor,record.workId);
    expect(read.rebuild.tenantId).toBe("renamed-site");
    expect(read.rebuild.launch.receipt).toEqual(issued);
    expect(websiteRebuildSchema.parse(h.works.get(record.workId)!.payload).tenantId).toBe(oldSlug);
    await h.service.domain(actor,record.workId,{ expectedRevision: read.rebuild.revision, domain: "business.example.test", action: "attach" });
    expect(h.domainChange).toHaveBeenCalledWith("renamed-site", { domain: "business.example.test", action: "attach" }, expect.anything());
  });
  it("keeps the payload slug when current routing cannot be read, but never hides an access failure", async () => {
    const h = harness(); const record = await h.launch(await h.create());
    h.documents.currentTenant = vi.fn(async () => { throw new Error("storage unavailable"); });
    expect((await h.service.read(actor,record.workId)).rebuild.tenantId).toBe(record.rebuild.tenantId);
    h.documents.currentTenant = vi.fn(async () => { throw new WorkspaceAccessError(); });
    await expect(h.service.read(actor,record.workId)).rejects.toBeInstanceOf(WorkspaceAccessError);
  });
  it("lets the owner approve a hostname and an operator attach it only through the domain authority", async () => {
    const h = harness(); const record = await h.launch(await h.create());
    h.documents.approveDomain = vi.fn(async (_user, input) => ({ hostname: input.hostname, expiresAt: "2026-10-22T12:00:00.000Z" }));
    const approved = await h.service.domain(actor,record.workId,{ expectedRevision: record.rebuild.revision, domain: "WWW.Business.example.test", action: "approve" }) as { approved?: { hostname: string } };
    expect(approved.approved?.hostname).toBe("www.business.example.test");
    expect(h.domainChange).not.toHaveBeenCalled();
    h.documents.authorizeDomain = vi.fn(async () => "provider" as const);
    await h.service.domain(actor,record.workId,{ expectedRevision: record.rebuild.revision, domain: "www.business.example.test", action: "attach" });
    expect(h.documents.authorizeDomain).toHaveBeenCalledWith(actor, expect.objectContaining({ hostname: "www.business.example.test", action: "attach", tenantId: record.rebuild.tenantId }));
    expect(h.domainChange).toHaveBeenCalledOnce();
    // The provider write re-checks the same authority before touching the provider.
    const options = (h.domainChange.mock.calls[0] as unknown[])[2] as { authorizeWrite: () => Promise<void> };
    await options.authorizeWrite(); expect(h.documents.authorizeDomain).toHaveBeenCalledTimes(2);
  });
  it("does not touch the domain provider when the owner has not approved the hostname", async () => {
    const h = harness(); const record = await h.launch(await h.create());
    h.documents.authorizeDomain = vi.fn(async () => { throw new WorkspaceConflictError("The owner hasn't approved this domain yet. Strelva can prepare the records; the owner decides."); });
    await expect(h.service.domain(actor,record.workId,{ expectedRevision: record.rebuild.revision, domain: "www.business.example.test", action: "attach" })).rejects.toThrow(/owner hasn't approved/);
    expect(h.domainChange).not.toHaveBeenCalled();
  });
});
