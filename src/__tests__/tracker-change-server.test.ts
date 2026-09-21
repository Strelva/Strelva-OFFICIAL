import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getWork: vi.fn(), saveWork: vi.fn(), assertCanSaveWork: vi.fn(), rpc: vi.fn() }));
vi.mock("@/platform/workspaces/repository", () => mocks);
vi.mock("@/lib/db/client", () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));
import { createTrackerFromImport } from "@/products/tracker/engine";
import { editSavedTracker } from "@/products/tracker/server";
import { WorkspaceAccessError, WorkspaceConflictError } from "@/platform/workspaces/types";

const actor = { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", verifiedEmail: "owner@example.com" };
const workspaceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const workId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
function fixture() {
  return { id: workId, workspaceId, productId: "tracker", resourceKind: "tracker", payload: { tracker: createTrackerFromImport({ fileName: "tasks.csv", content: "Name,Status\nAvery,New\nMaria,Waiting" }, { trackerId: "tracker", actorId: actor.userId }) } };
}
describe("stored grouped changes", () => {
  beforeEach(() => vi.resetAllMocks());
  it("persists batch and undo with server attribution through the existing revision transaction", async () => {
    const saved = fixture();
    mocks.getWork.mockImplementation(async () => saved);
    mocks.rpc.mockImplementation(async (_name, args) => { saved.payload = args.p_payload; return { data: [{ payload: args.p_payload }], error: null }; });
    const columnId = saved.payload.tracker.columns[1]!.id;
    await editSavedTracker(actor, workId, { kind: "bulk_update", commandId: "batch", baseRevision: 0, rowIds: saved.payload.tracker.rows.map(row => row.id), columnId, value: "Assigned", actorId: "forged" });
    const result = await editSavedTracker(actor, workId, { kind: "undo_change", commandId: "undo", baseRevision: 1, targetCommandId: "batch" });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenLastCalledWith("update_tracker_work", expect.objectContaining({ p_expected_revision: 1, p_user_id: actor.userId }));
    expect(result.tracker.rows.map(row => row.cells[columnId]!.value)).toEqual(["New", "Waiting"]);
    expect(result.tracker.history.every(entry => entry.actorId === actor.userId)).toBe(true);
  });
  it.each(["workspace_access_denied", "tracker_revision_conflict"])("rejects %s at commit time without confirming the batch", async message => {
    const saved = fixture(); mocks.getWork.mockResolvedValue(saved); mocks.rpc.mockResolvedValue({ data: null, error: { message } });
    await expect(editSavedTracker(actor, workId, { kind: "bulk_update", commandId: "batch", baseRevision: 0, rowIds: saved.payload.tracker.rows.map(row => row.id), columnId: saved.payload.tracker.columns[1]!.id, value: "Assigned" })).rejects.toBeInstanceOf(message === "workspace_access_denied" ? WorkspaceAccessError : WorkspaceConflictError);
    expect(saved.payload.tracker.revision).toBe(0);
  });
});
