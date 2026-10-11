import { describe, expect, it } from "vitest";
import { WorkspaceAccessError, WorkspaceConflictError, type WorkspaceActor } from "@/platform/workspaces/types";
import { createInMemoryPossibilityRepository, createPossibility, markReady, recordRehearsal, rehearsePossibility, type AuthorityScope, type Possibility, type PossibilityInput } from "@/platform/possibilities";
import {
  createGovernedWorkApprovalRecords,
  createInMemoryActivationRepository,
  createInMemoryApprovalRecords,
  createInMemoryLiveSystems,
  createIsolatedAdapter,
  createMakeReal,
  describeActivation,
  effectApprovalSubject,
  gatePublish,
  RUNNING_STEP_GRACE_MS,
  type Activation,
  type ActivationRepository,
  type EffectAdapter,
  activationSchema,
} from "@/platform/make-real";
import { customerActivationView } from "@/platform/make-real/view";
import { uuidFromSeed } from "@/platform/business-record/tenant-import";
import { systemOriginId } from "@/platform/systems";
import type { UnifiedEvent } from "@/lib/types";

/*
 * Each test pins one guard in src/platform/make-real/runner.ts: deleting the
 * guard makes the named test fail. All providers are isolated fakes.
 */

const BIZ = uuidFromSeed("business:guards");
const OTHER = uuidFromSeed("business:guards-other");
const owner: WorkspaceActor = { userId: "owner-1", verifiedEmail: "owner@guards.test" };
const stranger: WorkspaceActor = { userId: "stranger", verifiedEmail: "s@guards.test" };
const SYS = { businessId: BIZ, systemId: systemOriginId(BIZ, { kind: "saved_work", ref: "booking-page" }) };

type Wrap = Partial<Pick<EffectAdapter, "perform" | "readBack" | "find">>;

async function setup(opts: { paymentLookup?: boolean; paymentIdempotent?: boolean; wrapCalendar?: (base: EffectAdapter) => Wrap; withoutPublishAdapter?: boolean } = {}) {
  let t = Date.parse("2026-10-05T12:00:00.000Z");
  const clock = () => new Date(t).toISOString();
  const advance = (ms: number) => { t += ms; };
  let n = 0;
  const ids = () => `act-${++n}`;
  const live = createInMemoryLiveSystems();
  const r1 = live.seed(SYS, "Booking page", { headline: "Book a fitting", deposit: 0 });
  const calendarBase = createIsolatedAdapter("calendar");
  const calendar: EffectAdapter = opts.wrapCalendar ? { ...calendarBase, ...opts.wrapCalendar(calendarBase) } : calendarBase;
  const payment = createIsolatedAdapter("payment", { supportsLookup: opts.paymentLookup ?? true, idempotentByKey: opts.paymentIdempotent ?? true });
  const publish = createIsolatedAdapter("publish");
  const adapters = opts.withoutPublishAdapter ? [calendar, payment] : [calendar, payment, publish];
  const revoked = new Set<AuthorityScope>();
  const authorityCalls: string[] = [];
  const failingChecks = new Set<string>();
  const throwingChecks = new Set<string>();
  const possibilities = createInMemoryPossibilityRepository();
  const store = createInMemoryActivationRepository();
  const saves: Activation[] = [];
  const faults: { beforeSave?: (v: Activation) => Promise<void> | void } = {};
  const activations: ActivationRepository = { get: store.get, create: store.create, async save(v, e) { await faults.beforeSave?.(v); await store.save(v, e); saves.push(v); } };
  const approvalRecords = createInMemoryApprovalRecords();
  const makeReal = createMakeReal({
    possibilities, activations, live: live.port, adapters, approvals: approvalRecords, clock, ids,
    authority: {
      async check(actor, input) {
        authorityCalls.push(input.scope);
        if (actor.userId !== owner.userId || input.businessId !== BIZ) return { allowed: false, reason: "No membership in this business." };
        if (revoked.has(input.scope)) return { allowed: false, reason: `${input.scope} was revoked.` };
        return { allowed: true, grantId: `grant-${input.scope}` };
      },
    },
    checks: {
      async run({ checkId }) {
        if (throwingChecks.has(checkId)) throw new Error("Check endpoint unreachable");
        return failingChecks.has(checkId) ? { passed: false, detail: "forced" } : { passed: true, detail: "ok" };
      },
    },
  });
  const input: PossibilityInput = {
    title: "Take deposits for fittings", intent: "Collect a deposit when a fitting is booked.",
    changes: [{ baseline: { ...SYS, revisionId: r1, number: 1 }, candidate: { summary: "Deposit on booking", content: { headline: "Book a fitting", deposit: 2500 } } }],
    effects: [
      { id: "slot", kind: "calendar", system: { systemId: SYS.systemId }, description: "Create the fitting booking type", request: { minutes: 45 } },
      { id: "charge", kind: "payment", system: { systemId: SYS.systemId }, description: "Create a $25 deposit link", request: { amountCents: 2500 } },
      { id: "page", kind: "publish", system: { systemId: SYS.systemId }, description: "Publish the deposit note", request: { section: "contact", data: {} }, publish: { section: "contact", data: {} }, after: ["slot", "charge"] },
    ],
    checks: [{ id: "deposit-live", description: "A booking asks for the deposit" }],
  };
  async function ready(patch: Partial<PossibilityInput> = {}): Promise<Possibility> {
    let p = createPossibility({ ...input, ...patch }, { id: "p1", businessId: BIZ, actorId: owner.userId, at: clock() });
    p = recordRehearsal(p, await rehearsePossibility(p, live.port, [calendar, payment, publish], clock()), p.revision, owner.userId, clock());
    p = await markReady(p, live.port, p.revision, owner.userId, clock());
    await possibilities.create(p);
    return p;
  }
  function approve(p: Possibility, effectId: string, id = `appr-${effectId}`, over: Partial<{ businessId: string; status: "approved" | "pending" | "dismissed"; fingerprint: string; effectId: string }> = {}) {
    const effect = p.effects.find((e) => e.id === effectId)!;
    const subject = { ...effectApprovalSubject(p, effect), ...(over.fingerprint ? { fingerprint: over.fingerprint } : {}), ...(over.effectId ? { effectId: over.effectId } : {}) };
    approvalRecords.record({ id, businessId: over.businessId ?? BIZ, subject, status: over.status ?? "approved", decidedBy: owner.userId, decidedAt: clock() });
    return { effectId, approvalId: id };
  }
  const approveAll = (p: Possibility) => p.effects.filter((e) => gatePublish(e).kind === "needs_approval").map((e) => approve(p, e.id));
  return { faults, clock, advance, live, r1, calendar, calendarBase, payment, publish, revoked, authorityCalls, failingChecks, throwingChecks, possibilities, activations, store, saves, approvalRecords, makeReal, ready, approve, approveAll };
}

type World = Awaited<ReturnType<typeof setup>>;
const stepOf = (a: Activation, id: string) => a.steps.find((s) => s.id === id)!;
async function started(w: World) {
  const p = await w.ready();
  return w.makeReal.start(owner, BIZ, "p1", { approvals: w.approveAll(p) });
}
async function runUntil(w: World, id: string, stepId: string) {
  for (let i = 0; i < 20; i++) if ((await w.makeReal.runNext(owner, BIZ, id)).ran === stepId) return;
  throw new Error(`never ran ${stepId}`);
}

describe("Make real: unknown outside effects block rollback (audit 1)", () => {
  it("rollback with an unknown charge waits for reconciliation instead of reporting nothing remains", async () => {
    const w = await setup({ paymentLookup: false });
    const a = await started(w);
    w.payment.faults.acceptThenThrow = true;
    await w.makeReal.run(owner, BIZ, a.id);
    expect(stepOf(await w.makeReal.get(BIZ, a.id), "effect:charge").status).toBe("unknown");

    const waiting = await w.makeReal.rollback(owner, BIZ, a.id);
    expect(waiting.status).toBe("needs_attention");
    const view = describeActivation(waiting);
    expect(view.needsReconciliation).toBe(true);
    expect(view.headline).not.toMatch(/No outside effect remains/);
    expect(view.headline).toMatch(/1 outside effect\(s\) have an unknown outcome/);
    expect(stepOf(waiting, "effect:slot").status).toBe("compensated");
    expect((await w.live.port.current(SYS))!.revisionId).toBe(w.r1);
    // Still attached: nobody can start again while the charge is unknown.
    expect((await w.possibilities.get(BIZ, "p1"))!.activationId).toBe(a.id);
    await expect(w.makeReal.start(owner, BIZ, "p1")).rejects.toThrow(/already being made real/);
    await expect(w.makeReal.resume(owner, BIZ, a.id)).rejects.toThrow(/Rollback has started/);
    await expect(w.makeReal.approve(owner, BIZ, a.id, "page", "x")).rejects.toThrow(/closed/);

    // Evidence says the charge link exists: rollback can now compensate it and finish.
    const reconciled = await w.makeReal.reconcile(owner, BIZ, a.id, { stepId: "effect:charge", resolution: "completed", evidence: "Dashboard shows isolated-payment-1", providerRef: "isolated-payment-1" });
    expect(reconciled.status).toBe("needs_attention");
    const rolled = await w.makeReal.rollback(owner, BIZ, a.id);
    expect(rolled.status).toBe("rolled_back");
    expect(stepOf(rolled, "effect:charge").status).toBe("compensated");
    expect(w.payment.ledger[0]!.state).toBe("compensated");
    expect(describeActivation(rolled).headline).toBe("Rolled back. No outside effect remains.");
    expect((await w.possibilities.get(BIZ, "p1"))!.activationId).toBeUndefined();
  });

  it("keeps rollback open when a compensable effect could not be undone, then retries it", async () => {
    const w = await setup();
    const a = await started(w);
    w.revoked.add("site.publish");
    await w.makeReal.run(owner, BIZ, a.id);
    const performCalls = w.calendarBase.calls.perform;
    expect(stepOf(await w.makeReal.get(BIZ, a.id), "effect:slot").status).toBe("completed");

    const compensate = w.calendar.compensate!;
    w.calendar.compensate = async () => ({ ok: false, detail: "Temporary provider outage." });
    const waiting = await w.makeReal.rollback(owner, BIZ, a.id);
    expect(waiting.status).toBe("needs_attention");
    expect(waiting.rollbackStartedAt).toBeDefined();
    expect(stepOf(waiting, "effect:slot")).toMatchObject({
      status: "completed", reason: "Compensation failed: Temporary provider outage.",
      compensation: { status: "failed", detail: "Temporary provider outage." },
    });
    expect(describeActivation(waiting).waiting).toContainEqual(expect.objectContaining({
      step: "effect:slot", reason: "Compensation failed: Temporary provider outage.",
    }));
    expect(describeActivation(waiting).done.map((item) => item.step)).not.toContain("effect:slot");
    expect((await w.possibilities.get(BIZ, "p1"))!.activationId).toBe(a.id);

    w.calendar.compensate = compensate;
    const rolled = await w.makeReal.rollback(owner, BIZ, a.id);
    expect(rolled.status).toBe("rolled_back");
    expect(stepOf(rolled, "effect:slot").status).toBe("compensated");
    expect(describeActivation(rolled).cannotUndo).toEqual([]);
    expect(w.calendarBase.calls.perform).toBe(performCalls);
    expect((await w.possibilities.get(BIZ, "p1"))!.activationId).toBeUndefined();
  });

  it("claims compensation before calling a non-idempotent provider and blocks concurrent rollback", async () => {
    const w = await setup();
    const a = await started(w);
    w.revoked.add("site.publish");
    await w.makeReal.run(owner, BIZ, a.id);

    const providerCompensate = w.calendarBase.compensate!;
    let calls = 0;
    let markEntered!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => { markEntered = resolve; });
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    w.calendar.compensate = async (input) => {
      calls += 1;
      markEntered();
      await blocked;
      return providerCompensate(input);
    };

    const firstRollback = w.makeReal.rollback(owner, BIZ, a.id);
    await entered;
    const waiting = await w.makeReal.rollback(owner, BIZ, a.id);
    expect(waiting.status).toBe("needs_attention");
    expect(stepOf(waiting, "effect:slot").compensation).toMatchObject({ status: "running", claimId: expect.any(String) });
    expect(customerActivationView(waiting, "Booking").lines).toContainEqual(expect.objectContaining({ step: "effect:slot", state: "Waiting" }));
    expect(describeActivation(waiting).waiting).toContainEqual(expect.objectContaining({
      step: "effect:slot", reason: "A compensation request is in progress. Wait before retrying.",
    }));
    expect((await w.possibilities.get(BIZ, "p1"))!.activationId).toBe(a.id);
    expect(calls).toBe(1);
    await expect(w.makeReal.reconcile(owner, BIZ, a.id, {
      stepId: "effect:slot", target: "compensation", resolution: "not_applied",
      evidence: "Provider lookup says cancellation is absent.",
    })).rejects.toThrow(/still active or claimed/);

    release();
    const rolled = await firstRollback;
    expect(rolled.status).toBe("rolled_back");
    expect(calls).toBe(1);
    expect(w.calendarBase.calls.compensate).toBe(1);
    expect((await w.possibilities.get(BIZ, "p1"))!.activationId).toBeUndefined();
  });

  it("does not repeat accepted compensation when its result checkpoint is interrupted", async () => {
    const w = await setup();
    const a = await started(w);
    w.revoked.add("site.publish");
    await w.makeReal.run(owner, BIZ, a.id);
    w.faults.beforeSave = (value) => {
      if (value.history.at(-1)?.detail === "effect:slot: compensated") {
        w.faults.beforeSave = undefined;
        throw new Error("process lost after provider accepted compensation");
      }
    };

    await expect(w.makeReal.rollback(owner, BIZ, a.id)).rejects.toThrow(/provider accepted compensation/);
    expect(w.calendarBase.calls.compensate).toBe(1);
    expect(w.calendarBase.ledger.find((entry) => entry.effectId === "slot")!.state).toBe("compensated");
    expect(stepOf(await w.makeReal.get(BIZ, a.id), "effect:slot").compensation).toMatchObject({ status: "running", claimId: expect.any(String) });

    const stillClaimed = await w.makeReal.rollback(owner, BIZ, a.id);
    expect(stepOf(stillClaimed, "effect:slot").compensation?.status).toBe("running");
    expect(w.calendarBase.calls.compensate).toBe(1);

    w.advance(RUNNING_STEP_GRACE_MS + 1);
    const unknown = await w.makeReal.rollback(owner, BIZ, a.id);
    expect(stepOf(unknown, "effect:slot").compensation?.status).toBe("unknown");
    const customer = customerActivationView(unknown, "Booking");
    expect(customer.checking).toBe(true);
    expect(customer.lines).toContainEqual(expect.objectContaining({ step: "effect:slot", state: "Not sure yet" }));
    expect(w.calendarBase.calls.compensate).toBe(1);

    await w.makeReal.reconcile(owner, BIZ, a.id, {
      stepId: "effect:slot", target: "compensation", resolution: "completed",
      evidence: "The provider's cancellation ledger confirms the booking type is removed.",
    });
    const rolled = await w.makeReal.rollback(owner, BIZ, a.id);
    expect(rolled.status).toBe("rolled_back");
    expect(w.calendarBase.calls.compensate).toBe(1);
  });

  it("does not repeat an unknown compensation until evidence says it was not applied", async () => {
    const w = await setup();
    const a = await started(w);
    w.revoked.add("site.publish");
    await w.makeReal.run(owner, BIZ, a.id);
    const performCalls = w.calendarBase.calls.perform;
    const compensate = w.calendar.compensate!;
    let compensationAttempts = 0;
    w.calendar.compensate = async () => {
      compensationAttempts += 1;
      throw new Error("Connection lost after cancellation request.");
    };

    const unknown = await w.makeReal.rollback(owner, BIZ, a.id);
    expect(unknown.status).toBe("needs_attention");
    expect(stepOf(unknown, "effect:slot")).toMatchObject({
      status: "completed", effect: "accepted",
      compensation: { status: "unknown", detail: "Connection lost after cancellation request." },
    });
    expect(describeActivation(unknown).unknown).toContainEqual(expect.objectContaining({
      step: "compensation:effect:slot", label: "Undo: Create the fitting booking type",
    }));
    expect((await w.possibilities.get(BIZ, "p1"))!.activationId).toBe(a.id);

    await w.makeReal.rollback(owner, BIZ, a.id);
    expect(compensationAttempts).toBe(1);
    expect(w.calendarBase.calls.perform).toBe(performCalls);

    await w.makeReal.reconcile(owner, BIZ, a.id, {
      stepId: "effect:slot", target: "compensation", resolution: "not_applied",
      evidence: "Provider lookup confirms no cancellation was created.",
    });
    w.calendar.compensate = compensate;
    const rolled = await w.makeReal.rollback(owner, BIZ, a.id);
    expect(rolled.status).toBe("rolled_back");
    expect(stepOf(rolled, "effect:slot").status).toBe("compensated");
    expect(compensationAttempts).toBe(1);
    expect(w.calendarBase.calls.compensate).toBe(1);
    expect(w.calendarBase.calls.perform).toBe(performCalls);
  });

  it("rechecks each effect's current authority before undo and keeps revoked undo open", async () => {
    const w = await setup();
    const a = await started(w);
    w.revoked.add("site.publish");
    await w.makeReal.run(owner, BIZ, a.id);
    w.revoked.add("calendar.write");
    const waiting = await w.makeReal.rollback(owner, BIZ, a.id);
    expect(waiting.status).toBe("needs_attention");
    expect(w.calendarBase.calls.compensate).toBe(0);
    expect(stepOf(waiting, "effect:slot").compensation).toMatchObject({ status: "unavailable" });
    expect((await w.possibilities.get(BIZ, "p1"))?.activationId).toBe(a.id);
    w.revoked.delete("calendar.write");
    expect((await w.makeReal.rollback(owner, BIZ, a.id)).status).toBe("rolled_back");
    expect(w.calendarBase.calls.compensate).toBe(1);
  });

  it.each(["missing adapter compensation", "missing provider reference"] as const)("reports %s as not undone", async (missing) => {
    const w = await setup();
    const a = await started(w);
    w.revoked.add("site.publish");
    await w.makeReal.run(owner, BIZ, a.id);

    if (missing === "missing adapter compensation") {
      delete w.calendar.compensate;
    } else {
      const current = await w.makeReal.get(BIZ, a.id);
      const slot = stepOf(current, "effect:slot");
      const receipt = { ...slot.receipt! };
      delete receipt.providerRef;
      slot.receipt = receipt;
      const next: Activation = {
        ...current,
        revision: current.revision + 1,
        history: [...current.history, { revision: current.revision + 1, kind: "fixture", actorId: owner.userId, at: w.clock() }],
      };
      await w.activations.save(activationSchema.parse(next), current.revision);
    }

    const rolled = await w.makeReal.rollback(owner, BIZ, a.id);
    expect(rolled.status).toBe("needs_attention");
    expect(stepOf(rolled, "effect:slot")).toMatchObject({
      status: "completed", effect: "accepted", compensation: { status: "unavailable" },
    });
    expect(describeActivation(rolled).cannotUndo).toContain("Create the fitting booking type");

    // Old rows have no typed outcome; their original reason still renders honestly.
    const legacy = structuredClone(rolled);
    for (const step of legacy.steps) delete step.compensation;
    expect(describeActivation(activationSchema.parse(legacy)).cannotUndo).toContain("Create the fitting booking type");

    const legacyFailure = structuredClone(legacy);
    stepOf(legacyFailure, "effect:slot").reason = "Compensation failed: The older adapter rejected cancellation.";
    const legacyView = describeActivation(activationSchema.parse(legacyFailure));
    expect(legacyView.waiting).toContainEqual(expect.objectContaining({ step: "effect:slot" }));
    expect(legacyView.done.map((item) => item.step)).not.toContain("effect:slot");
    expect(legacyView.cannotUndo).not.toContain("Create the fitting booking type");
  });

  it("restart after rollback reuses the key of a charge whose outcome was never settled, and a fresh key for undone steps", async () => {
    const w = await setup({ paymentLookup: false, paymentIdempotent: true });
    const a = await started(w);
    w.payment.faults.acceptThenThrow = true;
    await w.makeReal.run(owner, BIZ, a.id);
    // Wrong evidence: the provider actually accepted it.
    await w.makeReal.reconcile(owner, BIZ, a.id, { stepId: "effect:charge", resolution: "not_applied", evidence: "Dashboard looked empty" });
    const rolled = await w.makeReal.rollback(owner, BIZ, a.id);
    expect(rolled.status).toBe("rolled_back");

    const p = (await w.possibilities.get(BIZ, "p1"))!;
    // The slot approval was consumed by an accepted write and is never reusable.
    await expect(w.makeReal.start(owner, BIZ, "p1", { approvals: [{ effectId: "slot", approvalId: "appr-slot" }, { effectId: "charge", approvalId: "appr-charge" }] })).rejects.toThrow(/appr-slot was already used/);
    const b = await w.makeReal.start(owner, BIZ, "p1", { approvals: [w.approve(p, "slot", "appr-slot-2"), { effectId: "charge", approvalId: "appr-charge" }] });
    expect(b.id).not.toBe(a.id);
    expect(stepOf(b, "effect:charge").idempotencyKey).toBe(stepOf(rolled, "effect:charge").idempotencyKey);
    expect(stepOf(b, "effect:slot").idempotencyKey).not.toBe(stepOf(rolled, "effect:slot").idempotencyKey);
    const done = await w.makeReal.run(owner, BIZ, b.id);
    expect(done.status).toBe("made_real");
    // The provider deduped on the reused key: one charge link, not two.
    expect(w.payment.ledger).toHaveLength(1);
    expect(w.calendarBase.ledger.filter((e) => e.state === "accepted")).toHaveLength(1);
  });

  it("idempotency keys are a pure function of business, possibility, candidate pin and step", async () => {
    const w = await setup();
    const a = await started(w);
    expect(a.steps.every((s) => s.idempotencyKey.startsWith(`mr:${s.id.slice(0, 80)}:`) && !s.idempotencyKey.includes(a.id))).toBe(true);
    expect(new Set(a.steps.map((s) => s.idempotencyKey)).size).toBe(a.steps.length);
  });

  it("reconcile requires current authority", async () => {
    const w = await setup({ paymentLookup: false });
    const a = await started(w);
    w.payment.faults.acceptThenThrow = true;
    await w.makeReal.run(owner, BIZ, a.id);
    const evidence = { stepId: "effect:charge", resolution: "completed" as const, evidence: "trust me", providerRef: "isolated-payment-1" };
    await expect(w.makeReal.reconcile(stranger, BIZ, a.id, evidence)).rejects.toBeInstanceOf(WorkspaceAccessError);
    w.revoked.add("payment.create");
    await expect(w.makeReal.reconcile(owner, BIZ, a.id, evidence)).rejects.toBeInstanceOf(WorkspaceAccessError);
    expect(stepOf(await w.makeReal.get(BIZ, a.id), "effect:charge").status).toBe("unknown");
    w.revoked.delete("payment.create");
    expect(stepOf(await w.makeReal.reconcile(owner, BIZ, a.id, evidence), "effect:charge").status).toBe("completed");
  });

  it("reconcile needs evidence and never declares an accepted write absent", async () => {
    const w = await setup({ paymentLookup: false });
    const a = await started(w);
    w.payment.faults.acceptThenThrow = true;
    await w.makeReal.run(owner, BIZ, a.id);
    await expect(w.makeReal.reconcile(owner, BIZ, a.id, { stepId: "effect:charge", resolution: "completed", evidence: "  " })).rejects.toBeInstanceOf(WorkspaceConflictError);
    await expect(w.makeReal.reconcile(owner, BIZ, a.id, { stepId: "effect:slot", resolution: "not_applied", evidence: "It is fine" })).rejects.toThrow(/unknown step/);
  });
});

describe("Make real: approvals are records, not strings (audit 1)", () => {
  it("refuses an approval id with no record, another business's record, a dismissed one, another effect's, or one for different content", async () => {
    const w = await setup();
    const p = await w.ready();
    const base = w.approveAll(p).filter((x) => x.effectId !== "charge");
    const attempt = (charge: { effectId: string; approvalId: string }) => w.makeReal.start(owner, BIZ, "p1", { approvals: [...base, charge] });
    await expect(attempt({ effectId: "charge", approvalId: "made-up" })).rejects.toThrow(/charge: approval refused \(no approval record/);
    await expect(attempt(w.approve(p, "charge", "a-other-biz", { businessId: OTHER }))).rejects.toThrow(/no approval record/);
    await expect(attempt(w.approve(p, "charge", "a-dismissed", { status: "dismissed" }))).rejects.toThrow(/approval is dismissed/);
    await expect(attempt(w.approve(p, "charge", "a-pending", { status: "pending" }))).rejects.toThrow(/approval is pending/);
    await expect(attempt(w.approve(p, "charge", "a-wrong-effect", { effectId: "slot" }))).rejects.toThrow(/different effect/);
    await expect(attempt(w.approve(p, "charge", "a-wrong-content", { fingerprint: "0".repeat(64) }))).rejects.toThrow(/different content/);
    await expect(w.makeReal.start(owner, BIZ, "p1", { approvals: [...w.approveAll(p), { effectId: "nope", approvalId: "appr-slot" }] })).rejects.toThrow(/nope: not an effect/);
    expect(w.payment.calls.perform).toBe(0);
    const ok = await attempt(w.approve(p, "charge"));
    expect(ok.approvals.find((x) => x.effectId === "charge")).toMatchObject({ approvalId: "appr-charge", approvedBy: owner.userId });
  });

  it("a dismissal after start blocks the effect before the provider is called", async () => {
    const w = await setup();
    const a = await started(w);
    w.approvalRecords.setStatus("appr-charge", "dismissed");
    const result = await w.makeReal.run(owner, BIZ, a.id);
    expect(stepOf(result, "effect:charge")).toMatchObject({ status: "blocked", reason: expect.stringMatching(/approval is dismissed/) });
    expect(w.payment.calls.perform).toBe(0);
  });

  it("approve() resolves the record, checks the effect's own authority, and refuses unknown ids", async () => {
    const w = await setup();
    const p = await w.ready();
    const a = await w.makeReal.start(owner, BIZ, "p1", { approvals: w.approveAll(p) });
    await expect(w.makeReal.approve(owner, BIZ, a.id, "charge", "made-up")).rejects.toThrow(/cannot be used: no approval record/);
    await expect(w.makeReal.approve(owner, BIZ, a.id, "missing", "appr-charge")).rejects.toThrow(/not part of this activation/);
    w.revoked.add("payment.create");
    await expect(w.makeReal.approve(owner, BIZ, a.id, "charge", w.approve(p, "charge", "appr-charge-2").approvalId)).rejects.toBeInstanceOf(WorkspaceAccessError);
    await expect(w.makeReal.approve(stranger, BIZ, a.id, "charge", "appr-charge-2")).rejects.toBeInstanceOf(WorkspaceAccessError);
    w.revoked.delete("payment.create");
    const next = await w.makeReal.approve(owner, BIZ, a.id, "charge", "appr-charge-2");
    expect(next.approvals.at(-1)).toMatchObject({ approvalId: "appr-charge-2", approvedBy: owner.userId });
  });

  it("governance judges the request that is sent, not only the declared publish data", async () => {
    const w = await setup();
    const p = await w.ready({ effects: [{ id: "page", kind: "publish", system: { systemId: SYS.systemId }, description: "Publish", request: { section: "contact", data: { price: "$25" } }, publish: { section: "contact", data: {} }, after: [] }] });
    await expect(w.makeReal.start(owner, BIZ, "p1")).rejects.toThrow(/page: needs approval \(High-risk business details/);
    expect(gatePublish(p.effects[0]!).kind).toBe("needs_approval");
  });

  it("calendar, payment and message effects always need a recorded approval", async () => {
    const w = await setup();
    await w.ready();
    await expect(w.makeReal.start(owner, BIZ, "p1")).rejects.toThrow(/slot: needs approval \(A calendar write is a Google write.*charge: needs approval \(A payment change/);
    expect(gatePublish({ id: "m", kind: "message", system: { systemId: SYS.systemId }, description: "d", request: {}, after: [] }).kind).toBe("needs_approval");
  });

  it("reads approvals from the governed-work queue, treating auto-approval as pending and checking the owning business", async () => {
    const w = await setup();
    const p = await w.ready();
    const subject = effectApprovalSubject(p, p.effects[1]!);
    const events: Record<string, UnifiedEvent> = {
      e1: { id: "e1", tenantId: "t-biz", source: "ai", type: "content_update", title: "Deposit link", body: "", status: "approved", createdAt: w.clock(), resolvedAt: w.clock(), metadata: { makeRealEffect: subject, execution: { state: "completed", action: "approved", actor: "owner-1", attemptId: "x", startedAt: w.clock() } } },
      e2: { id: "e2", tenantId: "t-biz", source: "ai", type: "content_update", title: "", body: "", status: "auto_approved", createdAt: w.clock(), metadata: { makeRealEffect: subject } },
      e3: { id: "e3", tenantId: "t-other", source: "ai", type: "content_update", title: "", body: "", status: "approved", createdAt: w.clock(), metadata: { makeRealEffect: subject } },
    };
    const store = createGovernedWorkApprovalRecords({ readEvent: async (id) => events[id] ?? null, businessForTenant: async (t) => (t === "t-biz" ? BIZ : OTHER) });
    expect(await store.get(BIZ, "e1")).toMatchObject({ status: "approved", decidedBy: "owner-1", subject });
    expect((await store.get(BIZ, "e2"))!.status).toBe("pending");
    expect(await store.get(BIZ, "e3")).toBeNull();
    expect(await store.get(BIZ, "missing")).toBeNull();
  });
});

describe("Make real: runner guards (audit 2)", () => {
  it("start: only a ready possibility, not already attached, with current system.activate authority", async () => {
    const w = await setup();
    const p = await w.ready();
    w.revoked.add("system.activate");
    await expect(w.makeReal.start(owner, BIZ, "p1", { approvals: w.approveAll(p) })).rejects.toThrow(/cannot make this real/);
    await expect(w.makeReal.start(stranger, BIZ, "p1", { approvals: w.approveAll(p) })).rejects.toBeInstanceOf(WorkspaceAccessError);
    w.revoked.delete("system.activate");
    await w.makeReal.start(owner, BIZ, "p1", { approvals: w.approveAll(p) });
    await expect(w.makeReal.start(owner, BIZ, "p1", { approvals: w.approveAll(p) })).rejects.toThrow(/already being made real/);
  });

  it("start: preflights each effect's authority and adapter before anything is written", async () => {
    const w = await setup({ withoutPublishAdapter: true });
    const p = await w.ready();
    w.revoked.add("payment.create");
    await expect(w.makeReal.start(owner, BIZ, "p1", { approvals: w.approveAll(p) })).rejects.toThrow(/charge: payment.create was revoked.*page: no publish connection/);
    expect(w.saves).toHaveLength(0);
    expect((await w.possibilities.get(BIZ, "p1"))!.activationId).toBeUndefined();
  });

  it("start: a moved baseline sends the possibility back to Exploring", async () => {
    const w = await setup();
    const p = await w.ready();
    w.live.edit(SYS, { headline: "Owner edit" });
    await expect(w.makeReal.start(owner, BIZ, "p1", { approvals: w.approveAll(p) })).rejects.toThrow(/changed since this was rehearsed/);
    expect((await w.possibilities.get(BIZ, "p1"))!.status).toBe("exploring");
  });

  it("start: a governance-blocked publish never starts", async () => {
    const w = await setup();
    await w.ready({ effects: [{ id: "nav", kind: "publish", system: { systemId: SYS.systemId }, description: "Rewrite navigation", request: {}, publish: { section: "navigation", data: {} }, after: [] }] });
    await expect(w.makeReal.start(owner, BIZ, "p1")).rejects.toThrow(/nav: Structural design/);
  });

  it("authority is rechecked before every step: revoking system.activate mid-run blocks the switch and leaves live unchanged", async () => {
    const w = await setup();
    const a = await started(w);
    await runUntil(w, a.id, "effect:page");
    w.revoked.add("system.activate");
    const result = await w.makeReal.run(owner, BIZ, a.id);
    expect(stepOf(result, `activate:${SYS.systemId}`)).toMatchObject({ status: "blocked", reason: expect.stringMatching(/system.activate was revoked/) });
    expect((await w.live.port.current(SYS))!.revisionId).toBe(w.r1);
    expect(w.live.writes.activate).toBe(0);
  });

  it("authority is rechecked before every effect step, not cached from start", async () => {
    const w = await setup();
    const a = await started(w);
    w.revoked.add("calendar.write");
    const result = await w.makeReal.run(owner, BIZ, a.id);
    expect(stepOf(result, "effect:slot")).toMatchObject({ status: "blocked", reason: expect.stringMatching(/calendar.write was revoked/) });
    expect(w.calendarBase.calls.perform).toBe(0);
  });

  it("a provider rejection is a safe failure that resume retries, up to the retry limit", async () => {
    const w = await setup();
    const a = await started(w);
    w.payment.faults.rejectNext = "Card network down";
    const first = await w.makeReal.run(owner, BIZ, a.id);
    expect(stepOf(first, "effect:charge")).toMatchObject({ status: "failed", effect: "none", reason: "Card network down" });
    expect(first.status).toBe("needs_attention");
    w.payment.faults.rejectNext = "again";
    await w.makeReal.resume(owner, BIZ, a.id);
    w.payment.faults.rejectNext = "and again";
    const third = await w.makeReal.resume(owner, BIZ, a.id);
    expect(stepOf(third, "effect:charge").attempts).toBe(3);
    const limited = await w.makeReal.resume(owner, BIZ, a.id);
    expect(stepOf(limited, "effect:charge").status).toBe("failed");
    expect(w.payment.calls.perform).toBe(3);
    expect(limited.history.at(-1)!.detail).toMatch(/effect:charge: retry limit/);
  });

  it("an accepted write with a failed read-back is final: resume never performs it again", async () => {
    const w = await setup();
    const a = await started(w);
    w.payment.faults.failReadBack = true;
    w.failingChecks.add("deposit-live");
    const result = await w.makeReal.run(owner, BIZ, a.id);
    expect(stepOf(result, "effect:charge")).toMatchObject({ status: "completed", effect: "accepted", readBack: { status: "failed" } });
    expect(result.approvals.find((x) => x.effectId === "charge")!.consumedAt).toBeDefined();
    w.failingChecks.delete("deposit-live");
    await w.makeReal.resume(owner, BIZ, a.id);
    expect(w.payment.calls.perform).toBe(1);
  });

  it("a thrown effect is unknown and resume never replays it when the provider cannot be asked", async () => {
    const w = await setup({ paymentLookup: false });
    const a = await started(w);
    w.payment.faults.throwOnPerform = true;
    const result = await w.makeReal.run(owner, BIZ, a.id);
    expect(stepOf(result, "effect:charge")).toMatchObject({ status: "unknown", effect: "unknown" });
    w.payment.faults.throwOnPerform = false;
    expect((await w.makeReal.resume(owner, BIZ, a.id)).status).toBe("needs_attention");
    expect(w.payment.calls.perform).toBe(1);
  });

  it("never marks made real until every operating check passes; a check that throws is a failure", async () => {
    const w = await setup();
    const a = await started(w);
    w.throwingChecks.add("deposit-live");
    const result = await w.makeReal.run(owner, BIZ, a.id);
    expect(result.status).toBe("needs_attention");
    expect(stepOf(result, "verify")).toMatchObject({ status: "failed", reason: expect.stringMatching(/deposit-live/) });
    expect(result.checks[0]).toMatchObject({ status: "failed", detail: "Check endpoint unreachable" });
    expect((await w.possibilities.get(BIZ, "p1"))!.status).toBe("ready");
    w.throwingChecks.delete("deposit-live");
    const done = await w.makeReal.resume(owner, BIZ, a.id);
    expect(done.status).toBe("made_real");
    expect(done.checks.every((c) => c.status === "passed")).toBe(true);
    expect((await w.possibilities.get(BIZ, "p1"))!.status).toBe("made_real");
  });

  it("partial state is reported per step, and a closed activation cannot resume, approve or roll back", async () => {
    const w = await setup();
    const a = await started(w);
    const done = await w.makeReal.run(owner, BIZ, a.id);
    expect(done.status).toBe("made_real");
    await expect(w.makeReal.resume(owner, BIZ, a.id)).rejects.toThrow(/closed/);
    await expect(w.makeReal.approve(owner, BIZ, a.id, "charge", "appr-charge")).rejects.toThrow(/closed/);
    await expect(w.makeReal.rollback(owner, BIZ, a.id)).rejects.toThrow(/already real/);
    expect((await w.makeReal.runNext(owner, BIZ, a.id)).ran).toBeNull();
  });

  it("runNext refuses while a step is running, and resume waits out the grace period", async () => {
    const w = await setup();
    const a = await started(w);
    const live = await w.store.get(BIZ, a.id);
    stepOf(live!, `stage:${SYS.systemId}`).status = "running";
    stepOf(live!, `stage:${SYS.systemId}`).startedAt = w.clock();
    await w.store.save({ ...live!, revision: live!.revision + 1 }, live!.revision);
    await expect(w.makeReal.runNext(owner, BIZ, a.id)).rejects.toThrow(/already running/);
    await expect(w.makeReal.rollback(owner, BIZ, a.id)).rejects.toThrow(/still running/);
    await expect(w.makeReal.resume(owner, BIZ, a.id)).rejects.toThrow(/may still be running/);
    w.advance(RUNNING_STEP_GRACE_MS + 1);
    expect((await w.makeReal.resume(owner, BIZ, a.id)).status).toBe("made_real");
  });

  it("an interrupted effect the provider confirms by key is recorded as accepted, not repeated", async () => {
    const w = await setup();
    const a = await started(w);
    const live = await w.store.get(BIZ, a.id);
    const charge = stepOf(live!, "effect:charge");
    await w.payment.perform({ businessId: BIZ, effect: (await w.possibilities.get(BIZ, "p1"))!.effects[1]!, idempotencyKey: charge.idempotencyKey });
    Object.assign(charge, { status: "running", startedAt: w.clock(), attempts: 1 });
    await w.store.save({ ...live!, revision: live!.revision + 1 }, live!.revision);
    w.advance(RUNNING_STEP_GRACE_MS + 1);
    const done = await w.makeReal.resume(owner, BIZ, a.id);
    expect(stepOf(done, "effect:charge").receipt).toMatchObject({ reconciledBy: "provider_lookup" });
    expect(w.payment.ledger).toHaveLength(1);
    expect(w.payment.calls.perform).toBe(1);
  });

  it("an interrupted effect with no record at a non-deduping provider becomes unknown, not a retry", async () => {
    const w = await setup({ paymentIdempotent: false });
    const a = await started(w);
    const live = await w.store.get(BIZ, a.id);
    Object.assign(stepOf(live!, "effect:charge"), { status: "running", startedAt: w.clock(), attempts: 1 });
    await w.store.save({ ...live!, revision: live!.revision + 1 }, live!.revision);
    w.advance(RUNNING_STEP_GRACE_MS + 1);
    const result = await w.makeReal.resume(owner, BIZ, a.id);
    expect(stepOf(result, "effect:charge").status).toBe("unknown");
    expect(w.payment.calls.perform).toBe(0);
  });

  it("a worker that lost its lease cannot record an outcome over the new owner's state", async () => {
    let hijack: (() => Promise<void>) | null = null;
    const w = await setup({ wrapCalendar: (base) => ({ perform: async (i) => { await hijack?.(); return base.perform(i); } }) });
    const a = await started(w);
    hijack = async () => {
      hijack = null;
      const cur = (await w.store.get(BIZ, a.id))!;
      stepOf(cur, "effect:slot").leaseId = "someone-else";
      await w.store.save({ ...cur, revision: cur.revision + 1 }, cur.revision);
    };
    await expect(w.makeReal.run(owner, BIZ, a.id)).rejects.toThrow(/no longer owns the step/);
    expect(stepOf((await w.store.get(BIZ, a.id))!, "effect:slot")).toMatchObject({ status: "running", leaseId: "someone-else" });
  });

  it("a concurrent change during a step is preserved: the outcome retries its compare-and-set instead of overwriting", async () => {
    let concurrent: (() => Promise<void>) | null = null;
    const w = await setup({ wrapCalendar: (base) => ({ perform: async (i) => { await concurrent?.(); return base.perform(i); } }) });
    const p = await w.ready();
    const a = await w.makeReal.start(owner, BIZ, "p1", { approvals: w.approveAll(p) });
    concurrent = async () => { concurrent = null; await w.makeReal.approve(owner, BIZ, a.id, "charge", w.approve(p, "charge", "appr-charge-2").approvalId); };
    await w.makeReal.runNext(owner, BIZ, a.id); // stage
    const r = await w.makeReal.runNext(owner, BIZ, a.id); // slot
    expect(r.ran).toBe("effect:slot");
    const kinds = r.activation.history.map((h) => h.kind);
    expect(kinds.slice(-3)).toEqual(["started", "approve", "outcome"]);
    expect(r.activation.approvals.some((x) => x.approvalId === "appr-charge-2")).toBe(true);
  });

  it("an orphaned activation (its possibility no longer points at it) never runs", async () => {
    const w = await setup();
    const a = await started(w);
    const p = (await w.possibilities.get(BIZ, "p1"))!;
    await w.possibilities.save({ ...p, activationId: "something-else", revision: p.revision + 1 }, p.revision);
    await expect(w.makeReal.runNext(owner, BIZ, a.id)).rejects.toThrow(/no longer belongs/);
    expect(w.live.writes.stage).toBe(0);
  });

  it("rollback requires current authority and is invisible across businesses", async () => {
    const w = await setup();
    const a = await started(w);
    w.revoked.add("system.activate");
    await expect(w.makeReal.rollback(owner, BIZ, a.id)).rejects.toBeInstanceOf(WorkspaceAccessError);
    await expect(w.makeReal.rollback(stranger, BIZ, a.id)).rejects.toBeInstanceOf(WorkspaceAccessError);
    await expect(w.makeReal.get(OTHER, a.id)).rejects.toBeInstanceOf(WorkspaceAccessError);
    expect((await w.store.get(BIZ, a.id))!.rollbackStartedAt).toBeUndefined();
  });

  it("rollback restores the live pointer only from the staged revision and checkpoints each undone step", async () => {
    const w = await setup();
    const a = await started(w);
    w.failingChecks.add("deposit-live");
    const failed = await w.makeReal.run(owner, BIZ, a.id);
    expect((await w.live.port.current(SYS))!.revisionId).not.toBe(w.r1);
    const before = w.saves.length;
    const rolled = await w.makeReal.rollback(owner, BIZ, a.id);
    expect((await w.live.port.current(SYS))!.revisionId).toBe(w.r1);
    expect(rolled.history.filter((h) => h.kind === "rollback_step").length).toBeGreaterThanOrEqual(4);
    expect(w.saves.length - before).toBeGreaterThanOrEqual(5);
    expect(failed.steps.filter((s) => s.status === "completed").every((s) => ["restored", "compensated"].includes(stepOf(rolled, s.id).status))).toBe(true);
  });

  it("an outcome save that loses a compare-and-set race reloads and keeps the concurrent change", async () => {
    const w = await setup();
    const a = await started(w);
    let injected = false;
    w.faults.beforeSave = async (v) => {
      if (injected || v.history.at(-1)?.kind !== "outcome") return;
      injected = true;
      const cur = (await w.store.get(BIZ, a.id))!;
      cur.history.push({ revision: cur.revision + 1, kind: "operator_note", actorId: "ops", at: w.clock() });
      await w.store.save({ ...cur, revision: cur.revision + 1 }, cur.revision);
    };
    const r = await w.makeReal.runNext(owner, BIZ, a.id);
    expect(r.ran).toBe(`stage:${SYS.systemId}`);
    expect(r.activation.history.map((h) => h.kind).slice(-3)).toEqual(["started", "operator_note", "outcome"]);
    expect(stepOf(r.activation, `stage:${SYS.systemId}`).status).toBe("completed");
  });

  it("governance is re-applied right before a publish effect, even if the stored effect changed after start", async () => {
    const w = await setup();
    const a = await started(w);
    const p = (await w.possibilities.get(BIZ, "p1"))!;
    p.effects[2] = { ...p.effects[2]!, publish: { section: "navigation", data: {} } };
    await w.possibilities.save({ ...p, revision: p.revision + 1 }, p.revision);
    const result = await w.makeReal.run(owner, BIZ, a.id);
    expect(stepOf(result, "effect:page")).toMatchObject({ status: "failed", reason: expect.stringMatching(/Structural design/) });
    expect(w.publish.calls.perform).toBe(0);
  });

  it("an effect that needs approval is blocked when the activation holds no unconsumed approval for it", async () => {
    const w = await setup();
    const a = await started(w);
    const cur = (await w.store.get(BIZ, a.id))!;
    await w.store.save({ ...cur, approvals: cur.approvals.filter((x) => x.effectId !== "slot"), revision: cur.revision + 1 }, cur.revision);
    const result = await w.makeReal.run(owner, BIZ, a.id);
    expect(stepOf(result, "effect:slot")).toMatchObject({ status: "blocked", reason: expect.stringMatching(/^Needs approval: A calendar write/) });
    expect(w.calendarBase.calls.perform).toBe(0);
  });

  it("approve() refuses an approval already consumed by an accepted write", async () => {
    const w = await setup();
    const a = await started(w);
    w.failingChecks.add("deposit-live");
    const result = await w.makeReal.run(owner, BIZ, a.id);
    expect(result.approvals.find((x) => x.approvalId === "appr-charge")!.consumedAt).toBeDefined();
    await expect(w.makeReal.approve(owner, BIZ, a.id, "charge", "appr-charge")).rejects.toThrow(/already used/);
  });

  it("an interrupted rollback resumes without repeating the live pointer restore", async () => {
    const w = await setup();
    const a = await started(w);
    w.failingChecks.add("deposit-live");
    await w.makeReal.run(owner, BIZ, a.id);
    w.faults.beforeSave = (v) => {
      if (v.history.at(-1)?.detail === `activate:${SYS.systemId}: restored`) { w.faults.beforeSave = undefined; throw new Error("process lost"); }
    };
    await expect(w.makeReal.rollback(owner, BIZ, a.id)).rejects.toThrow(/process lost/);
    expect((await w.live.port.current(SYS))!.revisionId).toBe(w.r1);
    const rolled = await w.makeReal.rollback(owner, BIZ, a.id);
    expect(rolled.status).toBe("rolled_back");
    expect(w.live.writes.restore).toBe(1);
    expect((await w.live.port.current(SYS))!.revisionId).toBe(w.r1);
  });
});
