import { describe, expect, it, vi } from "vitest";
import { createBudgetedExecutor, createBudgetedReconciler, type BudgetExecution, type BudgetExecutionStore } from "@/platform/work-economics/runtime";
import { createProviderEvidenceResolver, ProviderEvidenceMismatchError, type TrustedProviderReceipt } from "@/platform/work-economics/provider-evidence";

const actor = { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", verifiedEmail: "owner@example.com" };
const input = {
  jobId: "11111111-1111-4111-8111-111111111111", executionKey: "attempt-1.action-1",
  maximumCents: 100, kind: "tool" as const,
  expectedTarget: { workspaceId: "22222222-2222-4222-8222-222222222222", workId: "33333333-3333-4333-8333-333333333333" },
};

/** External persistence port; the SQL suite proves locking and accounting separately. */
function storage(): BudgetExecutionStore {
  let execution: BudgetExecution | undefined;
  return {
    async authorize() {},
    async claim(_actor, command) {
      if (execution) return { execution, claimed: false };
      execution = {
        jobId: command.jobId, executionKey: command.executionKey, maximumCents: command.maximumCents,
        kind: command.kind, attribution: command.attribution, status: "reserved", effect: null,
        amountCents: null, billableCents: null, createdBy: actor.userId,
      };
      return { execution, claimed: true };
    },
    async start() { execution = { ...execution!, status: "running" }; return execution; },
    async finish(_actor, _command, result) {
      execution = { ...execution!, status: "finished", effect: result.effect,
        amountCents: result.amountCents, billableCents: result.amountCents };
      return execution;
    },
    async reconcile(_actor, _command, evidence) {
      execution = { ...execution!, status: "finished", effect: evidence.effect,
        amountCents: evidence.amountCents, billableCents: evidence.amountCents,
        reconciliationReference: evidence.evidenceReference };
      return execution;
    },
  };
}

describe("budgeted execution boundary", () => {
  it("rechecks permission before action and returns completed work without replaying its effect", async () => {
    const execute = createBudgetedExecutor(storage());
    let rechecked = false;
    let delivered = 0;
    const handlers = {
      async recheck() { rechecked = true; },
      async perform() {
        expect(rechecked).toBe(true);
        delivered += 1;
        return { value: "receipt-123", amountCents: 30, effect: "accepted" as const };
      },
    };
    expect(await execute(actor, input, handlers)).toMatchObject({ disposition: "performed", value: "receipt-123", execution: { amountCents: 30, effect: "accepted" } });
    expect(await execute(actor, input, handlers)).toMatchObject({ disposition: "replayed", execution: { effect: "accepted" } });
    expect(delivered).toBe(1);
  });
  it("releases a reservation when permission is revoked before the action", async () => {
    const execute = createBudgetedExecutor(storage());
    const failure = new Error("Permission revoked");
    let acted = false;
    const handlers = {
      async recheck() { throw failure; },
      async perform() { acted = true; return { value: null, amountCents: 0, effect: "none" as const }; },
    };
    await expect(execute(actor, input, handlers)).rejects.toMatchObject({ name: "BudgetExecutionNotStartedError", cause: failure });
    expect(await execute(actor, input, handlers)).toMatchObject({ disposition: "replayed", execution: { effect: "none", amountCents: 0 } });
    expect(acted).toBe(false);
  });

  it("holds unknown cost and prevents duplicate writes after a provider timeout", async () => {
    const execute = createBudgetedExecutor(storage());
    let writes = 0;
    const handlers = {
      async recheck() {},
      async perform() { writes += 1; throw new Error("Read-back timed out after provider write"); },
    };
    await expect(execute(actor, input, handlers)).rejects.toThrow("Read-back timed out");
    expect(await execute(actor, input, handlers)).toMatchObject({ disposition: "replayed", execution: { effect: "unknown", amountCents: null } });
    expect(writes).toBe(1);
  });

  it("does not mistake a lost start response for proof of no effect", async () => {
    const store = storage();
    const start = store.start;
    store.start = async (...args) => { await start(...args); throw new Error("Database response lost"); };
    const execute = createBudgetedExecutor(store);
    await expect(execute(actor, input, {
      async recheck() {},
      async perform() { throw new Error("must not act"); },
    })).rejects.toThrow("Database response lost");
    // No provider was invoked, so the caller can prove this reservation unused.
    expect(await execute(actor, input, { async recheck() {}, async perform() { throw new Error("must not act"); } })).toMatchObject({ execution: { effect: "none" } });
  });

  it("reserves included work before acting and settles only after its receipt", async () => {
    const events: string[] = [];
    const store = storage();
    const finish = store.finish;
    store.finish = async (...args) => { events.push("receipt"); return finish(...args); };
    const execute = createBudgetedExecutor(store, {
      async reserve(_actor, _command, unit) { expect(unit).toBe("completed_document_change"); events.push("allowance"); },
      async settle() { events.push("settle"); },
    });
    await execute(actor, input, {
      usageUnit: "completed_document_change",
      async recheck() { events.push("recheck"); },
      async perform() { events.push("effect"); return { value: "saved", amountCents: 0, effect: "accepted" }; },
    });
    expect(events).toEqual(["allowance", "recheck", "effect", "receipt", "settle"]);
  });

  it("does not act when the included-work limit is exhausted", async () => {
    let effects = 0;
    let settlements = 0;
    const execute = createBudgetedExecutor(storage(), {
      async reserve() { throw new Error("Included work limit reached"); },
      async settle() { settlements++; },
    });
    await expect(execute(actor, input, {
      usageUnit: "completed_document_change",
      async recheck() {},
      async perform() { effects++; return { value: null, amountCents: 0, effect: "accepted" }; },
    })).rejects.toMatchObject({ name: "BudgetExecutionNotStartedError" });
    expect(effects).toBe(0);
    expect(settlements).toBe(1);
  });

  it("repairs a failed allowance settlement without repeating completed work", async () => {
    let effects = 0;
    let settlements = 0;
    const execute = createBudgetedExecutor(storage(), {
      async reserve() {},
      async settle() { if (++settlements === 1) throw new Error("Accounting unavailable"); },
    });
    const handlers = {
      usageUnit: "completed_document_change" as const,
      async recheck() {},
      async perform() { effects++; return { value: "saved", amountCents: 0, effect: "accepted" as const }; },
    };
    await expect(execute(actor, input, handlers)).rejects.toThrow("Accounting unavailable");
    expect(await execute(actor, input, handlers)).toMatchObject({ disposition: "replayed", execution: { effect: "accepted" } });
    expect(effects).toBe(1);
    expect(settlements).toBe(2);
  });

  it("holds an unconfirmed reservation and preserves both failures when pre-action finalization fails", async () => {
    const store = storage();
    const denial = new Error("Permission revoked");
    const receiptFailure = new Error("Receipt database unavailable");
    store.finish = async () => { throw receiptFailure; };
    let effects = 0;
    let settlements = 0;
    const execute = createBudgetedExecutor(store, {
      async reserve() {},
      async settle() { settlements++; },
    });
    const handlers = {
      usageUnit: "completed_document_change" as const,
      async recheck() { throw denial; },
      async perform() { effects++; return { value: null, amountCents: 0, effect: "accepted" as const }; },
    };
    await expect(execute(actor, input, handlers)).rejects.toMatchObject({
      message: "The action did not start, but its reservation could not be closed. Reconcile it before continuing.",
      cause: { errors: [denial, receiptFailure] },
    });
    await expect(execute(actor, input, handlers)).rejects.toThrow("Reconcile it before continuing");
    expect(effects).toBe(0);
    expect(settlements).toBe(0);
  });

  it("authorizes the exact workspace before consulting trusted reconciliation evidence", async () => {
    const store = storage();
    store.authorize = async (_actor, command) => {
      if (command.expectedTarget.workspaceId !== input.expectedTarget.workspaceId) {
        throw new Error("workspace denied");
      }
    };
    const resolve = vi.fn().mockResolvedValue({ effect: "accepted", amountCents: 20, evidenceReference: "provider:usage:receipt-1" });
    await expect(createBudgetedReconciler(store)(actor, {
      ...input,
      expectedTarget: { ...input.expectedTarget, workspaceId: "44444444-4444-4444-8444-444444444444" },
    }, { resolve })).rejects.toThrow("workspace denied");
    expect(resolve).not.toHaveBeenCalled();
  });

  it("rejects reconciliation when authority is revoked during evidence lookup", async () => {
    const store = storage();
    let checks = 0;
    store.authorize = async () => {
      checks += 1;
      if (checks === 2) throw new Error("access revoked");
    };
    const reconcileReceipt = vi.spyOn(store, "reconcile");
    const resolve = vi.fn().mockResolvedValue({ effect: "accepted", amountCents: 20, evidenceReference: "provider:usage:receipt-revoked" });
    await expect(createBudgetedReconciler(store)(actor, input, { resolve })).rejects.toThrow("access revoked");
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(reconcileReceipt).not.toHaveBeenCalled();
  });

  it("settles a trusted known-cost receipt exactly once without another provider action", async () => {
    const store = storage();
    await store.claim(actor, { ...input, attribution: "normal" });
    await store.start(actor, { ...input, attribution: "normal" });
    await store.finish(actor, { ...input, attribution: "normal" }, { effect: "accepted", amountCents: null });
    const resolve = vi.fn().mockResolvedValue({ effect: "accepted", amountCents: 20, evidenceReference: "provider:usage:receipt-1" });
    let settlements = 0;
    const reconcile = createBudgetedReconciler(store, { async reserve() {}, async settle() { settlements++; } });
    const first = await reconcile(actor, input, { resolve });
    const second = await reconcile(actor, input, { resolve });
    expect(first).toMatchObject({ effect: "accepted", amountCents: 20, reconciliationReference: "provider:usage:receipt-1" });
    expect(second).toEqual(first);
    expect(settlements).toBe(2);
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it("never converts missing provider evidence into fabricated zero usage", async () => {
    const store = storage();
    await store.claim(actor, { ...input, attribution: "normal" });
    await store.start(actor, { ...input, attribution: "normal" });
    await store.finish(actor, { ...input, attribution: "normal" }, { effect: "accepted", amountCents: null });
    await expect(createBudgetedReconciler(store)(actor, input, {
      async resolve() { return { effect: "accepted", amountCents: null, evidenceReference: "provider:pending" } as never; },
    })).rejects.toThrow("known amount");
  });

  it.each(["normal", "strelva_retry"] as const)("binds trusted provider evidence to %s attribution", async (attribution) => {
    const store = storage();
    const command = { ...input, attribution };
    await store.claim(actor, command);
    await store.start(actor, command);
    await store.finish(actor, command, { effect: "accepted", amountCents: null });
    const receipt: TrustedProviderReceipt = {
      version: 1, provider: "billing-gateway", requestId: "request-1",
      executionKey: input.executionKey, kind: input.kind, attribution,
      maximumCents: input.maximumCents, billableCents: 20, evidenceReference: "provider:billing:receipt-1",
    };
    const read = vi.fn().mockResolvedValue(receipt);
    const result = await createBudgetedReconciler(store)(actor, command, createProviderEvidenceResolver({ read }));
    expect(read).toHaveBeenCalledWith({ actor, ...command });
    expect(result).toMatchObject({ amountCents: 20, reconciliationReference: receipt.evidenceReference });
  });

  it.each([
    { attribution: "strelva_retry" as const },
    { executionKey: "another-execution" },
    { maximumCents: 101 },
    { kind: "model" as const },
  ])("keeps a receipt with mismatched identity held: %j", async (mismatch) => {
    const store = storage();
    const command = { ...input, attribution: "normal" as const };
    await store.claim(actor, command);
    await store.start(actor, command);
    await store.finish(actor, command, { effect: "accepted", amountCents: null });
    const reconcileReceipt = vi.spyOn(store, "reconcile");
    const settle = vi.fn();
    const read = vi.fn().mockResolvedValue({
      version: 1, provider: "billing-gateway", requestId: "request-1",
      executionKey: input.executionKey, kind: input.kind, attribution: "normal",
      maximumCents: input.maximumCents, billableCents: 20, evidenceReference: "provider:billing:receipt-1",
      ...mismatch,
    });
    await expect(createBudgetedReconciler(store, { reserve: vi.fn(), settle })(actor, command, createProviderEvidenceResolver({ read })))
      .rejects.toBeInstanceOf(ProviderEvidenceMismatchError);
    expect(reconcileReceipt).not.toHaveBeenCalled();
    expect(settle).not.toHaveBeenCalled();
    expect(await store.claim(actor, command)).toMatchObject({ claimed: false, execution: { amountCents: null } });
  });

  it("recovers failed post-receipt settlement by replaying reconciliation only", async () => {
    const store = storage();
    await store.claim(actor, { ...input, attribution: "normal" });
    await store.start(actor, { ...input, attribution: "normal" });
    await store.finish(actor, { ...input, attribution: "normal" }, { effect: "accepted", amountCents: null });
    const resolve = vi.fn().mockResolvedValue({ effect: "accepted", amountCents: 20, evidenceReference: "provider:usage:receipt-2" });
    let settlements = 0;
    const reconcile = createBudgetedReconciler(store, {
      async reserve() {},
      async settle() { if (++settlements === 1) throw new Error("Accounting unavailable"); },
    });
    await expect(reconcile(actor, input, { resolve })).rejects.toThrow("Accounting unavailable");
    await expect(reconcile(actor, input, { resolve })).resolves.toMatchObject({
      amountCents: 20,
      reconciliationReference: "provider:usage:receipt-2",
    });
    expect(settlements).toBe(2);
  });

});
