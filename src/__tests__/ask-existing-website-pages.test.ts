import { describe, expect, it, vi } from "vitest";
import { prepareExistingAskWebsitePages } from "@/app/api/workspace/ask/existing-website-possibility-server";
import { createWebsiteRebuildService } from "@/products/websites/rebuild-service";
import { composeAskPageSet } from "@/products/websites/ask-page-set";
import { existingWebsitePageOperations } from "@/products/websites/ask-existing-pages";
import { siteDocumentHash, type SiteDocument } from "@/products/websites/site-document";
import { websiteRebuildSchema, type WebsiteRebuildRecord } from "@/products/websites/rebuild-contracts";
import type { WebsiteDocumentStore, WebsiteDocumentRevision } from "@/products/websites/document-store";
import type { BoundedStore } from "@/platform/bounded-work/repository";
import type { SavedWork } from "@/platform/workspaces/types";
import type { SystemListing } from "@/platform/systems/from-existing";
import { createPossibilityAdapter, type AskPossibilityInput } from "@/platform/ask/ports";
import { createInMemoryPossibilityRepository } from "@/platform/possibilities";
import { syncAskPageSetPossibilities } from "@/experience/systems/stored-possibilities";
import { possibilityTryState } from "@/experience/systems/try-state";
import { signPossibilityPreviewToken } from "@/platform/possibilities/preview-link";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const workId = "22222222-2222-4222-8222-222222222222";
const systemId = "33333333-3333-4333-8333-333333333333";
const revisionId = "44444444-4444-4444-8444-444444444444";
const stableId = "55555555-5555-4555-8555-555555555555";
const actor = { userId: "owner", verifiedEmail: "owner@example.test" };
const time = "2026-10-07T12:00:00.000Z";
const page = { path: "/services", title: "Consulting", description: "Services for business owners", paragraphs: ["We help owners plan their next move."] };
const input: AskPossibilityInput = { workspaceId, systemId, title: "Service pages", intent: "Prepare new service pages", words: "Add our consulting services", origin: "owner_interpreted", introduces: { key: "service-pages", name: "Service pages", purpose: "Explain services", summary: "Consulting service pages" }, candidate: { kind: "existing-website-pages", mode: "page-set", pages: [page] }, check: "Try every page" };
function fixture() {
  const document = composeAskPageSet("Example", { kind: "website-pages", pages: [{ path: "/", title: "Home", description: "Existing home", paragraphs: ["Existing approved copy"] }] }).document;
  Object.values(document.nodes).forEach(node => { if (node.verification) node.verification = { supported: true, confidence: 1, needsReview: false }; });
  const hash = siteDocumentHash(document);
  return { workspaceId, workId, rebuild: websiteRebuildSchema.parse({ version: 2, revision: 4, title: "Example", input: { requestId: "native-published", businessName: "Example", description: "Existing site" }, status: "published", stages: [], checkpoint: null, sourceAudit: null, audit: null, pageMapping: [], candidate: { revision: 1, contentHash: hash, document, previewHref: `/api/websites/${workId}/preview?revision=1&contentHash=${hash}` }, approvedCandidateRevision: 1, tenantId: "example", launch: { receipt: null, readBack: null }, lastError: null, createdBy: actor.userId, createdAt: time, history: [] }) };
}
function harness() {
  const record = fixture();
  const site = { system: { id: systemId, businessId: workspaceId, kind: "website", currentRevision: { businessId: workspaceId, systemId, revisionId, number: 3 } }, provenance: "stored", references: { savedWorkId: workId, tenantId: "example", tenantStableId: stableId } } as SystemListing;
  const prepare = vi.fn(async (): Promise<WebsiteRebuildRecord> => ({ ...record, rebuild: { ...record.rebuild, status: "review_ready", candidate: { ...record.rebuild.candidate!, revision: 2 } } }));
  const deps = { released: async () => true, target: vi.fn(async () => site), read: vi.fn(async () => record), prepare };
  return { record, site, deps };
}
function serviceHarness() {
  const record = fixture();
  let work = { id: workId, workspaceId, productId: "websites", resourceKind: "website", title: "Example", input: record.rebuild.input, payload: record.rebuild, createdBy: actor.userId, createdAt: time, updatedAt: time } as SavedWork;
  const published = { workspaceId, workId, revision: 1, contentHash: record.rebuild.candidate!.contentHash, document: structuredClone(record.rebuild.candidate!.document), tenantId: "example", createdBy: actor.userId, createdAt: time } as WebsiteDocumentRevision;
  const commitCandidate = vi.fn(async (_actor, value) => { work = { ...work, payload: value.payload }; return work; });
  const manage = vi.fn(async () => undefined);
  const publishedRead = vi.fn(async () => published);
  const resolveCapabilities = vi.fn(async () => record.rebuild.candidate!.document.capabilities);
  const documents = { manage, published: publishedRead, read: async () => published, commitCandidate } as unknown as WebsiteDocumentStore;
  const store = { read: async () => work, member: vi.fn(async () => undefined) } as unknown as BoundedStore;
  const service = createWebsiteRebuildService(store, { documents, resolveCapabilities, now: () => time });
  const selection = () => ({ expectedRevision: 4, candidateRevision: 1, candidateContentHash: record.rebuild.candidate!.contentHash, candidate: input.candidate });
  return { record, published, commitCandidate, manage, publishedRead, resolveCapabilities, service, selection, setWork: (value: SavedWork) => { work = value; }, work: () => work };
}
describe("Ask existing-native website alternatives", () => {
  it("pins actual System baseline, original words and same Work publication effect", async () => {
    const h = harness();
    const prepared = await prepareExistingAskWebsitePages(actor, input, h.deps);
    expect(prepared.changes[0]!.baseline).toEqual(h.site.system.currentRevision);
    expect(prepared.content).toMatchObject({ kind: "ask-existing-website-pages", mode: "page-set", rebuildWorkId: workId, originalWords: input.words, askOrigin: "owner_interpreted" });
    const repo = createInMemoryPossibilityRepository();
    const opened = await createPossibilityAdapter(repo, { durable: true, prepare: async () => prepared }).open(actor, input);
    const p = (await repo.get(workspaceId, opened.id))!;
    expect(p.introduces).toEqual([]);
    expect(p.effects[0]).toMatchObject({ system: { systemId }, channel: "hosted_website", request: { workId } });
  });
  it("does not read or prepare anything with the rebuild release off", async () => {
    const h = harness();
    await expect(prepareExistingAskWebsitePages(actor, input, { ...h.deps, released: async () => false })).rejects.toThrow("not enabled");
    expect(h.deps.target).not.toHaveBeenCalled(); expect(h.deps.read).not.toHaveBeenCalled(); expect(h.deps.prepare).not.toHaveBeenCalled();
  });
  it.each(["projected", "foreign", "no-baseline", "pending", "visitor-flow"])("refuses %s without saving a native draft", async mode => {
    const h = harness();
    if (mode === "projected") h.site.provenance = "existing";
    if (mode === "foreign") h.site.system.businessId = stableId;
    if (mode === "no-baseline") h.site.system.currentRevision = null;
    if (mode === "pending") h.record.rebuild.status = "review_ready";
    const ask = mode === "visitor-flow" ? { ...input, candidate: { kind: "existing-website-pages" as const, mode: "page-set" as const, pages: [{ ...page, title: "Booking form" }] } } : input;
    await expect(prepareExistingAskWebsitePages(actor, ask, h.deps)).rejects.toThrow();
    expect(h.deps.prepare).not.toHaveBeenCalled();
  });
  it.each(["page-set", "section", "rebuild"] as const)("prepares a real %s while leaving published copy and live pointer unchanged", async mode => {
    const h = serviceHarness();
    const result = await h.service.prepareExistingPages(actor, workId, { ...h.selection(), candidate: { kind: "existing-website-pages", mode, pages: [{ ...page, path: mode === "page-set" ? "/services" : "/" }] } });
    expect(h.manage).toHaveBeenCalledWith(actor, { workspaceId, workId });
    expect(result.rebuild.status).toBe("review_ready"); expect(result.rebuild.approvedCandidateRevision).toBeNull();
    expect(JSON.stringify(result.rebuild.candidate!.document)).toContain(page.paragraphs[0]);
    expect(h.published.document.pages).toHaveLength(1);
    expect(JSON.stringify(h.published.document)).not.toContain(page.paragraphs[0]);
    expect(h.published.revision).toBe(1);
    expect(Object.values(result.rebuild.candidate!.document.facts).some(fact => fact.highRisk && fact.origin !== "owner_confirmed")).toBe(true);
    expect(h.commitCandidate).toHaveBeenCalledTimes(1);
    await expect(h.service.prepareExistingPages(actor, workId, h.selection())).rejects.toThrow("changed");
    expect(h.commitCandidate).toHaveBeenCalledTimes(1);
  });
  it.each(["foreign-publication", "stale-publication", "access", "storage"])("holds %s failures without a live change", async failure => {
    const h = serviceHarness();
    if (failure === "foreign-publication") h.published.workspaceId = stableId;
    if (failure === "stale-publication") h.published.revision = 2;
    if (failure === "access") h.manage.mockRejectedValue(new Error("Access revoked"));
    if (failure === "storage") h.commitCandidate.mockRejectedValue(new Error("Store unavailable"));
    await expect(h.service.prepareExistingPages(actor, workId, h.selection())).rejects.toThrow();
    expect(h.published.document.pages).toHaveLength(1);
    if (failure !== "storage") expect(h.commitCandidate).not.toHaveBeenCalled();
  });
  it("preserves executable pages and exact grants; refuses missing/revoked grants", async () => {
    const h = serviceHarness();
    const document = h.record.rebuild.candidate!.document;
    document.capabilities = { baseUrl: "https://app.example.test", tenant: "example", inquiry: { capabilityId: "contact", version: 2 } };
    document.nodes.form = { id: "form", type: "InquiryForm", variant: "inline", props: { title: "Contact" }, children: [], factIds: [] };
    document.nodes.contact = { id: "contact", type: "Section", variant: "container", props: {}, children: ["form"], factIds: [] };
    document.pages.push({ path: "/contact", title: "Contact", description: "", root: "contact" });
    h.record.rebuild.candidate!.contentHash = siteDocumentHash(document);
    h.record.rebuild.publishedCapabilitySelection = { tenantId: "example", inquiryCapabilityId: "contact" };
    h.setWork({ ...h.work(), payload: h.record.rebuild });
    h.published.document = structuredClone(document); h.published.contentHash = siteDocumentHash(document);
    const result = await h.service.prepareExistingPages(actor, workId, { ...h.selection(), candidate: { kind: "existing-website-pages", mode: "rebuild", pages: [{ ...page, path: "/" }] } });
    expect(result.rebuild.candidate!.document.capabilities).toEqual(document.capabilities);
    expect(result.rebuild.candidate!.document.pages.find(page => page.path === "/contact")).toEqual(document.pages[1]);
    expect(result.rebuild.candidate!.document.nodes.form).toEqual(document.nodes.form);
    expect(result.rebuild.publishedCapabilitySelection).toEqual(h.record.rebuild.publishedCapabilitySelection);
    expect(h.resolveCapabilities).toHaveBeenCalledWith(actor, workspaceId, workId, h.record.rebuild.publishedCapabilitySelection, { requireConnectedCalendar: true });
    expect(() => existingWebsitePageOperations(document, { kind: "existing-website-pages", mode: "rebuild", pages: [{ ...page, path: "/contact" }] })).toThrow("informational");
    h.setWork({ ...h.work(), payload: h.record.rebuild }); h.resolveCapabilities.mockResolvedValue(undefined); h.commitCandidate.mockClear();
    await expect(h.service.prepareExistingPages(actor, workId, h.selection())).rejects.toThrow("connections changed");
    expect(h.commitCandidate).not.toHaveBeenCalled();
  });
  it("rechecks preserved visitor grants at publication and refuses revocation before writes", async () => {
    const h = serviceHarness();
    const work = h.work();
    const rebuild = websiteRebuildSchema.parse(work.payload);
    rebuild.status = "approved";
    rebuild.publishedCapabilitySelection = { tenantId: "example", inquiryCapabilityId: "contact" };
    rebuild.history = [{ revision: 4, kind: "ask_existing_pages_prepared", actorId: actor.userId, at: time }];
    h.setWork({ ...work, payload: rebuild });
    h.publishedRead.mockResolvedValue(null as unknown as WebsiteDocumentRevision);
    h.resolveCapabilities.mockResolvedValue(undefined);
    await expect(h.service.launch(actor, workId, { expectedRevision: 4, candidateRevision: 1, candidateContentHash: rebuild.candidate!.contentHash })).rejects.toThrow("connection changed");
    expect(h.resolveCapabilities).toHaveBeenCalledWith(actor, workspaceId, workId, rebuild.publishedCapabilitySelection, { requireConnectedCalendar: true });
    expect(h.commitCandidate).not.toHaveBeenCalled();
  });
  it("becomes Ready only after native copy review; Try pins the actual immutable document", async () => {
    const h = serviceHarness();
    const native = await h.service.prepareExistingPages(actor, workId, h.selection());
    const ah = harness(); ah.deps.prepare.mockResolvedValue(native);
    const prepared = await prepareExistingAskWebsitePages(actor, input, ah.deps);
    const repository = createInMemoryPossibilityRepository();
    const opened = await createPossibilityAdapter(repository, { durable: true, prepare: async () => prepared }).open(actor, input);
    const p = (await repository.get(workspaceId, opened.id))!;
    const repo = { ...repository, createFromSource: vi.fn(), listWithSources: vi.fn() };
    const deps = { stored: [{ possibility: p, sourceRef: null, lastActivityAt: p.updatedAt }], repo, actorId: actor.userId, at: time, canWrite: true, read: async () => native, live: { current: async () => ({ revisionId, number: 3, content: {} }) } };
    expect((await syncAskPageSetPossibilities(deps))[0]!.possibility.status).toBe("exploring");
    const reviewed = structuredClone(native);
    const document: SiteDocument = reviewed.rebuild.candidate!.document;
    Object.values(document.facts).forEach(fact => { fact.origin = "owner_confirmed"; });
    Object.values(document.nodes).forEach(node => { if (node.verification) node.verification = { supported: true, confidence: 1, needsReview: false }; });
    reviewed.rebuild.candidate!.revision++; reviewed.rebuild.candidate!.contentHash = siteDocumentHash(document);
    const ready = (await syncAskPageSetPossibilities({ ...deps, read: async () => reviewed }))[0]!.possibility;
    expect(ready.status).toBe("ready"); expect(ready.changes[0]!.baseline).toEqual(p.changes[0]!.baseline);
    vi.stubEnv("APPROVE_LINK_SECRET", "fictional-alternative-preview-key");
    try {
      const claims = { workspaceId, possibilityId: ready.id, candidateRevision: ready.candidateRevision };
      const state = await possibilityTryState(signPossibilityPreviewToken(claims), { enabled: async () => true, read: async () => ready });
      expect(state).toMatchObject({ kind: "ready", view: { websiteDocument: document, takesSubmissions: false } });
      const tampered = structuredClone(ready); tampered.changes[0]!.candidate.content.candidateContentHash = "0".repeat(64);
      expect(await possibilityTryState(signPossibilityPreviewToken(claims), { enabled: async () => true, read: async () => tampered })).toEqual({ kind: "changed" });
    } finally { vi.unstubAllEnvs(); }
  });
});
