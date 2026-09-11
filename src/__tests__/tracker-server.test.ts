import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getWork: vi.fn(), saveWork: vi.fn(), assertCanSaveWork: vi.fn(), rpc: vi.fn() }));
vi.mock("@/platform/workspaces/repository", () => mocks);
vi.mock("@/lib/db/client", () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));
import { createTrackerFromImport } from "@/products/tracker/engine";
import { editSavedTracker, previewTracker, recordTrackerExperiment, saveNewTracker } from "@/products/tracker/server";
import { WorkspaceAccessError, WorkspaceConflictError } from "@/platform/workspaces/types";

const actor = { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", verifiedEmail: "owner@example.com" };
const workspaceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const workId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const input = { fileName: "tasks.csv", content: "Name,Status\nExample,Open" };
function stored() {
  return { id: workId, workspaceId, productId: "tracker", resourceKind: "tracker", payload: { tracker: createTrackerFromImport(input, { trackerId: "tracker-one", actorId: actor.userId }) } };
}
describe("durable tracker commands", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.assertCanSaveWork.mockResolvedValue(undefined); });
  it("checks workspace permission before preparing an import", async () => {
    mocks.assertCanSaveWork.mockRejectedValue(new WorkspaceAccessError());
    await expect(previewTracker(actor, workspaceId, input)).rejects.toBeInstanceOf(WorkspaceAccessError);
    expect(mocks.saveWork).not.toHaveBeenCalled();
  });
  it("rebuilds the accepted tracker from source instead of accepting a forged snapshot", async () => {
    mocks.saveWork.mockImplementation(async (_actor, id, work) => ({ id: workId, workspaceId: id, ...work }));
    const result = await saveNewTracker(actor, { workspaceId, input, title: "Tasks", tracker: { revision: 999, rows: [] } });
    expect(result.tracker.revision).toBe(0);
    expect(result.tracker.originalSource).toBe(input.content);
    expect(result.tracker.rows).toHaveLength(1);
  });
  it("binds actor/time on the server and writes against the exact revision", async () => {
    const saved = stored(); mocks.getWork.mockResolvedValue(saved);
    mocks.rpc.mockImplementation(async (_name, args) => ({ data: [{ payload: args.p_payload }], error: null }));
    const result = await editSavedTracker(actor, workId, { kind: "update_cell", commandId: "command-one", baseRevision: 0, rowId: saved.payload.tracker.rows[0]!.id, columnId: saved.payload.tracker.columns[0]!.id, value: "Changed", actorId: "forged", at: "2099-01-01T00:00:00Z" });
    expect(result.tracker?.history[0]?.actorId).toBe(actor.userId);
    expect(result.tracker?.history[0]?.at).not.toBe("2099-01-01T00:00:00Z");
    expect(mocks.rpc).toHaveBeenCalledWith("update_tracker_work", expect.objectContaining({ p_expected_revision: 0, p_user_id: actor.userId, p_workspace_id: workspaceId }));
  });
  it.each(["workspace_access_denied", "tracker_revision_conflict"])("rejects a transaction failure: %s", async (message) => {
    const saved = stored(); mocks.getWork.mockResolvedValue(saved); mocks.rpc.mockResolvedValue({ data: null, error: { message } });
    const promise = editSavedTracker(actor, workId, { kind: "update_cell", commandId: "command-one", baseRevision: 0, rowId: saved.payload.tracker.rows[0]!.id, columnId: saved.payload.tracker.columns[0]!.id, value: "Changed" });
    await expect(promise).rejects.toBeInstanceOf(message === "workspace_access_denied" ? WorkspaceAccessError : WorkspaceConflictError);
  });
  it("rejects R&D evidence when the displayed tracker revision is stale", async () => {
    const saved = stored(); mocks.getWork.mockResolvedValue(saved);
    await expect(recordTrackerExperiment(actor, workId, {
      expectedRevision: 1,
      hypothesis: "Compare review time",
      workload: "Same rows",
      baselineMinutes: 10,
      setupMinutes: 1,
      reviewMinutes: 2,
      correctionMinutes: 1,
      providerCostUsd: null,
      result: "inconclusive",
      evidence: "The displayed tracker changed before submission.",
    })).rejects.toBeInstanceOf(WorkspaceConflictError);
    expect(mocks.saveWork).not.toHaveBeenCalled();
  });
  it("persists the server-read revision on accepted R&D evidence", async () => {
    const saved = stored(); mocks.getWork.mockResolvedValue(saved);
    mocks.saveWork.mockImplementation(async (_actor, id, work) => ({ id: "experiment-one", workspaceId: id, ...work }));
    const result = await recordTrackerExperiment(actor, workId, {
      expectedRevision: 0,
      hypothesis: "Compare review time",
      workload: "Same rows",
      baselineMinutes: 10,
      setupMinutes: 1,
      reviewMinutes: 2,
      correctionMinutes: 1,
      providerCostUsd: null,
      result: "inconclusive",
      evidence: "The displayed tracker was reviewed.",
    });
    expect(result.evidence).toMatchObject({ targetWorkId: workId, targetRevision: 0, evidenceKind: "operator_reported", promoted: false });
  });
});
