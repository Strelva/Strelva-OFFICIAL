import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), preflight: vi.fn(), get: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/platform/workspaces/repository", () => ({ assertCanSaveWork: mocks.preflight, getWork: mocks.get }));
import { runWorkspaceOperation, WorkspaceOperationPendingError, operationRequest } from "@/platform/workspaces/operations";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
const actor = { userId: "person", verifiedEmail: "person@example.com" };
const work = { productId: "ai_visibility", resourceKind: "private_assessment", title: "Fictional", input: { business: "Fictional" } };
const op = (status: string, work_id: string | null = null) => ({ data: [{ id: "attempt", status, work_id }], error: null });
beforeEach(() => { vi.resetAllMocks(); mocks.get.mockResolvedValue({ id: "saved" }); });
describe("durable assessment recovery", () => {
 it("checkpoints before committing and reads the authorized result", async () => {
  mocks.rpc.mockResolvedValueOnce(op("running")).mockResolvedValueOnce(op("ready")).mockResolvedValueOnce(op("completed", "saved"));
  const run = vi.fn().mockResolvedValue({ score: 80 });
  expect(await runWorkspaceOperation({ actor, workspaceId: "workspace", id: "attempt", work, run })).toEqual({ id: "saved" });
  expect(mocks.rpc.mock.calls.map(call => call[1].p_action)).toEqual(["claim","checkpoint","complete"]);
  expect(mocks.get).toHaveBeenCalledWith(actor, "saved");
  expect(run).toHaveBeenCalledOnce();
 });
 it("does not re-run providers after a lost completion response", async () => {
  mocks.rpc.mockResolvedValue(op("completed", "saved"));
  const run=vi.fn();
  await runWorkspaceOperation({ actor, workspaceId: "workspace", id: "attempt", work, run });
  expect(run).not.toHaveBeenCalled(); expect(mocks.preflight).not.toHaveBeenCalled();
 });
 it("completes a durable checkpoint without scoring again", async () => {
  mocks.rpc.mockResolvedValueOnce(op("ready")).mockResolvedValueOnce(op("completed", "saved"));
  const run=vi.fn();
  await runWorkspaceOperation({ actor, workspaceId: "workspace", id: "attempt", work, run });
  expect(run).not.toHaveBeenCalled();
 });
 it("preserves a ready checkpoint when the final database commit fails", async () => {
  mocks.rpc.mockResolvedValueOnce(op("ready")).mockResolvedValueOnce({ data: null, error: { message: "storage offline" } });
  await expect(runWorkspaceOperation({ actor, workspaceId: "workspace", id: "attempt", work, run: vi.fn() })).rejects.toThrow("could not be confirmed");
  expect(mocks.rpc.mock.calls.map(call => call[1].p_action)).toEqual(["claim","complete"]);
 });
 it("records failed attempts and does not return a false result", async () => {
  mocks.rpc.mockResolvedValueOnce(op("running")).mockResolvedValueOnce(op("failed"));
  await expect(runWorkspaceOperation({ actor, workspaceId: "workspace", id: "attempt", work, run: async () => { throw new Error("provider failed"); } })).rejects.toThrow("provider failed");
  expect(mocks.rpc.mock.calls.at(-1)?.[1].p_action).toBe("fail"); expect(mocks.get).not.toHaveBeenCalled();
 });
 it("fails closed for wrong actors and concurrent attempts", async () => {
  mocks.rpc.mockResolvedValueOnce({ error: { message: "workspace_access_denied" } });
  await expect(operationRequest(actor,"workspace","attempt","read")).rejects.toBeInstanceOf(WorkspaceAccessError);
  mocks.rpc.mockResolvedValueOnce({ error: { message: "operation_in_progress" } });
  await expect(operationRequest(actor,"workspace","attempt","claim")).rejects.toBeInstanceOf(WorkspaceOperationPendingError);
 });
});
