import { describe, expect, it, vi } from "vitest";
vi.mock("ai", () => ({ tool: (definition: unknown) => definition }));
import { buildAskTools, type AskToolsContext } from "@/platform/ask/tools";
import { businessFactDraftPatch, type BusinessFactDraft, type BusinessFactDraftStore } from "@/platform/ask/workspace-drafts";
import { businessRecordDraftAdapter, businessFactDraftItem } from "@/platform/needs-you/sources/business-record-draft";
import type { OwnerDecision } from "@/platform/needs-you/contracts";

const WS = "11111111-1111-4111-8111-111111111111";
const ID = "22222222-2222-4222-8222-222222222222";
const actor = { userId: ID, verifiedEmail: "owner@example.test" };
const saved: BusinessFactDraft = { id: ID, workspaceId: WS, systemId: null, expectedRevision: 3, patch: { facts: { phone: { value: "716-555-0100" } } }, summary: "Change phone", status: "pending", createdAt: "2026-10-06T00:00:00Z", receipt: null };
const route = { route: "owner_decides" as const, itemRef: ID, decideAt: `/workspace?workspaceId=${WS}` };

function context(): AskToolsContext {
  return { workspaceId: WS, systemId: null, tenantId: "fictional", actor, role: "owner", origin: "owner_interpreted", askedOnBehalf: null,
    lastUserText: "Change our phone", turnId: ID, tenantTools: null,
    authority: { read: vi.fn(async () => ({ role: "owner", exited: false, site: { state: "linked", tenantActive: true }, googleWriteGranted: false, inquiriesEnabled: true })) },
    requests: { file: vi.fn(), list: vi.fn() }, possibilities: { open: vi.fn(), list: vi.fn() }, needsYou: { submit: vi.fn(async () => route) },
    workspaceDrafts: { businessFact: vi.fn(async () => ({ draftId: ID, routing: route })), inquiryReply: vi.fn(async () => ({ eventIds: ["event-one"] })), readBusiness: vi.fn(async () => ({ revision: 3, facts: {}, services: [], people: [] })) },
    onReceipt: vi.fn(),
  } as AskToolsContext;
}
async function execute(ctx: AskToolsContext, name: "draft_business_fact_change" | "draft_inquiry_reply", input: unknown) {
  const selected = buildAskTools(ctx)[name] as unknown as { execute(input: unknown): Promise<Record<string, unknown>> };
  return selected.execute(input);
}

describe("Ask exact workspace drafts", () => {
  it("validates typed patches and refuses verification, oversized and invalid facts", () => {
    expect(businessFactDraftPatch(saved.patch)).toEqual(saved.patch);
    expect(() => businessFactDraftPatch({ facts: { phone: { value: "wrong" } } })).toThrow();
    expect(() => businessFactDraftPatch({ facts: { phone: { value: "716-555-0100", verified: true } } })).toThrow("ask_draft_cannot_verify_fact");
    expect(() => businessFactDraftPatch({ facts: { description: { value: "x".repeat(700) } } })).toThrow("ask_draft_too_large_split_change");
  });
  it("stores typed fact drafts and reports both source and decision receipt IDs", async () => {
    const ctx = context();
    const output = await execute(ctx, "draft_business_fact_change", { summary: saved.summary, expectedRevision: 3, patch: saved.patch });
    expect(ctx.workspaceDrafts!.businessFact).toHaveBeenCalledWith(actor, expect.objectContaining({ expectedRevision: 3, patch: saved.patch, workspaceId: WS }));
    expect(output).toMatchObject({ success: true, draftId: ID, needsYou: route });
    expect(ctx.onReceipt).toHaveBeenCalledWith(expect.objectContaining({ ids: [ID], status: "queued", needsYou: route }));
    expect(ctx.requests.file).not.toHaveBeenCalled();
  });
  it("persistence failures do not file an accepted Request or claim a draft", async () => {
    const ctx = context();
    vi.mocked(ctx.workspaceDrafts!.businessFact).mockRejectedValueOnce(new Error("database unavailable"));
    expect(await execute(ctx, "draft_business_fact_change", { summary: saved.summary, expectedRevision: 3, patch: saved.patch })).toMatchObject({ success: false, agentResultStatus: "failed" });
    expect(ctx.onReceipt).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", ids: [] }));
    expect(ctx.requests.file).not.toHaveBeenCalled();
  });
  it("inquiry release off refuses before persistence", async () => {
    const ctx = context();
    vi.mocked(ctx.authority.read).mockResolvedValueOnce({ role: "owner", exited: false, site: { state: "linked", tenantActive: true }, googleWriteGranted: false, inquiriesEnabled: false });
    expect(await execute(ctx, "draft_inquiry_reply", { inquiryId: "inquiry", replyText: "Thank you." })).toMatchObject({ blocked: true });
    expect(ctx.workspaceDrafts!.inquiryReply).not.toHaveBeenCalled();
  });
  it("saves the actual inquiry copy and preserves receipt IDs when Needs you sync fails", async () => {
    const ctx = context();
    vi.mocked(ctx.needsYou.submit).mockRejectedValueOnce(new Error("sync unavailable"));
    expect(await execute(ctx, "draft_inquiry_reply", { inquiryId: "inquiry", replyText: "Thank you." })).toMatchObject({ success: true, eventIds: ["event-one"], needsYouSyncPending: true });
    expect(ctx.workspaceDrafts!.inquiryReply).toHaveBeenCalledWith(actor, { workspaceId: WS, tenantId: "fictional", inquiryId: "inquiry", replyText: "Thank you." });
    expect(ctx.onReceipt).toHaveBeenCalledWith(expect.objectContaining({ status: "queued", ids: ["event-one"] }));
  });
  it("a failed inquiry draft reports no queued write", async () => {
    const ctx = context();
    vi.mocked(ctx.workspaceDrafts!.inquiryReply).mockRejectedValueOnce(new Error("store unavailable"));
    expect(await execute(ctx, "draft_inquiry_reply", { inquiryId: "inquiry", replyText: "Thank you." })).toMatchObject({ success: false, agentResultStatus: "failed" });
    expect(ctx.needsYou.submit).not.toHaveBeenCalled();
  });
});

describe("business draft Needs you resolution", () => {
  const item = { ...businessFactDraftItem(saved), id: ID, workspaceId: WS } as OwnerDecision;
  function store(): BusinessFactDraftStore { return { save: vi.fn(), list: vi.fn(async () => [saved]), resolve: vi.fn(async () => ({ ...saved, status: "approved" as const, receipt: { sequence: 4, revision: 4 } })) }; }
  it("links a durable source and applies only through its resolver", async () => {
    const persistence = store(); const adapter = businessRecordDraftAdapter(persistence);
    expect((await adapter.propose({ workspaceId: WS, actor })).items).toEqual([businessFactDraftItem(saved)]);
    expect(await adapter.resolve({ workspaceId: WS, actor }, item, "approve", { kind: "session", actor })).toEqual({ outcome: "done", receiptRef: `business_record:${WS}:4` });
    expect(persistence.resolve).toHaveBeenCalledWith(actor, WS, ID, "approve");
  });
  it("wrong business and changed exact patch refuse without a write", async () => {
    const persistence = store(); const adapter = businessRecordDraftAdapter(persistence);
    expect(await adapter.resolve({ workspaceId: ID, actor }, item, "approve", { kind: "session", actor })).toMatchObject({ outcome: "failed", reason: "workspace_mismatch" });
    vi.mocked(persistence.list).mockResolvedValueOnce([{ ...saved, patch: { facts: { phone: { value: "716-555-0101" } } } }]);
    expect(await adapter.resolve({ workspaceId: WS, actor }, item, "approve", { kind: "session", actor })).toMatchObject({ outcome: "failed", reason: "source_changed" });
    expect(persistence.resolve).not.toHaveBeenCalled();
  });
  it("a stale revision rejects without a success receipt", async () => {
    const persistence = store(); vi.mocked(persistence.resolve).mockRejectedValueOnce(new Error("business_record_revision_conflict"));
    expect(await businessRecordDraftAdapter(persistence).resolve({ workspaceId: WS, actor }, item, "approve", { kind: "session", actor })).toEqual({ outcome: "failed", reason: "business_record_changed_or_unavailable" });
  });
  it("expiry changes no record", async () => {
    const persistence = store();
    expect(await businessRecordDraftAdapter(persistence).resolve({ workspaceId: WS }, item, "not_yet", { kind: "expiry" })).toEqual({ outcome: "done", reason: "Expired, nothing changed" });
    expect(persistence.resolve).not.toHaveBeenCalled();
  });
});
