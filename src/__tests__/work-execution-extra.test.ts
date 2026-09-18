import { describe, expect, it } from "vitest";
import { responsibilityCommands, type ExecutionAdapter, type ExecutionStore } from "@/platform/work-execution/runtime";
import type { Responsibility, StepOutcome } from "@/platform/work-execution/engine";
import { WorkspaceAccessError, WorkspaceConflictError, type WorkspaceActor } from "@/platform/workspaces/types";
const actor = { userId: "owner", verifiedEmail: "owner@example.com" };
const input = { title: "Maintain procedure", intent: "Keep the procedure current", steps: [{ id: "edit", operation: "document.edit", workId: "11111111-1111-4111-8111-111111111111", input: { kind: "edit", expectedRevision: 0, title: "Procedure", text: "Confirmed" }, maximumCents: 0 }] };
function database() {
  const rows = new Map<string, Responsibility>();
  let member = true;
  const authorize = (identity: WorkspaceActor) => { if (!member || identity.userId !== actor.userId) throw new WorkspaceAccessError(); };
  const store: ExecutionStore = {
    async read(identity, id) { authorize(identity); const payload = rows.get(id); if (!payload) throw new WorkspaceAccessError(); return { id, workspaceId: "workspace", payload: structuredClone(payload) }; },
    async create(identity, _workspaceId, payload) { authorize(identity); rows.set("work", structuredClone(payload)); return { id: "work" }; },
    async write(identity, id, _workspaceId, revision, payload) { authorize(identity); if (rows.get(id)?.revision !== revision) throw new WorkspaceConflictError(); rows.set(id, structuredClone(payload)); return structuredClone(payload); },
  };
  return { store, revoke: () => { member = false; }, restore: () => { member = true; } };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const complete: StepOutcome = { effect: "accepted", status: "completed", result: { receipt: "native-result-1" } };

describe("responsibility public commands and durable concurrency", () => {
  it("keeps cancellation and a late accepted result when a claimed worker finishes", async () => {
    const db = database(), started = deferred<void>(), outcome = deferred<StepOutcome>();
    const service = responsibilityCommands(db.store, { recheck: async () => {}, perform: async () => { started.resolve(); return outcome.promise; } });
    await service.create(actor, "workspace", input);
    await service.command(actor, "work", { kind: "approve", expectedRevision: 0 });
    const running = service.run(actor, "work");
    await started.promise;
    const cancelled = await service.command(actor, "work", { kind: "cancel", expectedRevision: 2 });
    expect(cancelled.payload.status).toBe("cancelled");
    outcome.resolve(complete);
    const result = await running;
    expect(result.payload).toMatchObject({ status: "cancelled", steps: [{ status: "completed", effect: "accepted", result: { receipt: "native-result-1" } }] });
    await expect(service.run(actor, "work")).rejects.toThrow(/not ready/i);
  });

  it("allows only one concurrent claim to reach its native command", async () => {
    const db = database(), effects: string[] = [];
    const service = responsibilityCommands(db.store, { recheck: async () => {}, perform: async () => { effects.push("changed"); return complete; } });
    await service.create(actor, "workspace", input); await service.command(actor, "work", { kind: "approve", expectedRevision: 0 });
    const results = await Promise.allSettled([service.run(actor, "work"), service.run(actor, "work")]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(effects).toEqual(["changed"]);
  });

  it("does no native work after membership is revoked and leaves the claim closed for reconciliation", async () => {
    const db = database(), effects: string[] = [];
    let checks = 0;
    const adapter: ExecutionAdapter = { inspect: async () => {}, recheck: async () => { checks += 1; if (checks === 2) { db.revoke(); throw new WorkspaceAccessError(); } }, perform: async () => { effects.push("changed"); return complete; } };
    const service = responsibilityCommands(db.store, adapter);
    await service.create(actor, "workspace", input); await service.command(actor, "work", { kind: "approve", expectedRevision: 0 });
    await expect(service.run(actor, "work")).rejects.toThrow(/denied/i);
    expect(effects).toEqual([]);
    db.restore();
    await expect(service.run(actor, "work")).rejects.toThrow(/reconcile/i);
  });

  it("separates proposal inspection from future dependent revision checks", async () => {
    const db = database(); let revision = 0;
    const service = responsibilityCommands(db.store, {
      inspect: async () => {},
      recheck: async (_actor, _workspaceId, step) => { if (step.input.expectedRevision !== revision) throw new WorkspaceConflictError("stale source"); },
      perform: async () => { revision += 1; return complete; },
    });
    await service.create(actor, "workspace", { ...input, steps: [...input.steps, { ...input.steps[0], id: "edit_again", dependsOn: ["edit"], input: { ...input.steps[0]!.input, expectedRevision: 1 } }] });
    await service.command(actor, "work", { kind: "approve", expectedRevision: 0 });
    await service.run(actor, "work");
    const finished = await service.run(actor, "work");
    expect(finished.payload.status).toBe("completed");
    expect(revision).toBe(2);
  });
});
