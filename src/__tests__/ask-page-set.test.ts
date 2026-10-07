import { afterEach, describe, expect, it, vi } from "vitest";
import { composeAskPageSet, prepareAskPageSet } from "@/products/websites/ask-page-set";
import { siteDocumentHash } from "@/products/websites/site-document";
import { createInMemoryPossibilityRepository } from "@/platform/possibilities";
import { createPossibilityAdapter, AskPossibilityUnsupportedError, AskPreparedPossibilityError, type AskPossibilityInput } from "@/platform/ask/ports";
import { syncAskPageSetPossibilities, storedPossibilityViews } from "@/experience/systems/stored-possibilities";
import { createMemorySystemStore } from "@/platform/systems";
import { createSystemStoreLiveSystems, createInMemoryRevisionContent } from "@/platform/make-real/systems-adapter";
import type { WebsiteRebuildRecord } from "@/products/websites/rebuild-contracts";
import { createAskPossibilityPort } from "@/app/api/workspace/ask/possibilities-server";
import { possibilityTryState } from "@/experience/systems/try-state";
import { signPossibilityPreviewToken } from "@/platform/possibilities/preview-link";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const workId = "33333333-3333-4333-8333-333333333333";
const actor = { userId: "owner", verifiedEmail: "owner@example.test" };
export const pages = { kind: "website-pages" as const, pages: [
  { path: "/", title: "Our services", description: "Explore our proposed services", paragraphs: ["Draft services for owner review."] },
  { path: "/consulting", title: "Consulting", description: "How we help", paragraphs: ["A second working page."] },
] };
const input: AskPossibilityInput = { workspaceId, systemId: "context-site", title: "A new service site", intent: "Open a new informational service website", introduces: { key: "service-site", name: "Service site", purpose: "Explain our services", summary: "Two new pages" }, check: "Owner checks all pages", candidate: pages, words: "Build a new website for our consulting services", origin: "owner_interpreted" };
function record(document = composeAskPageSet("Service site", pages).document): WebsiteRebuildRecord {
  return { workspaceId, workId, rebuild: { version: 2, revision: 3, title: document.siteName, input: { requestId: "ask-candidate", businessName: document.siteName, description: "Prepared page set" }, status: "review_ready", candidate: { document, contentHash: siteDocumentHash(document), revision: 1, previewHref: `/api/websites/${workId}/preview?revision=1&contentHash=${siteDocumentHash(document)}` }, approvedCandidateRevision: null, sourceAudit: null, audit: null, pageMapping: [], stages: [], checkpoint: null, tenantId: null, createdBy: actor.userId, createdAt: "2026-10-07T12:00:00.000Z", lastError: null, history: [], launch: { receipt: null, readBack: null } } };
}
async function candidate(repository = createInMemoryPossibilityRepository()) {
  const native = record();
  const port = createPossibilityAdapter(repository, { durable: true, newId: () => id, prepare: async () => ({
    content: { kind: "ask-website-pages", rebuildWorkId: workId, contextSystemId: "context-site", document: native.rebuild.candidate!.document, candidateRevision: 1, candidateContentHash: native.rebuild.candidate!.contentHash },
    previewHref: native.rebuild.candidate!.previewHref,
    effects: [{ id: "publish-pages", kind: "publish", channel: "hosted_website", system: { introducedKey: "service-site" }, description: "Publish service pages", request: { workId, candidateRevision: 1, candidateContentHash: native.rebuild.candidate!.contentHash }, after: [] }],
  }) });
  const opened = await port.open(actor, input);
  return { opened, repository, p: (await repository.get(workspaceId, id))!, native };
}
afterEach(() => vi.unstubAllEnvs());
describe("real Ask page-set candidates", () => {
  it("composes complete native pages and marks every piece of agent copy for review", () => {
    const built = composeAskPageSet("Service site", pages);
    expect(built.document.pages.map(page => page.path)).toEqual(["/", "/consulting"]);
    expect(built.document.capabilities).toBeUndefined();
    expect(Object.values(built.document.nodes).filter(node => node.type !== "Section").every(node => node.verification?.needsReview)).toBe(true);
    expect(() => composeAskPageSet("Bad", { ...pages, pages: [{ ...pages.pages[0], path: "/dashboard" }] })).toThrow();
    expect(() => composeAskPageSet("Bad", { ...pages, pages: [pages.pages[1]] })).toThrow();
    expect(() => composeAskPageSet("Bad", { ...pages, script: "fetch('/publish')" })).toThrow();
  });
  it.each(["environment", "workspace"])("does no native work while the %s release is off", async mode => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "0");
    vi.stubEnv("STRELVA_WEBSITE_REBUILD_RELEASE", "0");
    const create = vi.fn();
    await expect(prepareAskPageSet(actor, { workspaceId, name: "Service site", requestId: "ask-test", candidate: pages }, { create, ...(mode === "workspace" ? { released: async () => false } : {}) })).rejects.toThrow("not enabled");
    expect(create).not.toHaveBeenCalled();
  });
  it("uses the native creation boundary without approving or publishing", async () => {
    const create = vi.fn(async () => record());
    const result = await prepareAskPageSet(actor, { workspaceId, name: "Service site", requestId: "ask-test", candidate: pages }, { create, released: async () => true });
    expect(create).toHaveBeenCalledWith(actor, workspaceId, expect.objectContaining({ requestId: "ask-test", businessName: "Service site" }));
    expect(result.rebuild.approvedCandidateRevision).toBeNull();
    expect(result.rebuild.launch.receipt).toBeNull();
  });
  it("checks original words so model-provided pages never stand in for booking", async () => {
    const prepare = vi.fn();
    const port = createAskPossibilityPort(actor, { repository: createInMemoryPossibilityRepository(), released: async () => true, prepare });
    await expect(port.open(actor, { ...input, words: "Let visitors book a consultation", intent: "Create service pages" })).rejects.toBeInstanceOf(AskPossibilityUnsupportedError);
    expect(prepare).not.toHaveBeenCalled();
    const off = createAskPossibilityPort(actor, { repository: createInMemoryPossibilityRepository(), released: async () => false, prepare });
    await expect(off.open(actor, input)).rejects.toBeInstanceOf(AskPossibilityUnsupportedError);
    expect(prepare).not.toHaveBeenCalled();
  });
  it("records operator-on-behalf origin and hands the persisted native draft to Needs you", async () => {
    const repository = createInMemoryPossibilityRepository();
    const sync = vi.fn(async () => ({ complete: true }));
    const prepare = vi.fn(async () => record());
    const port = createAskPossibilityPort(actor, { repository, released: async () => true, prepare, sync });
    const askedOnBehalf = "phone" as const;
    const opened = await port.open(actor, { ...input, origin: "operator", askedOnBehalf });
    const p = (await repository.get(workspaceId, opened.id))!;
    expect(p.introduces[0]!.candidate.content).toMatchObject({ originalWords: input.words, askOrigin: "operator", askedOnBehalf });
    expect(sync).toHaveBeenCalledWith(actor, workspaceId);
    expect(opened.reviewStatus).toBe("needs_you");
    sync.mockResolvedValueOnce({ complete: false });
    expect((await port.open(actor, input)).reviewStatus).toBe("pending_sync");
    sync.mockRejectedValueOnce(new Error("sync unavailable"));
    expect((await port.open(actor, input)).reviewStatus).toBe("pending_sync");
  });
  it("does not store a summary shell for unsupported booking or missing existing baseline", async () => {
    const repository = createInMemoryPossibilityRepository();
    const port = createPossibilityAdapter(repository, { durable: true });
    await expect(port.open(actor, { ...input, candidate: undefined, intent: "Book consultations" })).rejects.toBeInstanceOf(AskPossibilityUnsupportedError);
    await expect(port.open(actor, { ...input, introduces: null })).rejects.toBeInstanceOf(AskPossibilityUnsupportedError);
    expect(await repository.list(workspaceId)).toEqual([]);
  });
  it("pins the real document, native preview and publish effect but remains Exploring", async () => {
    const { p, opened, native } = await candidate();
    expect(p.status).toBe("exploring");
    expect(p.effects[0]!.request).toEqual({ workId, candidateRevision: 1, candidateContentHash: native.rebuild.candidate!.contentHash });
    expect(opened.previewHref).toBe(native.rebuild.candidate!.previewHref);
    const views = storedPossibilityViews([{ possibility: p, sourceRef: null, lastActivityAt: p.updatedAt }], [{ workId, previewHref: opened.previewHref } as never]);
    expect(views[0]).toMatchObject({ workId, affects: ["context-site"], previewHref: opened.previewHref, status: "exploring" });
  });
  it("preserves the native draft id if Possibility persistence fails", async () => {
    const repository = createInMemoryPossibilityRepository();
    repository.create = async () => { throw new Error("storage offline"); };
    await expect(candidate(repository)).rejects.toMatchObject({ draftId: workId });
    await expect(candidate(repository)).rejects.toBeInstanceOf(AskPreparedPossibilityError);
  });
  it("refreshes the signed candidate revision and permits Ready only after owner review", async () => {
    const { p, repository, native } = await candidate();
    const repo = { ...repository, createFromSource: vi.fn(), listWithSources: vi.fn() };
    const rows = [{ possibility: p, sourceRef: null, lastActivityAt: p.updatedAt }];
    const deps = { repo, live: { current: async () => null }, stored: rows, canWrite: true, actorId: actor.userId, at: "2026-10-07T12:00:00.000Z", read: async () => native };
    expect((await syncAskPageSetPossibilities(deps))[0]!.possibility.status).toBe("exploring");
    const document = structuredClone(native.rebuild.candidate!.document);
    Object.values(document.nodes).forEach(node => { if (node.verification) node.verification = { supported: true, confidence: 1, needsReview: false }; });
    const reviewed = record(document);
    reviewed.rebuild.candidate!.revision = 2;
    const ready = (await syncAskPageSetPossibilities({ ...deps, read: async () => reviewed }))[0]!.possibility;
    expect(ready.status).toBe("ready");
    expect(ready.candidateRevision).toBeGreaterThan(p.candidateRevision);
    expect(ready.effects[0]!.request.candidateContentHash).toBe(siteDocumentHash(document));
    const read = vi.fn();
    await syncAskPageSetPossibilities({ ...deps, canWrite: false, read });
    expect(read).not.toHaveBeenCalled();
  });
  it("uses the native saved Work as System identity when made real", async () => {
    const store = createMemorySystemStore({ access: () => "owner" });
    const port = createSystemStoreLiveSystems({ store, content: createInMemoryRevisionContent(), actor });
    const { p } = await candidate();
    const staged = await port.introduceSystem(workspaceId, p.introduces[0]!, "test:pages");
    const detail = await store.readSystem(actor, { businessId: workspaceId, systemId: staged.systemId });
    expect(detail.system.kind).toBe("website");
    expect(detail.system.origin).toEqual({ kind: "saved_work", ref: workId });
    expect(detail.system.lifecycle).toBe("draft");
  });
  it("signed Try shows only the immutable scoped candidate and refuses damaged documents", async () => {
    vi.stubEnv("APPROVE_LINK_SECRET", "test-only-preview-secret");
    const { p } = await candidate();
    const claims = { workspaceId, possibilityId: id, candidateRevision: p.candidateRevision };
    const read = vi.fn(async (scope: { businessId: string; possibilityId: string; candidateRevision: number }) => scope.businessId === workspaceId && scope.possibilityId === id && scope.candidateRevision === p.candidateRevision ? p : null);
    const state = await possibilityTryState(signPossibilityPreviewToken(claims), { enabled: async () => true, read });
    expect(state).toMatchObject({ kind: "ready", view: { takesSubmissions: false, websiteDocument: p.introduces[0]!.candidate.content.document } });
    expect(await possibilityTryState(signPossibilityPreviewToken({ ...claims, workspaceId: workId }), { enabled: async () => true, read })).toEqual({ kind: "changed" });
    expect(await possibilityTryState(signPossibilityPreviewToken({ ...claims, candidateRevision: p.candidateRevision + 1 }), { enabled: async () => true, read })).toEqual({ kind: "changed" });
    const damaged = structuredClone(p);
    damaged.introduces[0]!.candidate.content.document = {};
    expect(await possibilityTryState(signPossibilityPreviewToken(claims), { enabled: async () => true, read: async () => damaged })).toEqual({ kind: "changed" });
  });
});
