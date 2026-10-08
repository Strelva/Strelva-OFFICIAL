import { describe, expect, it, vi } from "vitest";
import { createNeedsYouService } from "@/platform/needs-you/service";
import type { ServiceSession } from "@/platform/needs-you/service-actor";
import { websiteDocumentAdapter, type WebsiteSelection } from "@/platform/needs-you/sources/website-document";
import { siteDocumentHash, siteDocumentSchema } from "@/products/websites/site-document";
import { websiteRebuildSchema, type WebsiteRebuildRecord } from "@/products/websites/rebuild-contracts";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { needsYouMemoryStore } from "./support/needs-you-memory";

const WS = "b4000000-0000-4000-8000-000000000001";
const WORK = "b4000000-0000-4000-8000-000000000002";
const ADMIN: WorkspaceActor = { userId: "b4000000-0000-4000-8000-000000000003", verifiedEmail: "operator@example.test" };
const AT = "2026-10-07T14:00:00.000Z";
const OWNER = "owner-without-account@example.test";

const live = vi.hoisted(() => ({ confirmFact: vi.fn(), list: vi.fn() }));
vi.mock("@/products/websites/rebuild-release", () => ({ websiteRebuildReleaseEnabled: () => true, websiteRebuildReleaseMayBeOn: () => false }));
vi.mock("@/products/websites/rebuild-service", () => ({ resolveWebsiteRebuildFact: live.confirmFact, listWebsiteRebuilds: live.list }));

function record(): WebsiteRebuildRecord {
  const document = siteDocumentSchema.parse({
    version: 2, siteName: "Fictional Firm", theme: { palette: "light", typeScale: "standard" },
    pages: [{ path: "/", title: "Firm", description: "", root: "hero" }],
    nodes: { hero: { id: "hero", type: "Hero", variant: "statement", props: { title: "Fictional Firm" }, children: [], factIds: ["hours", "phone"], verification: { supported: false, confidence: 0, needsReview: true } } },
    facts: {
      hours: { text: "Open Monday to Friday, 9 am to 5 pm", kind: "hours", highRisk: true, origin: "owner_stated", sources: [] },
      phone: { text: "Call 716-555-0101", kind: "contact", highRisk: true, origin: "owner_stated", sources: [] },
    }, assets: {}, redirects: [], provenance: { composer: "rules" },
  });
  return { workId: WORK, workspaceId: WS, rebuild: websiteRebuildSchema.parse({
    version: 2, revision: 4, title: "Fictional Firm", input: { requestId: "fictional-request", description: "A firm website", businessName: "Fictional Firm" },
    status: "review_ready", stages: [], checkpoint: null,
    candidate: { revision: 2, contentHash: siteDocumentHash(document), document, previewHref: `/api/websites/${WORK}/preview` },
    approvedCandidateRevision: null, tenantId: null, launch: { receipt: null, readBack: null }, lastError: null, createdBy: ADMIN.userId, createdAt: AT, history: [],
  }) };
}

async function setup() {
  const row = record();
  const mem = needsYouMemoryStore({ clock: { now: Date.parse(AT) }, roles: { [ADMIN.userId]: "admin" } });
  const confirmFact = vi.fn(async (_actor: WorkspaceActor, workId: string, factId: string, selection: WebsiteSelection) => {
    expect(workId).toBe(WORK);
    expect(selection).toEqual({ expectedRevision: row.rebuild.revision, candidateRevision: row.rebuild.candidate!.revision, candidateContentHash: row.rebuild.candidate!.contentHash });
    const document = structuredClone(row.rebuild.candidate!.document);
    document.facts[factId]!.origin = "owner_confirmed";
    document.facts[factId]!.verification = { supported: true, confidence: 1 };
    row.rebuild.revision += 1;
    row.rebuild.candidate = { ...row.rebuild.candidate!, revision: row.rebuild.candidate!.revision + 1, document, contentHash: siteDocumentHash(document) };
    return structuredClone(row);
  });
  const approve = vi.fn();
  const launch = vi.fn();
  const adapter = websiteDocumentAdapter({ list: async () => [row], confirmFact, approve, launch });
  mem.store.ownerLinkSession = vi.fn(async (workspaceId, decisionId, revisionHash, recipient): Promise<ServiceSession> => ({
    kind: "strelva_system", label: "Strelva (system)", purpose: "owner_decision_link", sessionId: "b4000000-0000-4000-8000-000000000004",
    workspaceId, decisionId, revisionHash, recipient, actor: ADMIN, onBehalf: { role: "admin" },
  }));
  const authorize = vi.fn(async () => {});
  mem.store.authorizeOwnerLinkRun = authorize;
  const send = vi.fn();
  const service = createNeedsYouService({ store: mem.store, adapters: [adapter], sendEmail: send, appOrigin: "https://app.example.test", now: () => Date.parse(AT) });
  const items = (await service.list(ADMIN, WS)).items;
  const decide = (item = items[0]!, decision: "approve" | "not_yet" = "approve") => service.decide({ workspaceId: WS, itemId: item.id,
    revision: item.revisionHash, decision, by: { kind: "owner_link", recipient: OWNER } });
  return { row, mem, adapter, service, items, decide, confirmFact, approve, launch, authorize, send };
}

describe("owner website fact email decisions", () => {
  it("opens one owner-only item per unresolved fact with its exact plain text", async () => {
    const s = await setup();
    expect(s.items.map(item => ({ sourceId: item.sourceId, kind: item.kind, detail: item.detail, adminMayDecide: item.adminMayDecide }))).toEqual([
      { sourceId: `${WORK}:fact.hours`, kind: "fact.inferred", detail: "Open Monday to Friday, 9 am to 5 pm", adminMayDecide: false },
      { sourceId: `${WORK}:fact.phone`, kind: "fact.inferred", detail: "Call 716-555-0101", adminMayDecide: false },
    ]);
    expect(s.items.every(item => item.route === "owner_decides" && !item.signInRequired)).toBe(true);
  });

  it("confirms exactly one fact by link with the unchanged admin executor and no publish or send", async () => {
    const s = await setup();
    const before = structuredClone(s.row.rebuild.candidate!);
    expect(await s.decide()).toMatchObject({ status: "done", item: { decidedByKind: "owner_link", receiptRef: `website_document:${WORK}:fact:hours:3` } });
    expect(s.confirmFact).toHaveBeenCalledWith(ADMIN, WORK, "hours", { expectedRevision: 4, candidateRevision: 2, candidateContentHash: before.contentHash });
    expect(s.row.rebuild.candidate!.document.facts.hours!.origin).toBe("owner_confirmed");
    expect(s.row.rebuild.candidate!.document.facts.phone).toEqual(before.document.facts.phone);
    expect(s.row.rebuild.status).toBe("review_ready");
    expect(s.approve).not.toHaveBeenCalled();
    expect(s.launch).not.toHaveBeenCalled();
    expect(s.send).not.toHaveBeenCalled();
    expect(await s.decide()).toMatchObject({ status: "already_handled" });
    expect(s.confirmFact).toHaveBeenCalledOnce();
  });

  it("supersedes every remaining old fact link after a confirmation changes the candidate", async () => {
    const s = await setup();
    await s.decide();
    expect(await s.decide(s.items[1]!)).toMatchObject({ status: "changed" });
    const remaining = (await s.service.list(ADMIN, WS)).items;
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.sourceId).toBe(`${WORK}:fact.phone`);
    expect(remaining[0]?.revisionHash).not.toBe(s.items[1]!.revisionHash);
    expect(s.confirmFact).toHaveBeenCalledOnce();
    expect(s.mem.items.get(s.items[1]!.id)?.state).toBe("superseded");
  });

  it("Not yet keeps the fact and candidate unchanged", async () => {
    const s = await setup();
    const before = structuredClone(s.row);
    expect(await s.decide(s.items[0]!, "not_yet")).toMatchObject({ status: "done", item: { state: "declined" } });
    expect(s.row).toEqual(before);
    expect(s.confirmFact).not.toHaveBeenCalled();
  });

  it("an admin session cannot confirm an owner-only inferred fact", async () => {
    const s = await setup();
    const item = s.items[0]!;
    expect(await s.service.decide({ workspaceId: WS, itemId: item.id, revision: item.revisionHash, decision: "approve", by: { kind: "session", actor: ADMIN } })).toMatchObject({ status: "forbidden" });
    expect(s.confirmFact).not.toHaveBeenCalled();
  });

  it("refuses a candidate changed after link claim and before resolution", async () => {
    const s = await setup();
    s.authorize.mockImplementation(async () => { s.row.rebuild.revision += 1; });
    expect(await s.decide()).toMatchObject({ status: "failed", item: { outcomeReason: "source_changed" } });
    expect(s.confirmFact).not.toHaveBeenCalled();
  });

  it("reports a failed fact resolver without approval, publication or fact changes", async () => {
    const s = await setup();
    const before = structuredClone(s.row);
    s.confirmFact.mockRejectedValueOnce(new Error("document revision changed"));
    expect(await s.decide()).toMatchObject({ status: "failed", item: { outcomeReason: "resolver_failed" } });
    expect(s.row).toEqual(before);
    expect(s.approve).not.toHaveBeenCalled();
    expect(s.launch).not.toHaveBeenCalled();
  });

  it("never reports confirmation when the lifecycle did not confirm the selected fact", async () => {
    const s = await setup();
    s.confirmFact.mockResolvedValueOnce(structuredClone(s.row));
    expect(await s.decide()).toMatchObject({ status: "failed", item: { outcomeReason: "fact_not_confirmed" } });
  });

  it("does not propose copy confirmation for flagged nodes without unresolved facts", async () => {
    const s = await setup();
    for (const fact of Object.values(s.row.rebuild.candidate!.document.facts)) fact.origin = "owner_confirmed";
    expect((await s.adapter.propose({ workspaceId: WS, actor: ADMIN })).items).toEqual([]);
    expect(await s.adapter.currentRevision({ workspaceId: WS, actor: ADMIN }, `${WORK}:fact.hours`)).toBeNull();
    expect((await s.adapter.propose({ workspaceId: "b4000000-0000-4000-8000-000000000099", actor: ADMIN })).items).toEqual([]);
  });

  it("live ports call the existing exact fact confirmation command", async () => {
    const { deliverySourceAdapters } = await import("@/platform/needs-you/sources/live-delivery");
    const adapter = deliverySourceAdapters().find(source => source.lifecycle === "website_document")!;
    const s = await setup();
    live.list.mockResolvedValue([s.row]);
    const saved = structuredClone(s.row);
    saved.rebuild.candidate!.document.facts.hours!.origin = "owner_confirmed";
    live.confirmFact.mockResolvedValueOnce(saved);
    const item = s.items[0]!;
    expect(await adapter.resolve({ workspaceId: WS, actor: ADMIN }, item, "approve", { kind: "owner_link", recipient: OWNER, actor: ADMIN })).toMatchObject({ outcome: "done" });
    expect(live.confirmFact).toHaveBeenCalledWith(ADMIN, WORK, "hours", { expectedRevision: 4, candidateRevision: 2,
      candidateContentHash: s.row.rebuild.candidate!.contentHash, action: "confirm" });
  });
});
