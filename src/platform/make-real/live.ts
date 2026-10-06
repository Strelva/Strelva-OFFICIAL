import { WorkspaceAccessError, WorkspaceConflictError, type WorkspaceActor } from "@/platform/workspaces/types";
import type { Possibility } from "@/platform/possibilities/contracts";
import type { PossibilityRepository } from "@/platform/possibilities/repository";
import type { Decision, OwnerDecision, ProposedItem } from "@/platform/needs-you/contracts";
import type { AdapterContext, ResolveBy, ResolveOutcome, SourceAdapter } from "@/platform/needs-you/adapters";
import type { Activation } from "./contracts";
import { MAKE_REAL_LIFECYCLE, planApprovalProblem, planFingerprint, type ApprovalRecordsPort } from "./approvals";
import type { AuthorityPort, EffectAdapter, LiveSystemsPort, OperatingChecksPort } from "./ports";
import type { ActivationRepository } from "./repository";
import { createMakeReal, type MakeReal } from "./runner";
import { customerActivationView } from "./view";

/**
 * Durable, live Make real (systems-experience spec behaviors 21-27).
 *
 * - The owner decides once per plan: one Needs you item (`make_real`
 *   lifecycle, revision = the plan fingerprint). Approving it starts the
 *   activation under the approving owner's identity; nothing runs in the
 *   owner's browser beyond the first pass, and the workspace-work cron
 *   resumes the rest.
 * - Authority is the approval: `system.activate` and `site.publish` are
 *   allowed only while the plan approval still resolves as approved for the
 *   current candidate, re-read before every step. Calendar, message and
 *   payment stay isolated-only: Make real refuses to start a plan with one.
 * - Each channel adapter checks its own `make_real_live:<channel>` flag.
 * - What landed stays. Nothing here rolls back on its own; a partly live
 *   activation goes to the operator queue (listOperationalExceptions).
 */

export interface LiveMakeRealDeps {
  possibilities(actor: WorkspaceActor): PossibilityRepository;
  activations(actor: WorkspaceActor): ActivationRepository;
  live(actor: WorkspaceActor): LiveSystemsPort;
  adapters(actor: WorkspaceActor, workspaceId: string): EffectAdapter[];
  approvals: ApprovalRecordsPort;
  checks?: OperatingChecksPort;
  clock?: () => string;
  ids?: () => string;
}

const LIVE_SCOPES = new Set(["system.activate", "site.publish"]);

/** Current authority = the owner's plan approval, read now, for this candidate. */
export function createApprovalAuthority(input: { approvals: ApprovalRecordsPort; possibilities: PossibilityRepository; possibilityId: string; approvalId: string | null }): AuthorityPort {
  return {
    async check(_actor, request) {
      if (!LIVE_SCOPES.has(request.scope)) return { allowed: false, reason: `${request.scope.replace(".", " ")} is not connected to Make real yet` };
      if (!input.approvalId) return { allowed: false, reason: "the owner has not approved this plan" };
      const p = await input.possibilities.get(request.businessId, input.possibilityId);
      if (!p) return { allowed: false, reason: "the possibility is no longer available" };
      const problem = planApprovalProblem(await input.approvals.get(request.businessId, input.approvalId), request.businessId, p);
      return problem ? { allowed: false, reason: problem } : { allowed: true, grantId: `approval:${input.approvalId}` };
    },
  };
}

/**
 * Operating checks after a live Make real. "site-serves" passes when every
 * accepted website effect read back as confirmed. A check with no automatic
 * runner fails with that reason, so the activation is never Made real on an
 * unchecked claim; the operator confirms it and resumes, or rolls back.
 */
export function createLiveOperatingChecks(runners: Record<string, (activation: Activation) => Promise<{ passed: boolean; detail: string }>> = {}): OperatingChecksPort {
  return {
    async run({ checkId, activation }) {
      const runner = runners[checkId];
      if (runner) return runner(activation);
      if (checkId === "site-serves") {
        const effects = activation.steps.filter((s) => s.kind === "effect" && s.effect === "accepted");
        if (!effects.length) return { passed: false, detail: "No website change was published to check." };
        const unconfirmed = effects.filter((s) => s.readBack?.status !== "confirmed");
        return unconfirmed.length
          ? { passed: false, detail: `Not confirmed yet: ${unconfirmed.map((s) => s.label).join(", ")}.` }
          : { passed: true, detail: "Every published change read back as live." };
      }
      return { passed: false, detail: "No automatic check is connected for this yet. An operator confirms it." };
    },
  };
}

export function createLiveMakeRealService(deps: LiveMakeRealDeps) {
  function makeRealFor(actor: WorkspaceActor, workspaceId: string, possibilityId: string, approvalId: string | null): MakeReal {
    const possibilities = deps.possibilities(actor);
    return createMakeReal({
      possibilities,
      activations: deps.activations(actor),
      live: deps.live(actor),
      authority: createApprovalAuthority({ approvals: deps.approvals, possibilities, possibilityId, approvalId }),
      adapters: deps.adapters(actor, workspaceId),
      checks: deps.checks ?? createLiveOperatingChecks(),
      approvals: deps.approvals,
      requirePlanApproval: true,
      ...(deps.clock ? { clock: deps.clock } : {}),
      ...(deps.ids ? { ids: deps.ids } : {}),
    });
  }

  async function forActivation(actor: WorkspaceActor, workspaceId: string, activationId: string) {
    const activation = await deps.activations(actor).get(workspaceId, activationId);
    if (!activation) throw new WorkspaceAccessError();
    const approvalId = activation.approvals[0]?.approvalId ?? null;
    return { activation, makeReal: makeRealFor(actor, workspaceId, activation.possibilityId, approvalId) };
  }

  return {
    /** Approval starts the durable activation and runs a first pass. */
    async startApproved(input: { actor: WorkspaceActor; workspaceId: string; possibilityId: string; approvalId: string }): Promise<Activation> {
      const makeReal = makeRealFor(input.actor, input.workspaceId, input.possibilityId, input.approvalId);
      const started = await makeReal.start(input.actor, input.workspaceId, input.possibilityId, { planApprovalId: input.approvalId });
      return makeReal.run(input.actor, input.workspaceId, started.id);
    },
    async read(actor: WorkspaceActor, workspaceId: string, activationId: string): Promise<Activation> {
      return (await forActivation(actor, workspaceId, activationId)).activation;
    },
    /** Operator: resume after fixing the cause. No new owner approval while the plan is unchanged. */
    async resume(actor: WorkspaceActor, workspaceId: string, activationId: string, note?: string): Promise<Activation> {
      const { makeReal } = await forActivation(actor, workspaceId, activationId);
      return makeReal.resume(actor, workspaceId, activationId, note);
    },
    async reconcile(actor: WorkspaceActor, workspaceId: string, activationId: string, input: { stepId: string; resolution: "completed" | "not_applied"; evidence: string; providerRef?: string; note?: string }): Promise<Activation> {
      const { makeReal } = await forActivation(actor, workspaceId, activationId);
      return makeReal.reconcile(actor, workspaceId, activationId, input);
    },
    async rollback(actor: WorkspaceActor, workspaceId: string, activationId: string, note?: string): Promise<Activation> {
      const { makeReal } = await forActivation(actor, workspaceId, activationId);
      return makeReal.rollback(actor, workspaceId, activationId, note);
    },
    /**
     * The workspace-work cron: continue every in-progress activation. A step
     * left running is reconciled first (provider lookup by key, never a
     * blind replay); the rest runs until it finishes or needs attention.
     */
    async resumeDue(due: Array<{ workspaceId: string; activationId: string; actor: WorkspaceActor }>, deadlineMs = 20_000): Promise<{ processed: number; failed: number; results: Array<{ activationId: string; status: string; error?: string }> }> {
      const started = Date.now();
      const results: Array<{ activationId: string; status: string; error?: string }> = [];
      let processed = 0, failed = 0;
      for (const item of due) {
        if (Date.now() - started >= deadlineMs) break;
        try {
          const { activation, makeReal } = await forActivation(item.actor, item.workspaceId, item.activationId);
          if (activation.status !== "in_progress") { results.push({ activationId: item.activationId, status: activation.status }); continue; }
          const next = activation.steps.some((s) => s.status === "running")
            ? await makeReal.resume(item.actor, item.workspaceId, item.activationId, "Resumed by Strelva after an interruption.")
            : await makeReal.run(item.actor, item.workspaceId, item.activationId);
          processed++;
          results.push({ activationId: item.activationId, status: next.status });
        } catch (error) {
          failed++;
          results.push({ activationId: item.activationId, status: "error", error: error instanceof Error ? error.message.slice(0, 500) : "The activation could not be resumed." });
        }
      }
      return { processed, failed, results };
    },
  };
}

export type LiveMakeRealService = ReturnType<typeof createLiveMakeRealService>;

/** Systems a plan changes or introduces, by name, for the owner's item. */
function changedNames(p: Possibility, names: ReadonlyMap<string, string>): string[] {
  return [...p.changes.map((c) => names.get(c.baseline.systemId) ?? "a System"), ...p.introduces.map((i) => i.name)];
}

/**
 * The Needs you source for Make real. One item per Ready Possibility, keyed
 * by the plan fingerprint, so any candidate change supersedes the emailed
 * ask (and the stale trigger withdraws it in the same transaction). Approve
 * starts the durable activation; Not yet changes nothing.
 */
export function createMakeRealNeedsYouAdapter(deps: {
  enabled(workspaceId: string): Promise<boolean>;
  readReady(workspaceId: string): Promise<Possibility[]>;
  systemNames(workspaceId: string): Promise<ReadonlyMap<string, string>>;
  service: Pick<LiveMakeRealService, "startApproved">;
  /** The signed "Try it" path for this candidate, so an owner who never signs in can try it from the email. */
  previewPath?(workspaceId: string, p: Possibility): string | null;
}): SourceAdapter {
  return {
    lifecycle: MAKE_REAL_LIFECYCLE,
    // Starting the activation is a workspace write: it needs the owner's identity.
    needsMemberActor: true,
    async propose(ctx: AdapterContext) {
      if (!(await deps.enabled(ctx.workspaceId))) return { items: [], complete: true };
      const [ready, names] = await Promise.all([deps.readReady(ctx.workspaceId), deps.systemNames(ctx.workspaceId).catch(() => new Map<string, string>())]);
      const items: ProposedItem[] = ready.map((p) => {
        const changed = changedNames(p, names);
        return {
          kind: p.introduces.length ? "system.go_live" : "system.change_live",
          route: "owner_decides",
          systemId: p.changes[0]?.baseline.systemId ?? null,
          title: `Make ${p.title} live?`.slice(0, 200),
          detail: `Changes ${changed.join(", ")}. Try it first; nothing live changes until you say so.`.slice(0, 1000),
          approveEffect: "Strelva makes it live and tells you what landed.",
          notYetEffect: "Nothing changes. It stays ready.",
          sourceLifecycle: MAKE_REAL_LIFECYCLE,
          sourceId: p.id,
          revisionHash: planFingerprint(p),
          urgent: false,
          adminMayDecide: false,
          openHref: deps.previewPath?.(ctx.workspaceId, p) ?? `/workspace?workspaceId=${encodeURIComponent(ctx.workspaceId)}&possibility=${encodeURIComponent(p.id)}`,
        } satisfies ProposedItem;
      });
      return { items, complete: true };
    },
    async currentRevision(ctx, sourceId) {
      const p = (await deps.readReady(ctx.workspaceId)).find((item) => item.id === sourceId);
      return p ? planFingerprint(p) : null;
    },
    async resolve(ctx: AdapterContext, item: OwnerDecision, decision: Decision, by: ResolveBy): Promise<ResolveOutcome> {
      if (decision !== "approve") return { outcome: "done", reason: "Nothing changed. It stays ready." };
      const actor = by.kind === "expiry" ? null : by.actor;
      if (!actor) return { outcome: "failed", reason: "Sign in to make this live." };
      try {
        const activation = await deps.service.startApproved({ actor, workspaceId: ctx.workspaceId, possibilityId: item.sourceId, approvalId: item.id });
        const view = customerActivationView(activation, item.title.replace(/^Make (.*) live\?$/, "$1"));
        if (activation.status === "made_real") return { outcome: "done", receiptRef: activation.id };
        return { outcome: "done_unverified", reason: view.headline, receiptRef: activation.id };
      } catch (error) {
        const reason = error instanceof WorkspaceConflictError || error instanceof WorkspaceAccessError ? error.message : "Make real could not start.";
        return { outcome: "failed", reason: reason.slice(0, 500) };
      }
    },
  };
}
