import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceAccessError, WorkspaceStoreError } from "@/platform/workspaces/types";
import { changeDocument, createDocument, type DocumentReceipt } from "@/products/documents/contracts";

const mocks = vi.hoisted(() => ({ db: vi.fn(), getWork: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), lt: vi.fn(), order: vi.fn(), limit: vi.fn() }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: mocks.db }));
vi.mock("@/platform/workspaces/repository", () => ({ getWork: mocks.getWork, saveWork: vi.fn() }));
import { readWorkspaceDocumentHistory } from "@/products/documents/server";

const actor = { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", verifiedEmail: "agency@example.test" };
const workId = "33333333-3333-4333-8333-333333333333";
const workspaceId = "22222222-2222-4222-8222-222222222222";
let doc = createDocument({ title: "Shared procedure", text: "v0" }, actor.userId);
const receipts: DocumentReceipt[] = [];
for (let i = 1; i <= 1000; i += 1) {
  doc = changeDocument(doc, { kind: "edit", expectedRevision: i - 1, title: doc.title, text: `v${i}` }, actor.userId);
  receipts.push(doc.history.at(-1)!);
}
const saved = { id: workId, workspaceId, productId: "documents", resourceKind: "document", payload: doc, input: null };
const query = { select: mocks.select, eq: mocks.eq, lt: mocks.lt, order: mocks.order, limit: mocks.limit };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("STRELVA_DOCUMENT_HISTORY_RELEASE", "1");
  mocks.db.mockReturnValue({ from: mocks.from }); mocks.from.mockReturnValue(query);
  mocks.select.mockReturnValue(query); mocks.eq.mockReturnValue(query); mocks.lt.mockReturnValue(query); mocks.order.mockReturnValue(query);
  mocks.getWork.mockResolvedValue(saved);
  mocks.limit.mockResolvedValue({ data: [], error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("private document revision retrieval", () => {
  it("does not read identity or persistence with history off", async () => {
    vi.stubEnv("STRELVA_DOCUMENT_HISTORY_RELEASE", "0");
    await expect(readWorkspaceDocumentHistory(actor, workId)).rejects.toBeInstanceOf(WorkspaceStoreError);
    expect(mocks.getWork).not.toHaveBeenCalled(); expect(mocks.db).not.toHaveBeenCalled();
  });
  it("uses the exact-work read grant and both stored identities for bounded pages", async () => {
    const rows = receipts.slice(959, 980).reverse().map(receipt => ({ revision: receipt.revision, receipt }));
    mocks.limit.mockResolvedValue({ data: rows, error: null });
    const result = await readWorkspaceDocumentHistory(actor, workId, 981);
    expect(mocks.getWork).toHaveBeenCalledWith(actor, workId);
    expect(mocks.from).toHaveBeenCalledWith("document_revisions");
    expect(mocks.select).toHaveBeenCalledWith("revision, receipt");
    expect(mocks.eq.mock.calls).toEqual([["work_id", workId], ["workspace_id", workspaceId]]);
    expect(mocks.lt).toHaveBeenCalledWith("revision", 981);
    expect(mocks.order).toHaveBeenCalledWith("revision", { ascending: false });
    expect(mocks.limit).toHaveBeenCalledWith(21);
    expect(result.receipts.map(receipt => receipt.revision)).toEqual(Array.from({ length: 20 }, (_, i) => 980 - i));
    expect(result.nextBeforeRevision).toBe(961);
  });
  it("pins a page to the authorized document revision even with a future cursor", async () => {
    await readWorkspaceDocumentHistory(actor, workId, 2000);
    expect(mocks.lt).toHaveBeenCalledWith("revision", 1001);
  });
  it("reports the end of shared history without inventing receipts", async () => {
    mocks.limit.mockResolvedValue({ data: [{ revision: 1, receipt: receipts[0] }], error: null });
    expect(await readWorkspaceDocumentHistory(actor, workId, 2)).toMatchObject({ receipts: [receipts[0]], nextBeforeRevision: null });
  });
  it("rejects revoked or foreign access before reading the history table", async () => {
    mocks.getWork.mockRejectedValue(new WorkspaceAccessError());
    await expect(readWorkspaceDocumentHistory(actor, workId)).rejects.toBeInstanceOf(WorkspaceAccessError);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it.each([null, { ...saved, productId: "applications" }, { ...saved, resourceKind: "report" }])("does not read another product's history", async work => {
    mocks.getWork.mockResolvedValue(work);
    await expect(readWorkspaceDocumentHistory(actor, workId)).rejects.toBeInstanceOf(WorkspaceAccessError);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it.each([
    { data: null, error: null }, { data: [], error: { message: "offline" } },
    { data: [{ revision: 2, receipt: receipts[0] }], error: null },
    { data: [{ revision: 1, receipt: { revision: 1 } }], error: null },
  ])("fails closed on missing, failed or malformed persistence", async result => {
    mocks.limit.mockResolvedValue(result);
    await expect(readWorkspaceDocumentHistory(actor, workId)).rejects.toBeInstanceOf(WorkspaceStoreError);
  });
  it("reports unavailable configuration rather than returning empty history", async () => {
    mocks.db.mockReturnValue(null);
    await expect(readWorkspaceDocumentHistory(actor, workId)).rejects.toBeInstanceOf(WorkspaceStoreError);
  });
});
