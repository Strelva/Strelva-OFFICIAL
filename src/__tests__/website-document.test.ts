import { describe, it, expect, vi } from "vitest";
import { siteDocumentSchema, siteDocumentHash, unresolvedSiteFacts } from "@/products/websites/site-document";
import { createWebsiteDocumentStore } from "@/products/websites/document-store";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError } from "@/platform/workspaces/types";

vi.mock("@/lib/redis", () => ({ getRedis: vi.fn(() => null) }));

const actor = { userId: "61000000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
const key = { workspaceId: "61000000-0000-4000-8000-000000000002", workId: "61000000-0000-4000-8000-000000000003" };
function document() { return siteDocumentSchema.parse({ version: 2, siteName: "A sourced business", theme: { palette: "light", typeScale: "standard" }, pages: [{ path: "/", title: "Home", description: "Description", root: "root" }], nodes: { root: { id: "root", type: "Section", variant: "container", props: {}, children: ["hero"], factIds: [] }, hero: { id: "hero", type: "Hero", variant: "statement", props: { title: "Business title" }, children: [], factIds: [] } }, facts: {}, assets: {}, redirects: [], provenance: { composer: "rules" } }); }
function row(doc = document()) { return { workspace_id: key.workspaceId, website_work_id: key.workId, revision: 1, content_hash: siteDocumentHash(doc), document: doc, created_by: actor.userId, created_at: "2026-10-01T12:00:00Z" }; }

describe("immutable site document", () => {
  it("hashes the same semantic map independent of property insertion order", () => { const doc = document(); const reordered = structuredClone({ ...doc, nodes: { hero: doc.nodes.hero!, root: doc.nodes.root! } }); expect(siteDocumentHash(reordered)).toBe(siteDocumentHash(doc)); reordered.nodes.hero!.props = { title: "Changed" }; expect(siteDocumentHash(reordered)).not.toBe(siteDocumentHash(doc)); });
  it("rejects unknown catalog props, dangerous links, missing facts and assets", () => {
    const invalid = document(); invalid.nodes.hero!.props = { title: "Okay", script: "alert(1)" } as never; expect(siteDocumentSchema.safeParse(invalid).success).toBe(false);
    const link = document(); link.nodes.hero!.props = { cta: { label: "Go", href: "javascript:alert(1)" } }; expect(siteDocumentSchema.safeParse(link).success).toBe(false);
    const missing = document(); missing.nodes.hero!.factIds = ["missing"]; expect(siteDocumentSchema.safeParse(missing).success).toBe(false);
    const asset = document(); asset.nodes.hero!.props = { image: "missing" }; expect(siteDocumentSchema.safeParse(asset).success).toBe(false);
  });
  it("rejects cyclic graphs, key mismatches, duplicate page paths and redirect loops", () => {
    const cycle = document(); cycle.nodes.hero!.children = ["root"]; expect(siteDocumentSchema.safeParse(cycle).success).toBe(false);
    const mismatch = document(); mismatch.nodes.hero!.id = "other"; expect(siteDocumentSchema.safeParse(mismatch).success).toBe(false);
    const duplicate = document(); duplicate.pages.push(duplicate.pages[0]!); expect(siteDocumentSchema.safeParse(duplicate).success).toBe(false);
    const redirect = document(); redirect.redirects = [{ from: "/old", to: "/older" }, { from: "/older", to: "/old" }]; expect(siteDocumentSchema.safeParse(redirect).success).toBe(false);
  });
  it("blocks reserved app paths and external source images", () => {
    const doc = document(); doc.pages[0]!.path = "/admin"; expect(siteDocumentSchema.safeParse(doc).success).toBe(false);
    doc.pages[0]!.path = "/"; doc.redirects = [{ from: "/old-page.html", to: "/" }]; expect(siteDocumentSchema.safeParse(doc).success).toBe(true); doc.redirects = [{ from: "/../old-page.html", to: "/" }]; expect(siteDocumentSchema.safeParse(doc).success).toBe(false); doc.redirects = []; doc.assets.photo = { url: "https://old-business.example/photo.jpg", alt: "Photo" }; expect(siteDocumentSchema.safeParse(doc).success).toBe(false);
    doc.assets.photo.url = "https://tenant.public.blob.vercel-storage.com/photo.jpg"; expect(siteDocumentSchema.safeParse(doc).success).toBe(true);
  });
  it("blocks a verification failure even on an owner-stated fact", () => {
    const doc = document(); doc.facts.claim = { text: "Unproven", kind: "claim", highRisk: false, origin: "owner_stated", sources: [], verification: { supported: false, confidence: 0.4 } }; expect(unresolvedSiteFacts(doc)).toEqual(["claim"]);
  });
  it("requires evidence for source facts and owner confirmation for high risk", () => {
    const doc = document(); doc.facts.claim = { text: "Licensed since 1992", kind: "credential", highRisk: true, origin: "source", sources: [] }; expect(siteDocumentSchema.safeParse(doc).success).toBe(false);
    doc.facts.claim.sources = [{ sourceId: "page-one", quote: "Licensed since 1992" }]; doc.facts.claim.verification = { supported: true, confidence: 1 }; expect(unresolvedSiteFacts(doc)).toEqual(["claim"]);
    doc.facts.claim.origin = "owner_confirmed"; expect(unresolvedSiteFacts(doc)).toEqual([]);
  });
});

describe("durable document RPC adapter", () => {
  it("reads only the scoped native agency candidate without using customer membership", async () => {
    const doc = document(); const raw = { id: key.workId, workspace_id: key.workspaceId, product_id: "websites", resource_kind: "website", title: doc.siteName, payload: { candidate: { document: doc, contentHash: siteDocumentHash(doc) } }, created_by: actor.userId, created_at: "2026-10-01T12:00:00Z", updated_at: "2026-10-01T12:00:00Z" };
    const rpc = vi.fn().mockResolvedValueOnce({ data: { work: raw, section: "hero", sections: ["hero"] }, error: null }).mockResolvedValueOnce({ data: null, error: { message: "agency_managed_website_draft_denied" } });
    const store = createWebsiteDocumentStore({ rpc }); const input = { bindingId: key.workspaceId, section: "hero", subscriptionExemption: false };
    expect(await store.readAgencyCandidate(actor,input)).toMatchObject({ work: { id: key.workId }, section: "hero", sections: ["hero"] });
    expect(rpc).toHaveBeenCalledWith("read_agency_website_document_candidate", expect.objectContaining({ p_user_id: actor.userId, p_binding_id: input.bindingId, p_work_id: null, p_section: "hero", p_subscription_exemption: false }));
    await expect(store.readAgencyCandidate(actor,input)).rejects.toBeInstanceOf(WorkspaceAccessError);
  });
  it("passes all three agency revision selectors and immutable hash to the atomic commit", async () => {
    const doc = document(); const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "website_revision_conflict" } }); const store = createWebsiteDocumentStore({ rpc });
    await expect(store.commitAgencyCandidate(actor,{ bindingId: key.workspaceId, workId: key.workId, section: "hero", expectedWorkRevision: 3, expectedRevision: 2, expectedCandidateRevision: 2, expectedCandidateHash: "a".repeat(64), document: doc, payload: {}, subscriptionExemption: false })).rejects.toBeInstanceOf(WorkspaceConflictError);
    expect(rpc).toHaveBeenCalledWith("commit_agency_website_document_candidate", expect.objectContaining({ p_expected_work_revision: 3, p_expected_document_revision: 2, p_expected_candidate_revision: 2, p_expected_candidate_hash: "a".repeat(64), p_content_hash: siteDocumentHash(doc), p_section: "hero" }));
  });
  it("reads immutable receipt history through the authorized private RPC", async () => {
    const receipt = { status: "published", provider: "strelva-hosted", receiptId: "historic", providerUrl: "https://business.strelva.com", evidence: "Published", artifactHash: siteDocumentHash(document()), candidateRevision: 1, publishedAt: "2026-10-01T12:00:00Z" };
    const rpc = vi.fn().mockResolvedValueOnce({ data: [{ receipt }], error: null }).mockResolvedValueOnce({ data: null, error: { message: "workspace_access_denied" } });
    const store = createWebsiteDocumentStore({ rpc }); expect(await store.receipts(actor,key)).toEqual([receipt]);
    expect(rpc).toHaveBeenCalledWith("read_website_document_receipts", expect.objectContaining({ p_workspace_id: key.workspaceId, p_work_id: key.workId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail }));
    await expect(store.receipts(actor,key)).rejects.toBeInstanceOf(WorkspaceAccessError);
  });
  it("retains only an exact original crawl source hash", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null }); const store = createWebsiteDocumentStore({ rpc });
    const page = { url: "https://business.example.test/", sourceId: "forged", html: "<p>Source</p>", visibleText: "Source", title: "Source", headings: [], links: [], assets: [] };
    await expect(store.retainCrawlPage(actor,{ ...key, page })).rejects.toBeInstanceOf(WorkspaceStoreError); expect(rpc).not.toHaveBeenCalled();
  });
  it("reserves a tenant through the approved candidate identity", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ tenant_id: "business" }], error: null });
    const store = createWebsiteDocumentStore({ rpc });
    expect(await store.reserveHostedTenant(actor,{ ...key, revision: 1, contentHash: siteDocumentHash(document()), tenantId: "business" })).toBe("business");
    expect(rpc).toHaveBeenCalledWith("reserve_website_hosted_tenant", expect.objectContaining({ p_work_id: key.workId, p_user_id: actor.userId, p_tenant_id: "business", p_revision: 1 }));
  });
  it("maps a losing atomic candidate work revision to a conflict", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "bounded_revision_conflict" } });
    const store = createWebsiteDocumentStore({ rpc });
    await expect(store.commitCandidate(actor,{ ...key, expectedRevision: 0, expectedWorkRevision: 0, document: document(), payload: {} })).rejects.toBeInstanceOf(WorkspaceConflictError);
  });
  it("returns the durable original receipt on publication replay", async () => {
    const contentHash = siteDocumentHash(document());
    const original = { status: "published" as const, provider: "strelva-hosted", receiptId: "original", providerUrl: "https://business.strelva.com", evidence: "Published", artifactHash: contentHash, candidateRevision: 1, publishedAt: "2026-10-01T12:00:00Z" };
    const rpc = vi.fn().mockResolvedValue({ data: { ...row(), tenant_id: "business", receipt: original }, error: null });
    const store = createWebsiteDocumentStore({ rpc });
    const published = await store.publish(actor,{ ...key, revision: 1, contentHash, tenantId: "business", receipt: { ...original, receiptId: "retry", publishedAt: "2026-10-01T14:00:00Z" } });
    expect(published.receipt).toEqual(original);
  });
  it("passes trusted actor and validated immutable hash to append", async () => { const rpc = vi.fn().mockResolvedValue({ data: [row()], error: null }); const store = createWebsiteDocumentStore({ rpc }); const result = await store.append(actor,{ ...key, expectedRevision: 0, document: document() }); expect(result.revision).toBe(1); expect(rpc).toHaveBeenCalledWith("append_website_document", expect.objectContaining({ p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_expected_revision: 0, p_content_hash: siteDocumentHash(document()) })); });
  it("rejects corrupted durable content and maps authorization/CAS errors", async () => {
    const bad = row(); bad.document.siteName = "Tampered"; const rpc = vi.fn().mockResolvedValueOnce({ data: [bad], error: null }).mockResolvedValueOnce({ data: null, error: { message: "workspace_access_denied" } }).mockResolvedValueOnce({ data: null, error: { message: "website_revision_conflict" } }); const store = createWebsiteDocumentStore({ rpc }); await expect(store.read(actor,key)).rejects.toBeInstanceOf(WorkspaceStoreError); await expect(store.read(actor,key)).rejects.toBeInstanceOf(WorkspaceAccessError); await expect(store.append(actor,{ ...key, expectedRevision: 0, document: document() })).rejects.toBeInstanceOf(WorkspaceConflictError);
  });
  it("blocks unresolved approvals before invoking the mutation RPC", async () => { const doc = document(); doc.facts.claim = { text: "Guaranteed result", kind: "claim", highRisk: true, origin: "owner_stated", sources: [] }; const rpc = vi.fn().mockResolvedValue({ data: [row(doc)], error: null }); const store = createWebsiteDocumentStore({ rpc }); await expect(store.approve(actor,{ ...key, revision: 1, contentHash: siteDocumentHash(doc) })).rejects.toBeInstanceOf(WorkspaceConflictError); expect(rpc).toHaveBeenCalledTimes(1); });
  it("refuses mismatched publication receipts", async () => { const rpc = vi.fn(); const store = createWebsiteDocumentStore({ rpc }); await expect(store.publish(actor,{ ...key, revision: 1, contentHash: siteDocumentHash(document()), tenantId: "business", receipt: { status: "published", provider: "strelva-hosted", receiptId: "receipt", providerUrl: "https://business.strelva.com", evidence: "Published", artifactHash: "f".repeat(64), candidateRevision: 1, publishedAt: "2026-10-01T12:00:00Z" } })).rejects.toBeInstanceOf(WorkspaceConflictError); expect(rpc).not.toHaveBeenCalled(); });
});
