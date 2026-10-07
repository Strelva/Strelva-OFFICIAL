import { describe, expect, it, vi } from "vitest";
import { createNeedsYouService } from "@/platform/needs-you/service";
import { websiteDocumentAdapter } from "@/platform/needs-you/sources/website-document";
import type { ServiceSession } from "@/platform/needs-you/service-actor";
import { createWebsiteRebuildService } from "@/products/websites/rebuild-service";
import { createWebsiteDocumentStore } from "@/products/websites/document-store";
import { siteDocumentSchema, siteDocumentHash } from "@/products/websites/site-document";
import { websiteRebuildSchema, type WebsiteRebuildRecord } from "@/products/websites/rebuild-contracts";
import type { BoundedStore } from "@/platform/bounded-work/repository";
import type { SavedWork, WorkspaceActor } from "@/platform/workspaces/types";
import { needsYouMemoryStore } from "./support/needs-you-memory";

const WS = "b5000000-0000-4000-8000-000000000001";
const WORK = "b5000000-0000-4000-8000-000000000002";
const ADMIN: WorkspaceActor = { userId: "b5000000-0000-4000-8000-000000000003", verifiedEmail: "operator@example.test" };
const AT = "2026-10-07T14:00:00.000Z";

function fixture() {
  const document = siteDocumentSchema.parse({
    version: 2, siteName: "Fictional Firm", theme: { palette: "light", typeScale: "standard" },
    pages: [{ path: "/", title: "Firm", description: "", root: "hero" }],
    nodes: {
      hero: { id: "hero", type: "Hero", variant: "statement", props: { title: "Fictional Firm", body: "Speak with our team" }, children: [], factIds: [], verification: { supported: false, confidence: 0.5, needsReview: true } },
      footer: { id: "footer", type: "Footer", variant: "simple", props: { text: "Thanks for visiting" }, children: [], factIds: [], verification: { supported: false, confidence: 0.5, needsReview: true } },
    }, facts: {}, assets: {}, redirects: [], provenance: { composer: "rules" },
  });
  let row: WebsiteRebuildRecord = { workId: WORK, workspaceId: WS, rebuild: websiteRebuildSchema.parse({
    version: 2, revision: 4, title: "Fictional Firm", input: { requestId: "fictional-request", description: "A firm website", businessName: "Fictional Firm" },
    status: "review_ready", stages: [], checkpoint: null, candidate: { revision: 2, contentHash: siteDocumentHash(document), document, previewHref: `/api/websites/${WORK}/preview` },
    approvedCandidateRevision: null, tenantId: null, launch: { receipt: null, readBack: null }, lastError: null, createdBy: ADMIN.userId, createdAt: AT, history: [],
  }) };
  const work = (): SavedWork => ({ id: WORK, workspaceId: WS, productId: "websites", resourceKind: "website", title: row.rebuild.title,
    payload: structuredClone(row.rebuild), input: {}, createdBy: ADMIN.userId, createdAt: AT, updatedAt: AT });
  const member = vi.fn(async () => {});
  const store: BoundedStore = { member, read: async () => work(), create: vi.fn(), update: vi.fn() };
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "read_website_documents") return { data: { workspace_id: WS, website_work_id: WORK, revision: row.rebuild.candidate!.revision,
      content_hash: row.rebuild.candidate!.contentHash, document: row.rebuild.candidate!.document, created_by: ADMIN.userId, created_at: AT }, error: null };
    if (name === "commit_website_document_candidate") {
      expect(args.p_expected_work_revision).toBe(row.rebuild.revision);
      expect(args.p_expected_document_revision).toBe(row.rebuild.candidate!.revision);
      row = { ...row, rebuild: websiteRebuildSchema.parse(args.p_payload) };
      return { data: { id: WORK, workspace_id: WS, product_id: "websites", resource_kind: "website", title: row.rebuild.title,
        payload: row.rebuild, input: {}, created_by: ADMIN.userId, created_at: AT, updated_at: AT }, error: null };
    }
    if (name !== "manage_website_document") throw new Error(`Unexpected RPC: ${name}`);
    return { data: [], error: null };
  });
  const service = createWebsiteRebuildService(store, { documents: createWebsiteDocumentStore({ rpc }), now: () => AT });
  const selection = () => ({ expectedRevision: row.rebuild.revision, candidateRevision: row.rebuild.candidate!.revision, candidateContentHash: row.rebuild.candidate!.contentHash });
  return { service, rpc, member, selection, row: () => row, mutate: (change: (current: WebsiteRebuildRecord) => void) => { change(row); } };
}

describe("exact website copy review", () => {
  it("confirms only the selected node through the candidate commit, retaining history and no publication", async () => {
    const s = fixture();
    const before = structuredClone(s.row());
    const result = await s.service.resolveCopyReview(ADMIN, WORK, "hero", s.selection());
    expect(result.rebuild.candidate!.document.nodes.hero!.verification).toEqual({ supported: true, confidence: 1, needsReview: false });
    expect(result.rebuild.candidate!.document.nodes.hero!.props).toEqual(before.rebuild.candidate!.document.nodes.hero!.props);
    expect(result.rebuild.candidate!.document.nodes.footer).toEqual(before.rebuild.candidate!.document.nodes.footer);
    expect(result.rebuild.status).toBe("review_ready");
    expect(result.rebuild.launch.receipt).toBeNull();
    expect(result.rebuild.history.at(-1)).toMatchObject({ kind: "copy_review_confirmed", actorId: ADMIN.userId });
    expect(s.rpc.mock.calls.map(([name]) => name)).toEqual(["manage_website_document", "read_website_documents", "commit_website_document_candidate"]);
    expect(s.member).toHaveBeenCalledWith(ADMIN, WS);
  });

  it.each(["expectedRevision", "candidateRevision", "candidateContentHash"] as const)("refuses stale %s before any mutation", async key => {
    const s = fixture();
    const original = s.selection();
    const stale = { ...original, [key]: key === "candidateContentHash" ? "a".repeat(64) : Number(original[key]) + 1 };
    await expect(s.service.resolveCopyReview(ADMIN, WORK, "hero", stale)).rejects.toThrow(/website changed/);
    expect(s.rpc).not.toHaveBeenCalled();
  });

  it("refuses unresolved facts linked to the copy", async () => {
    const s = fixture();
    s.mutate(row => {
      const candidate = row.rebuild.candidate!;
      candidate.document.facts.hours = { text: "Open all night", kind: "hours", highRisk: true, origin: "owner_stated", sources: [] };
      candidate.document.nodes.hero!.factIds = ["hours"];
      candidate.contentHash = siteDocumentHash(candidate.document);
    });
    await expect(s.service.resolveCopyReview(ADMIN, WORK, "hero", s.selection())).rejects.toThrow(/unresolved facts/);
    expect(s.rpc.mock.calls.map(([name]) => name)).toEqual(["manage_website_document"]);
  });

  it("does not mutate after manage permission is revoked", async () => {
    const s = fixture();
    s.member.mockRejectedValueOnce(new Error("membership revoked"));
    await expect(s.service.resolveCopyReview(ADMIN, WORK, "hero", s.selection())).rejects.toThrow(/revoked/);
    expect(s.rpc).not.toHaveBeenCalled();
  });

  it("offers complete bounded props, confirms by owner link and supersedes the other old copy item", async () => {
    const s = fixture();
    const confirmCopy = vi.fn((actor: WorkspaceActor, workId: string, nodeId: string, selected: ReturnType<typeof s.selection>) => s.service.resolveCopyReview(actor, workId, nodeId, selected));
    const adapter = websiteDocumentAdapter({ list: async () => [s.row()], confirmCopy, approve: vi.fn(), launch: vi.fn() });
    const mem = needsYouMemoryStore({ clock: { now: Date.parse(AT) }, roles: { [ADMIN.userId]: "admin" } });
    mem.store.ownerLinkSession = async (workspaceId, decisionId, revisionHash, recipient): Promise<ServiceSession> => ({
      kind: "strelva_system", label: "Strelva (system)", purpose: "owner_decision_link", sessionId: "b5000000-0000-4000-8000-000000000004",
      workspaceId, decisionId, revisionHash, recipient, actor: ADMIN, onBehalf: { role: "admin" },
    });
    mem.store.authorizeOwnerLinkRun = async () => {};
    const send = vi.fn();
    const needsYou = createNeedsYouService({ store: mem.store, adapters: [adapter], sendEmail: send, appOrigin: "https://app.example.test", now: () => Date.parse(AT) });
    const items = (await needsYou.list(ADMIN, WS)).items;
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ sourceId: `${WORK}:copy.hero`, kind: "fact.inferred", adminMayDecide: false,
      detail: JSON.stringify(s.row().rebuild.candidate!.document.nodes.hero!.props) });
    const decide = (item = items[0]!, decision: "approve" | "not_yet" = "approve") => needsYou.decide({ workspaceId: WS, itemId: item.id,
      revision: item.revisionHash, decision, by: { kind: "owner_link", recipient: "owner@example.test" } });
    expect(await decide()).toMatchObject({ status: "done", item: { receiptRef: `website_document:${WORK}:copy:hero:3`, decidedByKind: "owner_link" } });
    expect(confirmCopy).toHaveBeenCalledWith(ADMIN, WORK, "hero", expect.objectContaining({ expectedRevision: 4, candidateRevision: 2 }));
    expect(await decide(items[1]!)).toMatchObject({ status: "changed" });
    expect(confirmCopy).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalled();
    const remaining = (await needsYou.list(ADMIN, WS)).items;
    expect(remaining).toHaveLength(1);
    expect(await decide(remaining[0]!, "not_yet")).toMatchObject({ status: "done", item: { state: "declined" } });
    expect(confirmCopy).toHaveBeenCalledOnce();
  });

  it("never silently truncates large props into permission to confirm unseen copy", async () => {
    const s = fixture();
    s.mutate(row => {
      const candidate = row.rebuild.candidate!;
      candidate.document.nodes.hero!.props = { title: "Firm", body: "a".repeat(1001) };
      candidate.document.nodes.footer!.verification = { supported: true, confidence: 1, needsReview: false };
      candidate.contentHash = siteDocumentHash(candidate.document);
    });
    const adapter = websiteDocumentAdapter({ list: async () => [s.row()], confirmCopy: vi.fn(), approve: vi.fn(), launch: vi.fn() });
    expect((await adapter.propose({ workspaceId: WS, actor: ADMIN })).items).toEqual([]);
  });
});
