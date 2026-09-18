import { randomUUID } from "node:crypto";
import { WorkspaceAccessError, WorkspaceConflictError, type WorkspaceActor } from "@/platform/workspaces/types";
import { createResponsibility, changeResponsibility, claimNextStep, recordStepOutcome, type Responsibility, type StepInput, type StepOutcome } from "./engine";

export interface ExecutionStore {
  read(actor: WorkspaceActor, workId: string, access?: "normal" | "checkpoint"): Promise<{ id: string; workspaceId: string; payload: Responsibility }>;
  write(actor: WorkspaceActor, workId: string, workspaceId: string, expectedRevision: number, payload: Responsibility, phase?: "command" | "start" | "outcome"): Promise<Responsibility>;
  create(actor: WorkspaceActor, workspaceId: string, payload: Responsibility): Promise<{ id: string }>;
}
export interface ExecutionAdapter {
  inspect?(actor: WorkspaceActor, workspaceId: string, step: StepInput): Promise<void>;
  /** Re-evaluate membership, product policy, source freshness and budget, never cached authority. */
  recheck(actor: WorkspaceActor, workspaceId: string, step: StepInput, responsibilityId?: string): Promise<void>;
  perform(actor: WorkspaceActor, workspaceId: string, responsibilityId: string, step: StepInput, executionKey: string, budgetId?: string): Promise<StepOutcome>;
}
export type RunAuthorization = (
  actor: WorkspaceActor,
  saved: { id: string; workspaceId: string; payload: Responsibility },
) => Promise<void> | void;

const requireOwnerRun: RunAuthorization = (actor, saved) => {
  if (saved.payload.ownerId !== actor.userId) throw new WorkspaceAccessError();
};

export function responsibilityCommands(
  store: ExecutionStore,
  adapter: ExecutionAdapter,
  now = () => new Date().toISOString(),
  authorizeRun: RunAuthorization = requireOwnerRun,
) {
  return {
    async create(actor: WorkspaceActor, workspaceId: string, input: unknown) {
      const work = createResponsibility(input, actor.userId, now());
      for (const step of work.steps) await (adapter.inspect ?? adapter.recheck)(actor, workspaceId, step);
      const saved = await store.create(actor, workspaceId, work);
      return store.read(actor, saved.id);
    },
    async command(actor: WorkspaceActor, workId: string, command: unknown) {
      const saved = await store.read(actor, workId);
      // Shared responsibility is owned by its sponsor. Contributors propose via participation.
      if (saved.payload.ownerId !== actor.userId) throw new WorkspaceAccessError();
      const changed = changeResponsibility(saved.payload, command, actor.userId, now());
      await store.write(actor, workId, saved.workspaceId, saved.payload.revision, changed, "command");
      return store.read(actor, workId);
    },
    async run(actor: WorkspaceActor, workId: string) {
      const saved = await store.read(actor, workId);
      await authorizeRun(actor, saved);
      const lease = randomUUID();
      const proposedClaim = claimNextStep(saved.payload, lease, now(), actor.userId);
      const step = proposedClaim.steps.find(s => s.leaseId === lease)!;
      // Recheck before claiming so denied work can be corrected without an ambiguous write.
      await adapter.recheck(actor, saved.workspaceId, step, saved.id);
      await store.write(actor, workId, saved.workspaceId, saved.payload.revision, proposedClaim, "start");
      let outcome: StepOutcome;
      try {
        // Cancellation/revocation/version/budget are checked immediately before the command.
        const current = await store.read(actor, workId);
        await authorizeRun(actor, current);
        if (current.payload.status !== "running" || current.payload.steps.find(s => s.id === step.id)?.leaseId !== lease) throw new WorkspaceConflictError("Work was paused or cancelled before this action.");
        await adapter.recheck(actor, saved.workspaceId, step, saved.id);
      } catch (error) {
        outcome = { effect: "none", status: "failed", reason: error instanceof Error ? error.message : "Access changed before this action." };
        return finish(outcome);
      }
      try {
        outcome = await adapter.perform(actor, saved.workspaceId, saved.id, step, `${saved.id}:${step.id}:${step.attempt}`, saved.payload.budgetId);
      } catch {
        // A thrown write may have reached its provider. Never infer that it is safe to retry.
        outcome = { effect: "unknown", status: "failed", reason: "The command did not return a confirmed outcome. Reconcile it before continuing." };
      }
      return finish(outcome);

      async function finish(result: StepOutcome) {
        // A concurrent pause/cancel must survive this checkpoint. CAS prevents overwriting it.
        for (let attempt = 0; attempt < 3; attempt++) {
          const current = await store.read(actor, workId, "checkpoint");
          const next = recordStepOutcome(current.payload, lease, result, now(), actor.userId);
          try {
            const persisted = await store.write(actor, workId, saved.workspaceId, current.payload.revision, next, "outcome");
            return { ...current, payload: persisted };
          } catch (error) { if (!(error instanceof WorkspaceConflictError) || attempt === 2) throw error; }
        }
        throw new WorkspaceConflictError("The action finished but its receipt needs reconciliation.");
      }
    },
  };
}
