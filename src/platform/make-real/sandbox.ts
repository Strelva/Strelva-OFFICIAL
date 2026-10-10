import { WorkspaceConflictError, type WorkspaceActor } from "@/platform/workspaces/types";
import {
  createInMemoryPossibilityRepository,
  createPossibility,
  markReady,
  recordRehearsal,
  rehearsePossibility,
  type OperatingCheck,
  type Possibility,
} from "@/platform/possibilities";
import type { SystemRef } from "@/platform/systems/contracts";
import { createInMemoryApprovalRecords, planApprovalAuthority, type ApprovalRecordsPort } from "./approvals";
import type { Activation } from "./contracts";
import { createInMemoryLiveSystems } from "./in-memory-live";
import { createIsolatedAdapter, type IsolatedAdapter } from "./isolated-adapters";
import type { AuthorityPort, EffectAdapter } from "./ports";
import { createInMemoryActivationRepository } from "./repository";
import { createMakeReal } from "./runner";
import { describeActivation, type ActivationView } from "./view";

/**
 * Make real on an isolated copy of a business's Systems.
 *
 * Every live write goes to an in-memory copy seeded from what the business
 * runs now; every outside effect adapter is an ISOLATED fake. Nothing here can
 * reach Google, email, Stripe, a domain or the spine's SystemStore. This is
 * what the workspace route runs until the durable work-execution port and real
 * provider connections exist (README: "Decision: one execution engine").
 *
 * The run stops before the first step that would switch a live System or
 * perform an outside effect. Those steps stay pending and are reported as not
 * started, so the result never claims a live change that did not happen.
 */

export interface SandboxSystem {
  ref: SystemRef;
  name: string;
  /** What the System runs now, as plain JSON. Becomes the pinned baseline. */
  content: Record<string, unknown>;
}

export interface SandboxChange {
  systemId: string;
  summary: string;
  content: Record<string, unknown>;
}

export interface IsolatedPossibilityInput {
  businessId: string;
  possibilityId: string;
  title: string;
  intent: string;
  /** Every System the candidate changes, with its current state. */
  systems: readonly SandboxSystem[];
  changes: readonly SandboxChange[];
  checks: readonly OperatingCheck[];
  /** The candidate is ready for a decision (rehearsed and reviewed upstream). */
  ready: boolean;
  actorId: string;
  at: string;
}

export interface IsolatedSandbox {
  possibility: Possibility;
  run(actor: WorkspaceActor, authority: { canActivate: boolean; reason?: string }, options?: SandboxRunOptions): Promise<IsolatedRun>;
}

export interface SandboxRunOptions {
  /**
   * The owner's one approval for this plan (a Needs you item). When given,
   * activation is allowed only while that record still approves this exact
   * plan, and it stands in for every effect that needs an approval.
   */
  planApproval?: { approvalId: string; approvals: ApprovalRecordsPort };
}

export interface IsolatedRun {
  activation: Activation;
  view: ActivationView;
  /** Labels of the steps that would have needed a live switch or a provider. */
  stoppedBefore: string[];
}

const PREP_STEPS = new Set(["stage", "introduce"]);

/** Adapters for every effect kind, all isolated. Refuses anything else. */
export function isolatedAdapters(): IsolatedAdapter[] {
  const adapters = (["calendar", "message", "payment", "publish"] as const).map((kind) => createIsolatedAdapter(kind));
  assertIsolated(adapters);
  return adapters;
}

export function assertIsolated(adapters: readonly EffectAdapter[]): void {
  for (const adapter of adapters) {
    if (adapter.mode !== "isolated") throw new WorkspaceConflictError(`The Make real sandbox refuses a live ${adapter.kind} adapter.`);
  }
}

/**
 * Build a Possibility over an isolated copy: seed each affected System's
 * current state as its baseline, create the candidate, rehearse it with
 * isolated adapters and, when the candidate is ready, mark it Ready through
 * the engine (which rechecks the rehearsal and baselines).
 */
export async function prepareIsolatedPossibility(input: IsolatedPossibilityInput): Promise<IsolatedSandbox> {
  const live = createInMemoryLiveSystems();
  const adapters = isolatedAdapters();
  const baselines = new Map<string, { revisionId: string; number: number }>();
  for (const system of input.systems) {
    if (system.ref.businessId !== input.businessId) throw new WorkspaceConflictError("A possibility can only change this business's Systems.");
    baselines.set(system.ref.systemId, { revisionId: live.seed(system.ref, system.name, system.content), number: 1 });
  }
  let possibility = createPossibility({
    title: input.title,
    intent: input.intent,
    changes: input.changes.map((change) => {
      const baseline = baselines.get(change.systemId);
      if (!baseline) throw new WorkspaceConflictError("A change names a System that is not part of this possibility.");
      return {
        baseline: { businessId: input.businessId, systemId: change.systemId, revisionId: baseline.revisionId, number: baseline.number },
        candidate: { summary: change.summary, content: change.content },
      };
    }),
    checks: [...input.checks],
  }, { id: input.possibilityId, businessId: input.businessId, actorId: input.actorId, at: input.at });
  const rehearsal = await rehearsePossibility(possibility, live.port, adapters, input.at);
  possibility = recordRehearsal(possibility, rehearsal, possibility.revision, input.actorId, input.at);
  if (input.ready) possibility = await markReady(possibility, live.port, possibility.revision, input.actorId, input.at);
  const prepared = possibility;

  return {
    possibility: prepared,
    async run(actor, permission, options = {}) {
      const possibilities = createInMemoryPossibilityRepository();
      await possibilities.create(prepared);
      const activations = createInMemoryActivationRepository();
      const base: AuthorityPort = {
        async check(_actor, request) {
          if (request.scope === "system.activate") {
            return permission.canActivate ? { allowed: true, grantId: "isolated-sandbox" } : { allowed: false, reason: permission.reason ?? "only an owner can make this real" };
          }
          return { allowed: false, reason: "this outside connection is not connected to Make real yet" };
        },
      };
      const plan = options.planApproval;
      const authority = plan
        ? planApprovalAuthority(base, { approvals: plan.approvals, businessId: input.businessId, approvalId: plan.approvalId, plan: async () => prepared })
        : base;
      const makeReal = createMakeReal({
        possibilities, activations, live: live.port, authority, adapters,
        checks: { async run() { return { passed: false, detail: "Not run: this was an isolated copy, not the live System." }; } },
        approvals: plan?.approvals ?? createInMemoryApprovalRecords(),
        clock: () => input.at,
      });
      let activation = await makeReal.start(actor, input.businessId, prepared.id,
        plan ? { approvals: prepared.effects.map((effect) => ({ effectId: effect.id, approvalId: plan.approvalId })) } : {});
      for (let guard = 0; guard < activation.steps.length; guard++) {
        const next = nextRunnable(activation);
        if (!next || !PREP_STEPS.has(next.kind) || activation.status !== "in_progress") break;
        activation = (await makeReal.runNext(actor, input.businessId, activation.id)).activation;
      }
      return {
        activation,
        view: describeActivation(activation),
        stoppedBefore: activation.steps.filter((step) => step.status === "pending").map((step) => step.label),
      };
    },
  };
}

function nextRunnable(a: Activation) {
  return a.steps.find((s) => s.status === "pending" && s.dependsOn.every((id) => a.steps.find((d) => d.id === id)?.status === "completed"));
}
