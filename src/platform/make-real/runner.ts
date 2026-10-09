import { assertExtendedProviderReference } from "./google-provider-reference";
import { randomUUID } from "node:crypto";
import { WorkspaceAccessError, WorkspaceConflictError, type WorkspaceActor } from "@/platform/workspaces/types";
import { EFFECT_SCOPE, type DeclaredEffect, type Possibility, type SystemTarget } from "@/platform/possibilities/contracts";
import { attachActivation, detachActivation, markMadeReal, returnToExploring, staleBaselines } from "@/platform/possibilities/engine";
import type { PossibilityRepository } from "@/platform/possibilities/repository";
import { activationSchema, type Activation, type ActivationStep } from "./contracts";
import { approvalProblem, planApprovalProblem, type ApprovalRecordsPort } from "./approvals";
import { gatePublish } from "./governance";
import { initialChecks, planActivation } from "./plan";
import { BaselineMovedError, selectAdapter, type AuthorityPort, type EffectAdapter, type LiveSystemsPort, type OperatingChecksPort } from "./ports";
import type { ActivationRepository } from "./repository";

/** A worker that claimed this step or compensation recently may still be active. */
export const RUNNING_STEP_GRACE_MS = 120_000;
const MAX_ATTEMPTS = 3;

type Outcome = Pick<ActivationStep, "status" | "effect"> & Partial<Pick<ActivationStep, "reason" | "receipt" | "readBack">> & {
  apply?: (activation: Activation) => void;
};

export interface MakeRealDeps {
  possibilities: PossibilityRepository;
  activations: ActivationRepository;
  live: LiveSystemsPort;
  authority: AuthorityPort;
  adapters: readonly EffectAdapter[];
  checks: OperatingChecksPort;
  /** The approval store. Approval ids are only trusted once resolved here. */
  approvals: ApprovalRecordsPort;
  /** Live Make real: every effect runs only under the owner's recorded plan
   * approval, re-read before each step (spec section 3, behaviors 21-22). */
  requirePlanApproval?: boolean;
  clock?: () => string;
  ids?: () => string;
}

function conflict(message: string): never {
  throw new WorkspaceConflictError(message);
}

/** Returns the next revision as a copy, so callers can still CAS on the old one. */
function record(previous: Activation, kind: string, actorId: string, at: string, detail?: string): Activation {
  const a = structuredClone(previous);
  a.revision += 1;
  a.updatedAt = at;
  a.history.push({ revision: a.revision, kind, actorId, at, ...(detail ? { detail: detail.slice(0, 1000) } : {}) });
  return activationSchema.parse(a);
}

function deriveStatus(a: Activation): Activation["status"] {
  if (a.status === "rolled_back") return "rolled_back";
  // Once rollback starts, forward progress is over until it finishes.
  if (a.rollbackStartedAt) return "needs_attention";
  if (a.status === "made_real") return "made_real";
  if (a.steps.every((s) => s.status === "completed") && a.checks.every((c) => c.status === "passed")) return "made_real";
  if (a.steps.some((s) => ["blocked", "failed", "unknown"].includes(s.status))) return "needs_attention";
  return "in_progress";
}

function runnable(a: Activation): ActivationStep | undefined {
  return a.steps.find((s) => s.status === "pending" && s.dependsOn.every((id) => a.steps.find((d) => d.id === id)?.status === "completed"));
}

function introducedKey(target: string): string | null {
  return target.startsWith("introduced:") ? target.slice("introduced:".length) : null;
}

/** Activation rows predate the typed compensation outcome and only kept this
 * detail in `reason`. Read those rows without making prose the current state. */
function legacyCompensationFailed(step: ActivationStep): boolean {
  return step.compensation === undefined && step.reason?.startsWith("Compensation failed:") === true;
}

function compensationFailed(step: ActivationStep): boolean {
  return step.compensation?.status === "failed" || legacyCompensationFailed(step);
}

function compensationUnknown(step: ActivationStep): boolean {
  return step.compensation?.status === "unknown";
}

function compensationRunning(step: ActivationStep): boolean {
  return step.compensation?.status === "running";
}

export function createMakeReal(deps: MakeRealDeps) {
  const now = deps.clock ?? (() => new Date().toISOString());
  const newId = deps.ids ?? randomUUID;
  const activeCompensationClaims = new Set<string>();

  function compensationClaimKey(businessId: string, activationId: string, stepId: string, claimId: string): string {
    return `${businessId}\u0000${activationId}\u0000${stepId}\u0000${claimId}`;
  }

  function compensationClaimActive(a: Activation, step: ActivationStep): boolean {
    const claimId = step.compensation?.claimId;
    return Boolean(claimId && activeCompensationClaims.has(compensationClaimKey(a.businessId, a.id, step.id, claimId)));
  }

  async function load(businessId: string, id: string): Promise<Activation> {
    const a = await deps.activations.get(businessId, id);
    if (!a) throw new WorkspaceAccessError();
    return a;
  }

  async function loadPossibility(businessId: string, id: string): Promise<Possibility> {
    const p = await deps.possibilities.get(businessId, id);
    if (!p) throw new WorkspaceAccessError();
    return p;
  }

  function adapterFor(effect: Pick<DeclaredEffect, "kind" | "channel">): EffectAdapter {
    const adapter = selectAdapter(deps.adapters, effect);
    if (!adapter) conflict(`No ${effect.channel ?? effect.kind} connection is available for this business.`);
    return adapter;
  }

  function resolveTarget(a: Activation, target: SystemTarget): string {
    if ("systemId" in target) return target.systemId;
    const intro = a.introduced.find((i) => i.key === target.introducedKey);
    if (!intro?.systemId) conflict(`${target.introducedKey} has not been created yet.`);
    return intro.systemId;
  }

  /** Save an outcome for the step this worker leased. Retries on CAS conflict
   * so a concurrent pause/rollback is preserved instead of overwritten. */
  async function finish(actor: WorkspaceActor, businessId: string, id: string, stepId: string, leaseId: string, outcome: Outcome): Promise<Activation> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await load(businessId, id);
      const step = current.steps.find((s) => s.id === stepId);
      if (!step || step.status !== "running" || step.leaseId !== leaseId) conflict("This worker no longer owns the step.");
      step.status = outcome.status;
      step.effect = outcome.effect;
      step.reason = outcome.reason;
      step.receipt = outcome.receipt ?? step.receipt;
      step.readBack = outcome.readBack ?? step.readBack;
      step.finishedAt = now();
      step.leaseId = undefined;
      outcome.apply?.(current);
      current.status = deriveStatus(current);
      const next = record(current, "outcome", actor.userId, now(), `${step.id}: ${step.status}`);
      try {
        await deps.activations.save(next, current.revision);
        return next;
      } catch (error) {
        if (!(error instanceof WorkspaceConflictError) || attempt === 2) throw error;
      }
    }
    conflict("The step finished but its receipt needs reconciliation.");
  }

  async function settle(actor: WorkspaceActor, a: Activation): Promise<Activation> {
    if (a.status !== "made_real") return a;
    const p = await loadPossibility(a.businessId, a.possibilityId);
    if (p.status === "made_real") return a;
    const closed = markMadeReal(p, a.id, actor.userId, now());
    await deps.possibilities.save(closed, p.revision);
    return a;
  }

  async function perform(a: Activation, p: Possibility, step: ActivationStep, grantId?: string): Promise<Outcome> {
    const at = now();
    switch (step.kind) {
      case "stage": {
        const change = p.changes.find((c) => c.baseline.systemId === step.target)!;
        const { revisionId } = await deps.live.stageRevision(change.baseline, change.candidate, step.idempotencyKey);
        return { status: "completed", effect: "none", receipt: { adapterMode: "internal", acceptedAt: at, result: { revisionId } }, apply: (cur) => { const pin = cur.pinned.find((x) => x.systemId === step.target); if (pin) pin.stagedRevisionId = revisionId; } };
      }
      case "introduce": {
        const intro = p.introduces.find((i) => i.key === introducedKey(step.target))!;
        const created = await deps.live.introduceSystem(a.businessId, intro, step.idempotencyKey);
        return { status: "completed", effect: "none", receipt: { adapterMode: "internal", acceptedAt: at, result: created }, apply: (cur) => { const row = cur.introduced.find((x) => x.key === intro.key); if (row) Object.assign(row, created); } };
      }
      case "effect": {
        const effect = p.effects.find((e) => e.id === step.target)!;
        const adapter = adapterFor(effect);
        let result;
        try {
          result = await adapter.perform({ businessId: a.businessId, effect, idempotencyKey: step.idempotencyKey });
        } catch {
          // A thrown write may have reached the provider. Never infer it is safe to replay.
          return { status: "unknown", effect: "unknown", reason: "The provider did not confirm an outcome. Reconcile before continuing." };
        }
        if (result.status === "rejected") return { status: "failed", effect: "none", reason: result.reason };
        try { assertExtendedProviderReference(result.providerRef, a.businessId, effect); }
        catch { return { status: "unknown", effect: "unknown", reason: "Accepted provider reference does not match this approved effect. Reconcile before continuing." }; }
        const approval = a.approvals.find((x) => x.effectId === effect.id && !x.consumedAt);
        let readBack: ActivationStep["readBack"];
        try {
          const rb = await adapter.readBack({ businessId: a.businessId, providerRef: result.providerRef });
          readBack = { status: rb.ok ? "confirmed" : "failed", detail: rb.detail.slice(0, 1000), at: now() };
        } catch (error) {
          readBack = { status: "failed", detail: error instanceof Error ? error.message.slice(0, 1000) : "Read-back failed.", at: now() };
        }
        return {
          // Accepted is final: the approval is consumed and a failed read-back is
          // recorded beside it, never turned into a retry.
          status: "completed", effect: "accepted", readBack,
          receipt: { providerRef: result.providerRef, adapterMode: adapter.mode, acceptedAt: at, ...(grantId ? { grantId } : {}), ...(approval ? { approvalId: approval.approvalId } : {}), ...(result.result ? { result: result.result } : {}) },
          apply: (cur) => { const x = cur.approvals.find((v) => v.effectId === effect.id && !v.consumedAt); if (x) x.consumedAt = at; },
        };
      }
      case "activate": {
        const key = introducedKey(step.target);
        if (key) {
          const row = a.introduced.find((i) => i.key === key);
          if (!row?.systemId || !row.revisionId) return { status: "failed", effect: "none", reason: "The introduced System was not created." };
          const ref = { businessId: a.businessId, systemId: row.systemId };
          const current = await deps.live.current(ref);
          if (current?.revisionId !== row.revisionId) await deps.live.activate(ref, row.revisionId, null);
          return { status: "completed", effect: "none", receipt: { adapterMode: "internal", acceptedAt: at, result: { systemId: row.systemId, revisionId: row.revisionId } } };
        }
        const pin = a.pinned.find((x) => x.systemId === step.target)!;
        if (!pin.stagedRevisionId) return { status: "failed", effect: "none", reason: "The candidate revision was not staged." };
        const ref = { businessId: a.businessId, systemId: pin.systemId };
        const current = await deps.live.current(ref);
        if (current?.revisionId === pin.stagedRevisionId) return { status: "completed", effect: "none", receipt: { adapterMode: "internal", acceptedAt: at } };
        try {
          await deps.live.activate(ref, pin.stagedRevisionId, pin.baselineRevisionId);
        } catch (error) {
          if (error instanceof BaselineMovedError) return { status: "blocked", effect: "none", reason: `${pin.systemId} changed after Make real started (now ${error.current ?? "missing"}). Reconcile the candidate; nothing was switched.` };
          throw error;
        }
        return { status: "completed", effect: "none", receipt: { adapterMode: "internal", acceptedAt: at, result: { from: pin.baselineRevisionId, to: pin.stagedRevisionId } } };
      }
      case "connect": {
        const c = p.connections.find((x) => x.id === step.target)!;
        const { connectionId } = await deps.live.connect(a.businessId, { from: resolveTarget(a, c.from), to: resolveTarget(a, c.to), kind: c.kind, purpose: c.purpose }, step.idempotencyKey);
        return { status: "completed", effect: "none", receipt: { adapterMode: "internal", acceptedAt: at, result: { connectionId } }, apply: (cur) => { const row = cur.connections.find((x) => x.id === c.id); if (row) row.connectionId = connectionId; } };
      }
      case "verify": {
        const results: Activation["checks"] = [];
        for (const check of a.checks) {
          let r: { passed: boolean; detail: string };
          try { r = await deps.checks.run({ businessId: a.businessId, checkId: check.id, activation: a }); } catch (error) { r = { passed: false, detail: error instanceof Error ? error.message : "Check could not run." }; }
          results.push({ ...check, status: r.passed ? "passed" : "failed", detail: r.detail.slice(0, 1000), at: now() });
        }
        const failed = results.filter((r) => r.status === "failed");
        return {
          status: failed.length ? "failed" : "completed", effect: "none",
          ...(failed.length ? { reason: `Operating checks failed: ${failed.map((f) => f.id).join(", ")}` } : {}),
          apply: (cur) => { cur.checks = results; },
        };
      }
    }
  }

  /** Re-evaluated immediately before each step from current authority and
   * governance. A denial blocks the step without attempting it. */
  async function gate(actor: WorkspaceActor, a: Activation, p: Possibility, step: ActivationStep): Promise<{ denied?: string; refused?: boolean; grantId?: string }> {
    let grantId: string | undefined;
    if (step.scope) {
      const decision = await deps.authority.check(actor, { businessId: a.businessId, scope: step.scope, ...(step.kind === "activate" ? { systemId: step.target } : {}) });
      if (!decision.allowed) return { denied: `Authority for ${step.scope} is not current: ${decision.reason}` };
      grantId = decision.grantId;
    }
    if (step.kind === "effect") {
      const effect = p.effects.find((e) => e.id === step.target)!;
      const publish = gatePublish(effect);
      if (publish.kind === "allowed" && deps.requirePlanApproval) {
        // Live Make real: the owner's plan approval covers every effect, and
        // it is read again now, so a withdrawal after start stops the write.
        const entry = a.approvals.find((x) => x.effectId === effect.id && !x.consumedAt);
        if (!entry) return { denied: "Needs approval: the owner has not approved this plan." };
        const problem = approvalProblem(await deps.approvals.get(a.businessId, entry.approvalId), a.businessId, p, effect);
        if (problem) return { denied: `Needs approval: ${problem}.` };
      }
      if (publish.kind === "blocked") return { denied: publish.reason, refused: true };
      if (publish.kind === "needs_approval") {
        const entry = a.approvals.find((x) => x.effectId === effect.id && !x.consumedAt);
        if (!entry) return { denied: `Needs approval: ${publish.reason}` };
        // Re-read the record now: a dismissal after start must stop the write.
        const problem = approvalProblem(await deps.approvals.get(a.businessId, entry.approvalId), a.businessId, p, effect);
        if (problem) return { denied: `Needs approval: ${problem}.` };
      }
      const adapter = selectAdapter(deps.adapters, effect);
      if (adapter?.ready) {
        let ready: { ok: true } | { ok: false; reason: string };
        try { ready = await adapter.ready({ businessId: a.businessId, effect }); } catch (error) { ready = { ok: false, reason: error instanceof Error ? error.message : "The connection could not be checked." }; }
        if (!ready.ok) return { denied: `Waiting: ${ready.reason}` };
      }
    }
    return { grantId };
  }

  async function runNext(actor: WorkspaceActor, businessId: string, id: string): Promise<{ activation: Activation; ran: string | null }> {
    const a = await load(businessId, id);
    if (a.status !== "in_progress") return { activation: a, ran: null };
    if (a.steps.some((s) => s.status === "running")) conflict("A step is already running. Resume reconciles it before anything else runs.");
    const step = runnable(a);
    if (!step) return { activation: a, ran: null };
    const p = await loadPossibility(businessId, a.possibilityId);
    if (p.activationId !== a.id) conflict("This activation no longer belongs to its possibility.");

    const gated = await gate(actor, a, p, step);
    if (gated.denied) {
      const denied = gated.denied;
      step.status = gated.refused ? "failed" : "blocked";
      step.reason = denied;
      step.finishedAt = now();
      a.status = deriveStatus(a);
      const next = record(a, "blocked", actor.userId, now(), `${step.id}: ${denied}`);
      await deps.activations.save(next, a.revision);
      return { activation: next, ran: step.id };
    }

    const leaseId = newId();
    step.status = "running"; step.leaseId = leaseId; step.startedAt = now(); step.attempts += 1; step.reason = undefined;
    const claimed = record(a, "started", actor.userId, now(), step.id);
    await deps.activations.save(claimed, a.revision);

    let outcome: Outcome;
    try {
      outcome = await perform(claimed, p, claimed.steps.find((s) => s.id === step.id)!, gated.grantId);
    } catch (error) {
      // Internal writes are idempotent by key, so a thrown internal step is safe to resume.
      outcome = { status: "failed", effect: "none", reason: error instanceof Error ? error.message.slice(0, 2000) : "The step failed." };
    }
    const finished = await finish(actor, businessId, id, step.id, leaseId, outcome);
    await settle(actor, finished);
    return { activation: finished, ran: step.id };
  }

  async function run(actor: WorkspaceActor, businessId: string, id: string): Promise<Activation> {
    let a = await load(businessId, id);
    for (let i = 0; i < a.steps.length * 2 + 2; i++) {
      const result = await runNext(actor, businessId, id);
      a = result.activation;
      if (!result.ran || a.status !== "in_progress") break;
    }
    return a;
  }

  return {
    /** Pin, validate baselines and preflight every grant before anything runs. */
    async start(actor: WorkspaceActor, businessId: string, possibilityId: string, opts: { approvals?: Array<{ effectId: string; approvalId: string }>; planApprovalId?: string } = {}): Promise<Activation> {
      let p = await loadPossibility(businessId, possibilityId);
      if (p.status !== "ready") conflict("Only a ready possibility can be made real.");
      if (p.activationId) conflict("This possibility is already being made real.");
      const activate = await deps.authority.check(actor, { businessId, scope: "system.activate" });
      if (!activate.allowed) throw new WorkspaceAccessError(`You cannot make this real: ${activate.reason}`);

      const stale = await staleBaselines(p, deps.live);
      if (stale.length) {
        const back = returnToExploring(p, `Live changed: ${stale.map((s) => `${s.systemId} ${s.pinned} -> ${s.current}`).join(", ")}`, actor.userId, now());
        await deps.possibilities.save(back, p.revision);
        conflict(`The live ${stale.map((s) => s.systemId).join(", ")} changed since this was rehearsed. It is back to Exploring for a refresh.`);
      }

      const problems: string[] = [];
      const at = now();
      const verified: Activation["approvals"] = [];
      for (const given of opts.approvals ?? []) {
        if (!p.effects.some((e) => e.id === given.effectId)) problems.push(`${given.effectId}: not an effect of this possibility`);
      }
      let planRecord: Awaited<ReturnType<ApprovalRecordsPort["get"]>> = null;
      if (opts.planApprovalId) {
        if (p.consumedApprovalIds?.includes(opts.planApprovalId)) problems.push(`approval ${opts.planApprovalId} was already used by an accepted write`);
        planRecord = await deps.approvals.get(businessId, opts.planApprovalId);
        const problem = planApprovalProblem(planRecord, businessId, p);
        if (problem) problems.push(`the plan approval was refused (${problem})`);
      } else if (deps.requirePlanApproval) {
        problems.push("the owner has not approved this plan");
      }
      for (const effect of p.effects) {
        if (!selectAdapter(deps.adapters, effect)) problems.push(`${effect.id}: no ${effect.channel ?? effect.kind} connection`);
        const decision = await deps.authority.check(actor, { businessId, scope: EFFECT_SCOPE[effect.kind] });
        if (!decision.allowed) problems.push(`${effect.id}: ${decision.reason}`);
        const publish = gatePublish(effect);
        if (publish.kind === "blocked") problems.push(`${effect.id}: ${publish.reason}`);
        if (opts.planApprovalId && planRecord && publish.kind !== "blocked") {
          // One approval for the whole plan; each effect must still sit inside it.
          const problem = approvalProblem(planRecord, businessId, p, effect);
          if (problem) { problems.push(`${effect.id}: approval refused (${problem})`); continue; }
          verified.push({ effectId: effect.id, approvalId: opts.planApprovalId, approvedBy: planRecord.decidedBy ?? `approval:${opts.planApprovalId}`, at });
          continue;
        }
        if (publish.kind !== "needs_approval") continue;
        const given = opts.approvals?.find((x) => x.effectId === effect.id);
        if (!given) { problems.push(`${effect.id}: needs approval (${publish.reason})`); continue; }
        if (p.consumedApprovalIds?.includes(given.approvalId)) { problems.push(`${effect.id}: approval ${given.approvalId} was already used by an accepted write`); continue; }
        const recordRow = await deps.approvals.get(businessId, given.approvalId);
        const problem = approvalProblem(recordRow, businessId, p, effect);
        if (problem) { problems.push(`${effect.id}: approval refused (${problem})`); continue; }
        verified.push({ effectId: effect.id, approvalId: given.approvalId, approvedBy: recordRow!.decidedBy ?? `approval:${given.approvalId}`, at });
      }
      if (problems.length) conflict(`Make real cannot start yet. ${problems.join("; ")}`);

      const id = newId();
      const activation = activationSchema.parse({
        version: 1, id, businessId, possibilityId, candidateRevision: p.candidateRevision, actorId: actor.userId,
        status: "in_progress", revision: 0,
        pinned: p.changes.map((c) => ({ systemId: c.baseline.systemId, baselineRevisionId: c.baseline.revisionId })),
        introduced: p.introduces.map((i) => ({ key: i.key })),
        connections: p.connections.map((c) => ({ id: c.id })),
        approvals: verified,
        checks: initialChecks(p),
        steps: planActivation(p, deps.adapters),
        createdAt: at, updatedAt: at, history: [],
      });
      await deps.activations.create(activation);
      const before = p.revision;
      p = attachActivation(p, id, actor.userId, at);
      await deps.possibilities.save(p, before);
      return activation;
    },

    runNext,
    run,

    /** Continue only unfinished work. Accepted effects are never replayed; an
     * interrupted effect is resolved by provider lookup on its idempotency key. */
    async resume(actor: WorkspaceActor, businessId: string, id: string, note?: string): Promise<Activation> {
      const a = await load(businessId, id);
      if (a.status === "made_real" || a.status === "rolled_back") conflict("This activation is closed.");
      if (a.rollbackStartedAt) conflict("Rollback has started. Reconcile any unknown step and finish the rollback instead.");
      const notes: string[] = [];
      for (const step of a.steps) {
        if (step.status === "running") {
          if (Date.parse(now()) - Date.parse(step.startedAt ?? now()) < RUNNING_STEP_GRACE_MS) conflict("A worker may still be running this step. Wait before resuming.");
          if (step.kind !== "effect") { step.status = "pending"; step.leaseId = undefined; notes.push(`${step.id}: internal, resumed`); continue; }
          const effect = (await loadPossibility(businessId, a.possibilityId)).effects.find((e) => e.id === step.target)!;
          const adapter = adapterFor(effect);
          const found = await adapter.find({ businessId, idempotencyKey: step.idempotencyKey, effect });
          step.leaseId = undefined;
          if (found?.found) {
            assertExtendedProviderReference(found.providerRef, businessId, effect);
            const rb = await adapter.readBack({ businessId, providerRef: found.providerRef }).catch((e: unknown) => ({ ok: false, detail: e instanceof Error ? e.message : "Read-back failed." }));
            step.status = "completed"; step.effect = "accepted"; step.finishedAt = now();
            step.receipt = { providerRef: found.providerRef, adapterMode: adapter.mode, acceptedAt: now(), reconciledBy: "provider_lookup" };
            step.readBack = { status: rb.ok ? "confirmed" : "failed", detail: rb.detail.slice(0, 1000), at: now() };
            const approval = a.approvals.find((x) => x.effectId === effect.id && !x.consumedAt);
            if (approval) approval.consumedAt = now();
            notes.push(`${step.id}: provider already accepted, not repeated`);
          } else if (found && !found.found && adapter.idempotentByKey) {
            step.status = "pending";
            notes.push(`${step.id}: provider has no record; safe to retry with the same key`);
          } else {
            step.status = "unknown"; step.effect = "unknown";
            step.reason = "The provider cannot confirm whether this happened. Reconcile with evidence.";
            notes.push(`${step.id}: unknown`);
          }
        } else if ((step.status === "blocked" || step.status === "failed") && step.effect === "none") {
          if (step.attempts >= MAX_ATTEMPTS) { notes.push(`${step.id}: retry limit`); continue; }
          step.status = "pending";
        }
      }
      if (a.steps.some((s) => s.kind === "verify" && s.status === "pending")) a.checks = a.checks.map((c) => ({ id: c.id, description: c.description, status: "pending" }));
      a.status = "in_progress";
      a.status = deriveStatus(a);
      const next = record(a, "resume", actor.userId, now(), [note, ...notes].filter(Boolean).join("; ") || undefined);
      await deps.activations.save(next, a.revision);
      if (next.status !== "in_progress") return next;
      return run(actor, businessId, id);
    },

    async approve(actor: WorkspaceActor, businessId: string, id: string, effectId: string, approvalId: string): Promise<Activation> {
      const a = await load(businessId, id);
      if (a.status === "made_real" || a.status === "rolled_back" || a.rollbackStartedAt) conflict("This activation is closed.");
      const p = await loadPossibility(businessId, a.possibilityId);
      const effect = p.effects.find((e) => e.id === effectId);
      if (!effect || !a.steps.some((s) => s.kind === "effect" && s.target === effectId)) conflict("That effect is not part of this activation.");
      const decision = await deps.authority.check(actor, { businessId, scope: EFFECT_SCOPE[effect.kind] });
      if (!decision.allowed) throw new WorkspaceAccessError(decision.reason);
      const recordRow = await deps.approvals.get(businessId, approvalId);
      // A plan approval covers every effect of the plan once each; an effect approval is used once.
      const usedHere = recordRow?.subject.kind === "make_real_plan"
        ? a.approvals.some((x) => x.approvalId === approvalId && x.effectId === effectId && x.consumedAt)
        : a.approvals.some((x) => x.approvalId === approvalId && x.consumedAt);
      if (p.consumedApprovalIds?.includes(approvalId) || usedHere) conflict("That approval was already used by an accepted write.");
      const problem = approvalProblem(recordRow, businessId, p, effect);
      if (problem) conflict(`That approval cannot be used: ${problem}.`);
      a.approvals.push({ effectId, approvalId, approvedBy: recordRow!.decidedBy ?? `approval:${approvalId}`, at: now() });
      const next = record(a, "approve", actor.userId, now(), effectId);
      await deps.activations.save(next, a.revision);
      return next;
    },

    /** Operator evidence for an unknown outcome. An accepted write can never
     * be declared safe to replay. */
    async reconcile(actor: WorkspaceActor, businessId: string, id: string, input: { stepId: string; resolution: "completed" | "not_applied"; evidence: string; providerRef?: string; note?: string; target?: "effect" | "compensation" }): Promise<Activation> {
      const a = await load(businessId, id);
      const step = a.steps.find((s) => s.id === input.stepId);
      // Declaring what happened outside is an authority act, rechecked now.
      const decision = await deps.authority.check(actor, { businessId, scope: step?.scope ?? "system.activate" });
      if (!decision.allowed) throw new WorkspaceAccessError(decision.reason);
      if (!step || !input.evidence.trim()) conflict("Reconciliation needs an unknown step and evidence of its outcome.");
      const target = input.target ?? (compensationUnknown(step) ? "compensation" : "effect");
      if (target === "compensation") {
        if (step.kind !== "effect" || step.effect !== "accepted") {
          conflict("Reconciliation needs an accepted effect with an unknown compensation outcome.");
        }
        if (compensationRunning(step)) {
          conflict("A compensation request is still active or claimed. Wait before reconciling its outcome.");
        }
        if (!compensationUnknown(step)) {
          conflict("Reconciliation needs an accepted effect with an unknown compensation outcome.");
        }
        if (compensationClaimActive(a, step)) {
          conflict("A compensation request is still settling. Wait before reconciling its outcome.");
        }
        const evidence = input.evidence.slice(0, 2000);
        if (input.resolution === "completed") {
          const declared = (await loadPossibility(businessId, a.possibilityId)).effects.find(effect => effect.id === step.target);
          if (declared?.channel === "google_listing" && declared.request.nativeGrant) {
            const adapter = adapterFor(declared);
            if (!step.receipt?.providerRef || !adapter.verifyCompensation) conflict("Native Google compensation needs exact inverse readback.");
            assertExtendedProviderReference(step.receipt.providerRef, businessId, declared);
            const inverse = await adapter.verifyCompensation({ businessId, providerRef: step.receipt.providerRef });
            if (!inverse.ok) conflict("Native Google compensation readback is unconfirmed. Nothing was repeated.");
          }
          step.status = "compensated";
          step.compensation = { status: "compensated", detail: evidence, at: now() };
          step.reason = undefined;
        } else {
          const detail = `Evidence confirms compensation did not apply: ${evidence}`.slice(0, 2000);
          step.compensation = { status: "failed", detail, at: now() };
          step.reason = `Compensation failed: ${detail}`.slice(0, 2000);
        }
        a.status = deriveStatus(a);
        const next = record(a, "reconcile", actor.userId, now(), `${step.id} compensation: ${input.resolution}`);
        await deps.activations.save(next, a.revision);
        return next;
      }
      if (step.status !== "unknown") conflict("Reconciliation needs an unknown step and evidence of its outcome.");
      if (input.resolution === "not_applied" && step.effect === "accepted") conflict("An accepted write cannot be declared safe to replay.");
      if (input.resolution === "completed") {
        const declared = step.kind === "effect" ? (await loadPossibility(businessId, a.possibilityId)).effects.find((e) => e.id === step.target) : undefined;
        let providerRef = input.providerRef;
        if (declared?.channel === "google_listing") {
          const adapter = adapterFor(declared);
          const found = await adapter.find({ businessId, effect: declared, idempotencyKey: step.idempotencyKey });
          if (!found?.found || (providerRef !== undefined && providerRef !== found.providerRef)) conflict("Google recovery requires the exact provider-found receipt reference.");
          providerRef = found.providerRef;
          assertExtendedProviderReference(providerRef, businessId, declared);
          const readBack = await adapter.readBack({ businessId, providerRef });
          if (!readBack.ok) conflict("Google recovery requires confirmed provider read-back.");
          step.readBack = { status: "confirmed", detail: readBack.detail.slice(0, 1000), at: now() };
        }
        if (providerRef !== undefined) assertExtendedProviderReference(providerRef, businessId, declared);
        step.status = "completed"; step.effect = "accepted";
        step.receipt = { adapterMode: declared ? adapterFor(declared).mode : "internal", acceptedAt: now(), reconciledBy: "operator_evidence", ...(providerRef ? { providerRef } : {}) };
      } else {
        step.status = "failed"; step.effect = "none";
      }
      step.reason = input.evidence.slice(0, 2000);
      step.finishedAt = now();
      a.status = "in_progress";
      a.status = deriveStatus(a);
      const next = record(a, "reconcile", actor.userId, now(), `${step.id}: ${input.resolution}${input.note ? ` (${input.note})` : ""}`);
      await deps.activations.save(next, a.revision);
      return settle(actor, next);
    },

    /** Bounded recovery: restore live references, compensate what can be
     * compensated, and name what cannot be undone. Accepted irreversible
     * effects stay recorded as done. A step whose outside outcome is unknown
     * cannot be undone or declared absent, so rollback stops short of
     * `rolled_back` until it is reconciled with evidence; calling rollback
     * again then finishes it. Each undone step is checkpointed on its own so
     * an interrupted rollback resumes instead of repeating live writes. */
    async rollback(actor: WorkspaceActor, businessId: string, id: string, note?: string): Promise<Activation> {
      let a = await load(businessId, id);
      if (a.status === "made_real") conflict("This is already real. Change it with a new possibility instead of rolling back.");
      if (a.status === "rolled_back") return a;
      if (a.steps.some((s) => s.status === "running")) conflict("A step is still running. Resume to reconcile it before rolling back.");
      const decision = await deps.authority.check(actor, { businessId, scope: "system.activate" });
      if (!decision.allowed) throw new WorkspaceAccessError(decision.reason);
      const p = await loadPossibility(businessId, a.possibilityId);

      const checkpoint = async (kind: string, detail?: string) => {
        a.status = deriveStatus(a);
        const next = record(a, kind, actor.userId, now(), detail);
        await deps.activations.save(next, a.revision);
        a = next;
      };
      if (!a.rollbackStartedAt) {
        a.rollbackStartedAt = now();
        await checkpoint("rollback_started", note);
      }

      for (const stepId of [...a.steps].reverse().map((s) => s.id)) {
        let step = a.steps.find((s) => s.id === stepId)!;
        if (step.status !== "completed") continue;
        const before = `${step.status}|${step.reason ?? ""}|${JSON.stringify(step.compensation ?? null)}`;
        let attemptedCompensation = false;
        let activeClaimKey: string | undefined;
        if (step.kind === "connect" || step.kind === "activate") {
          const permission = await deps.authority.check(actor, { businessId, scope: "system.activate" });
          if (!permission.allowed) throw new WorkspaceAccessError(permission.reason);
        }
        if (step.kind === "connect") {
          const row = a.connections.find((c) => c.id === step.target);
          if (row?.connectionId) await deps.live.disconnect(businessId, row.connectionId);
          step.status = "restored"; step.reason = "Connection removed during rollback.";
        } else if (step.kind === "activate") {
          const key = introducedKey(step.target);
          if (key) {
            const row = a.introduced.find((i) => i.key === key)!;
            await deps.live.restore({ businessId, systemId: row.systemId! }, null, row.revisionId!);
            step.status = "restored"; step.reason = "Paused; its record and revisions are kept.";
          } else {
            const pin = a.pinned.find((x) => x.systemId === step.target)!;
            const ref = { businessId, systemId: pin.systemId };
            // An interrupted rollback may already have restored this pointer.
            if ((await deps.live.current(ref))?.revisionId !== pin.baselineRevisionId) await deps.live.restore(ref, pin.baselineRevisionId, pin.stagedRevisionId!);
            step.status = "restored"; step.reason = `Live reference restored to ${pin.baselineRevisionId}.`;
          }
        } else if (step.kind === "effect" && step.effect === "accepted") {
          if (compensationRunning(step)) {
            const claim = step.compensation!;
            const claimAge = Date.parse(now()) - Date.parse(claim.at);
            if (compensationClaimActive(a, step) || claimAge < RUNNING_STEP_GRACE_MS) break;
            const detail = "A compensation claim expired without a recorded provider outcome.";
            step.compensation = { status: "unknown", detail, at: now(), claimId: claim.claimId };
            step.reason = `Compensation outcome is unknown: ${detail}`;
          }
          const effect = p.effects.find((e) => e.id === step.target)!;
          const adapter = selectAdapter(deps.adapters, effect);
          const providerRef = step.receipt?.providerRef;
          if (compensationUnknown(step)) {
            // Reconciliation must establish the provider outcome before retry.
          } else if (step.reversibility === "compensable" && adapter?.compensate && providerRef) {
            const permission = await deps.authority.check(actor, { businessId, scope: step.scope ?? EFFECT_SCOPE[effect.kind] });
            if (!permission.allowed) {
              step.compensation = { status: "unavailable", detail: `Undo authority is not current: ${permission.reason}`.slice(0, 2000), at: now() };
              step.reason = step.compensation.detail;
              await checkpoint("rollback_step", `${step.id}: undo authority unavailable`);
              continue;
            }
            const claimId = newId();
            step.compensation = { status: "running", detail: "A compensation request is in progress.", at: now(), claimId };
            step.reason = undefined;
            activeClaimKey = compensationClaimKey(businessId, a.id, step.id, claimId);
            activeCompensationClaims.add(activeClaimKey);
            try {
              await checkpoint("rollback_compensation_claim", `${step.id}: compensation claimed`);
            } catch (error) {
              activeCompensationClaims.delete(activeClaimKey);
              throw error;
            }
            // checkpoint() advances the activation copy, so reacquire the step
            // that carries the persisted claim before recording the result.
            step = a.steps.find((s) => s.id === stepId)!;
            attemptedCompensation = true;
            try {
              const r = await adapter.compensate({ businessId, providerRef, idempotencyKey: `${step.idempotencyKey}:compensate` });
              if (r.ok) {
                step.status = "compensated";
                step.compensation = { status: "compensated", detail: r.detail.slice(0, 2000), at: now(), claimId };
                step.reason = r.detail.slice(0, 2000);
              } else {
                step.compensation = { status: "failed", detail: r.detail.slice(0, 2000), at: now(), claimId };
                step.reason = `Compensation failed: ${step.compensation.detail}`.slice(0, 2000);
              }
            } catch (error) {
              const detail = error instanceof Error ? error.message : "The provider did not confirm whether compensation succeeded.";
              step.compensation = { status: "unknown", detail: detail.slice(0, 2000), at: now(), claimId };
              step.reason = `Compensation outcome is unknown: ${step.compensation.detail}`.slice(0, 2000);
            }

          } else {
            const detail = step.reversibility !== "compensable" ? "This accepted effect is irreversible."
              : !adapter ? `The ${effect.kind} adapter is unavailable.`
                : !adapter.compensate ? `The ${effect.kind} adapter has no compensation operation.`
                  : "The accepted effect has no provider reference for compensation.";
            step.compensation = { status: "unavailable", detail, at: now() };
            step.reason = "Already happened and cannot be undone.";
          }
        } else if (step.kind === "stage" || step.kind === "introduce") {
          step.status = "restored"; step.reason = "Prepared revision kept as history; never live.";
        }
        if (`${step.status}|${step.reason ?? ""}|${JSON.stringify(step.compensation ?? null)}` !== before || attemptedCompensation) {
          try {
            await checkpoint("rollback_step", `${step.id}: ${step.status}`);
          } finally {
            if (activeClaimKey) activeCompensationClaims.delete(activeClaimKey);
          }
        } else if (activeClaimKey) {
          activeCompensationClaims.delete(activeClaimKey);
        }
      }

      const unknown = a.steps.filter((s) => s.status === "unknown" || compensationUnknown(s));
      if (unknown.length) {
        // Nothing may claim this is over while an outside outcome is unknown.
        return a;
      }
      if (a.steps.some(compensationRunning)) return a;
      const failedCompensations = a.steps.filter((s) => s.kind === "effect" && s.effect === "accepted"
        && s.status === "completed" && (compensationFailed(s)
          || (s.reversibility === "compensable" && s.compensation?.status === "unavailable")));
      if (failedCompensations.length) {
        // Keep the activation attached and open. A failed compensation may be
        // retried after the provider issue is fixed; calling it rolled back
        // would strand an accepted effect that is still live.
        return a;
      }
      a.status = "rolled_back";
      const done = record(a, "rollback", actor.userId, now());
      await deps.activations.save(done, a.revision);
      const detached = detachActivation(p, a.id, actor.userId, now(), {
        undoneStepIds: done.steps.filter((s) => s.status === "restored" || s.status === "compensated").map((s) => s.id),
        consumedApprovalIds: done.approvals.filter((x) => x.consumedAt).map((x) => x.approvalId),
      });
      await deps.possibilities.save(detached, p.revision);
      return done;
    },

    get: load,
  };
}

export type MakeReal = ReturnType<typeof createMakeReal>;
