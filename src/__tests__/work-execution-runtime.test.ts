import { expect, it } from "vitest";
import { responsibilityCommands, type ExecutionStore } from "@/platform/work-execution/runtime";
import { createResponsibility, type Responsibility } from "@/platform/work-execution/engine";
import { WorkspaceAccessError, WorkspaceConflictError } from "@/platform/workspaces/types";
const actor = { userId: "owner", verifiedEmail: "owner@example.test" };
const at = "2026-09-12T12:00:00.000Z";
const input = { title: "Update procedure", intent: "Keep the office procedure current", steps: [{ id: "write", operation: "document.edit", workId: "00000000-0000-4000-8000-000000000001", input: { expectedRevision: 0, kind: "edit", title: "Procedure", text: "Updated" }, maximumCents: 0 }] };
function fixture() {
  let work = createResponsibility(input, actor.userId, at);
  const store: ExecutionStore = {
    async read() { return { id: "work", workspaceId: "workspace", payload: structuredClone(work) }; },
    async create(_actor, _workspaceId, payload) { work = payload; return { id: "work" }; },
    async write(_actor, _workId, _workspaceId, expectedRevision, payload: Responsibility) {
      if (work.revision !== expectedRevision) throw new WorkspaceConflictError(); work = structuredClone(payload); return work;
    },
  };
  return store;
}
it("reopens durable progress after a worker restart without replaying completed work", async () => {
  const store = fixture(); let writes = 0;
  const adapter = { recheck: async () => {}, perform: async () => { writes++; return { effect: "accepted" as const, status: "completed" as const }; } };
  const first = responsibilityCommands(store, adapter, () => at);
  await first.command(actor, "work", { kind: "approve", expectedRevision: 0 });
  expect((await first.run(actor, "work")).payload.status).toBe("completed");
  const restarted = responsibilityCommands(store, adapter, () => at);
  await expect(restarted.run(actor, "work")).rejects.toThrow();
  expect(writes).toBe(1);
});
it("concurrent workers admit one mutation", async () => {
  const store = fixture(); let writes = 0;
  const commands = responsibilityCommands(store, { recheck: async () => {}, perform: async () => { writes++; return { effect: "accepted", status: "completed" }; } }, () => at);
  await commands.command(actor, "work", { kind: "approve", expectedRevision: 0 });
  await Promise.allSettled([commands.run(actor, "work"), commands.run(actor, "work")]);
  expect(writes).toBe(1);
  expect((await store.read(actor, "work")).payload.status).toBe("completed");
});
it("revocation between claim and action prevents the write and permits safe correction", async () => {
  const store = fixture(); let checks = 0; let writes = 0;
  const commands = responsibilityCommands(store, { recheck: async () => { if (++checks === 2) throw new WorkspaceAccessError(); }, perform: async () => { writes++; return { effect: "accepted", status: "completed" }; } }, () => at);
  await commands.command(actor, "work", { kind: "approve", expectedRevision: 0 });
  const result = await commands.run(actor, "work");
  expect(result.payload.status).toBe("needs_attention");
  expect(result.payload.steps[0]?.effect).toBe("none");
  expect(writes).toBe(0);
});
it("an interrupted provider response closes the attempt to replay", async () => {
  const store = fixture(); let writes = 0;
  const commands = responsibilityCommands(store, { recheck: async () => {}, perform: async () => { writes++; throw new Error("response lost after write"); } }, () => at);
  await commands.command(actor, "work", { kind: "approve", expectedRevision: 0 });
  const result = await commands.run(actor, "work");
  expect(result.payload.steps[0]?.status).toBe("unknown");
  await expect(commands.command(actor, "work", { kind: "retry", expectedRevision: result.payload.revision })).rejects.toThrow(/replay/);
  expect(writes).toBe(1);
});
