import { WorkspaceAccessError, type WorkspaceActor } from "@/platform/workspaces/types";
import type { Possibility } from "@/platform/possibilities/contracts";
import type { PossibilityRepository } from "@/platform/possibilities/repository";
import type { MakeRealRunResult, ReadyPlan } from "@/platform/needs-you/sources/make-real";
import type { Activation } from "./contracts";
import { planApprovalProblem, planFingerprint, type ApprovalRecordsPort } from "./approvals";
import type { NativeGoogleCompletedUndo, AuthorityPort, EffectAdapter, LiveSystemsPort, OperatingChecksPort } from "./ports";
import type { ActivationRepository } from "./repository";
import { createMakeReal, type MakeReal } from "./runner";
import { customerActivationView } from "./view";
import { STRELVA_SYSTEM_LABEL, type ServiceAction, type ServiceSession } from "@/platform/needs-you/service-actor";

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

export interface LiveMakeRealServiceContext {
  session: ServiceSession;
  approvalId: string | null;
  possibilityId: string;
  activationId?: string;
}

export interface LiveMakeRealDeps {
  possibilities(actor: WorkspaceActor): PossibilityRepository;
  activations(actor: WorkspaceActor): ActivationRepository;
  live(actor: WorkspaceActor): LiveSystemsPort;
  adapters(actor: WorkspaceActor, workspaceId: string, service?: LiveMakeRealServiceContext): EffectAdapter[];
  approvals: ApprovalRecordsPort;
  checks?: OperatingChecksPort;
  nativeGoogleUndoOwner?: (actor:WorkspaceActor,workspaceId:string)=>Promise<boolean>;
  clock?: () => string;
  ids?: () => string;
  /** Strelva (system)'s log (record_strelva_service_action). Required to run under a service session. */
  recordService?: (session: ServiceSession, action: ServiceAction, subject: string, detail?: string) => Promise<void>;
}

/**
 * One activation for the workspace-work cron. `service` set: it runs as
 * Strelva (system) for this business (`actor` is that session's identity);
 * the owner stays approver of record. Unset: it runs as its starter, as before.
 */
export interface DueActivation {
  workspaceId: string;
  activationId: string;
  actor: WorkspaceActor;
  service?: ServiceSession;
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
      if (checkId === "site-serves" || checkId === "inquiry-rule-live") {
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
  function makeRealFor(actor: WorkspaceActor, workspaceId: string, possibilityId: string, approvalId: string | null, session?: ServiceSession, activationId?: string, nativeUndo=false): MakeReal {
    if (session && (session.workspaceId !== workspaceId || session.actor.userId !== actor.userId || session.actor.verifiedEmail !== actor.verifiedEmail || !["make_real_link", "make_real_resume"].includes(session.purpose))) throw new WorkspaceAccessError();
    const possibilities = deps.possibilities(actor);
    const approved=createApprovalAuthority({approvals:deps.approvals,possibilities,possibilityId,approvalId});
    return createMakeReal({
      possibilities,
      activations: deps.activations(actor),
      live: deps.live(actor),
      authority: nativeUndo?{async check(actor,request){if(!deps.nativeGoogleUndoOwner || !(await deps.nativeGoogleUndoOwner(actor,request.businessId)))return {allowed:false,reason:"Current native Google business owner required for governed undo."};return approved.check(actor,request);}}:approved,
      adapters: session ? deps.adapters(actor, workspaceId, { session, approvalId, possibilityId, ...(activationId ? { activationId } : {}) }) : deps.adapters(actor, workspaceId),
      checks: deps.checks ?? createLiveOperatingChecks(),
      approvals: deps.approvals,
      requirePlanApproval: true,
      ...(deps.clock ? { clock: deps.clock } : {}),
      ...(deps.ids ? { ids: deps.ids } : {}),
    });
  }

  async function forActivation(actor: WorkspaceActor, workspaceId: string, activationId: string, session?: ServiceSession) {
    const activation = await deps.activations(actor).get(workspaceId, activationId);
    if (!activation) throw new WorkspaceAccessError();
    const approvalId = activation.approvals[0]?.approvalId ?? null;
    return { activation, makeReal: makeRealFor(actor, workspaceId, activation.possibilityId, approvalId, session, activationId) };
  }

  return {
    /** Approval starts the durable activation and runs a first pass. */
    async startApproved(input: { actor: WorkspaceActor; workspaceId: string; possibilityId: string; approvalId: string; service?: ServiceSession }): Promise<Activation> {
      const makeReal = makeRealFor(input.actor, input.workspaceId, input.possibilityId, input.approvalId, input.service);
      const started = await makeReal.start(input.actor, input.workspaceId, input.possibilityId, { planApprovalId: input.approvalId });
      return makeReal.run(input.actor, input.workspaceId, started.id);
    },
    async read(actor: WorkspaceActor, workspaceId: string, activationId: string): Promise<Activation> {
      return (await forActivation(actor, workspaceId, activationId)).activation;
    },
    /** Operator: resume after fixing the cause. No new owner approval while the plan is unchanged. */
    async resume(actor: WorkspaceActor, workspaceId: string, activationId: string, note?: string, service?: ServiceSession): Promise<Activation> {
      const { makeReal } = await forActivation(actor, workspaceId, activationId, service);
      return makeReal.resume(actor, workspaceId, activationId, note);
    },
    async reconcile(actor: WorkspaceActor, workspaceId: string, activationId: string, input: { stepId: string; resolution: "completed" | "not_applied"; evidence: string; providerRef?: string; note?: string; target?: "effect" | "compensation" }, service?: ServiceSession): Promise<Activation> {
      const { makeReal } = await forActivation(actor, workspaceId, activationId, service);
      return makeReal.reconcile(actor, workspaceId, activationId, input);
    },
    async rollback(actor: WorkspaceActor, workspaceId: string, activationId: string, note?: string, service?: ServiceSession): Promise<Activation> {
      const { makeReal } = await forActivation(actor, workspaceId, activationId, service);
      return makeReal.rollback(actor, workspaceId, activationId, note);
    },
    async completeNativeGoogle(actor:WorkspaceActor,workspaceId:string,activationId:string,frame:NativeGoogleCompletedUndo):Promise<Activation> {
      if(!deps.nativeGoogleUndoOwner || !(await deps.nativeGoogleUndoOwner(actor,workspaceId)))throw new WorkspaceAccessError("Current native Google business owner required for completion recovery.");
      const activation=await deps.activations(actor).get(workspaceId,activationId);if(!activation)throw new WorkspaceAccessError();
      return makeRealFor(actor,workspaceId,activation.possibilityId,activation.approvals[0]?.approvalId??null,undefined,activationId,true).completeNativeGoogle(actor,workspaceId,activationId,frame);
    },
    async rollbackNativeGoogle(actor:WorkspaceActor,workspaceId:string,activationId:string,frame:NativeGoogleCompletedUndo,note?:string):Promise<Activation> {
      if(!deps.nativeGoogleUndoOwner || !(await deps.nativeGoogleUndoOwner(actor,workspaceId)))throw new WorkspaceAccessError("Current native Google business owner required for governed undo.");
      const activation=await deps.activations(actor).get(workspaceId,activationId);if(!activation)throw new WorkspaceAccessError();
      const makeReal=makeRealFor(actor,workspaceId,activation.possibilityId,activation.approvals[0]?.approvalId??null,undefined,activationId,true);
      return makeReal.rollback(actor,workspaceId,activationId,note,frame);
    },

    /**
     * The workspace-work cron: continue every in-progress activation. A step
     * left running is reconciled first (provider lookup by key, never a
     * blind replay); the rest runs until it finishes or needs attention.
     */
    async resumeDue(due: DueActivation[], deadlineMs = 20_000): Promise<{ processed: number; failed: number; results: Array<{ activationId: string; status: string; error?: string }> }> {
      const started = Date.now();
      const results: Array<{ activationId: string; status: string; error?: string }> = [];
      let processed = 0, failed = 0;
      for (const item of due) {
        if (Date.now() - started >= deadlineMs) break;
        try {
          if (item.service && (item.service.purpose !== "make_real_resume" || item.service.workspaceId !== item.workspaceId)) throw new WorkspaceAccessError();
          const { activation, makeReal } = await forActivation(item.actor, item.workspaceId, item.activationId, item.service);
          if (activation.status !== "in_progress") { results.push({ activationId: item.activationId, status: activation.status }); continue; }
          const reconciling = activation.steps.some((s) => s.status === "running");
          const by = item.service ? STRELVA_SYSTEM_LABEL : "Strelva";
          const approval = activation.approvals[0]?.approvalId;
          const note = `Resumed by ${by} after an interruption.${approval ? ` The owner's approval ${approval} stands.` : ""}`;
          // Logged before it runs: nothing runs as Strelva (system) unrecorded.
          if (item.service) {
            if (!deps.recordService) throw new WorkspaceAccessError("Strelva (system) can't run Make real without its log.");
            await deps.recordService(item.service, reconciling ? "resume" : "run", `activation:${item.activationId}`, note);
          }
          const next = reconciling
            ? await makeReal.resume(item.actor, item.workspaceId, item.activationId, note)
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
 * A stored Ready Possibility as a plan for the one Make real Needs you source
 * (src/platform/needs-you/sources/make-real.ts). Its revision is the plan
 * fingerprint, so any candidate change supersedes the emailed ask. There is
 * no second `make_real` adapter: live and isolated plans share that source,
 * its item shape and its approval reader.
 */
export function liveReadyPlan(p: Possibility, names: ReadonlyMap<string, string>, openHref?: string | null): ReadyPlan {
  const rebuild = p.changes.map((change) => change.candidate.content.rebuildWorkId).find((value): value is string => typeof value === "string" && value.length > 0);
  return {
    ...(rebuild ? { sourceRebuild: rebuild } : {}),
    possibilityId: p.id,
    candidateRevision: p.candidateRevision,
    fingerprint: planFingerprint(p),
    title: p.title,
    intent: p.intent,
    affects: changedNames(p, names),
    introducesSystem: p.introduces.length > 0,
    systemId: p.changes[0]?.baseline.systemId ?? p.introduces[0]?.key ?? p.id,
    live: true,
    ...(openHref ? { openHref } : {}),
  };
}

/** Start an approved live plan and say what landed, for the Needs you outcome. */
export async function startLiveApproved(
  service: Pick<LiveMakeRealService, "startApproved">,
  input: { actor: WorkspaceActor; workspaceId: string; possibilityId: string; approvalId: string; title: string; service?: ServiceSession },
): Promise<MakeRealRunResult> {
  // A refusal throws; the Needs you source records it as a failed outcome.
  const activation = await service.startApproved(input);
  const view = customerActivationView(activation, input.title);
  return { status: activation.status, isolated: false, liveUnchanged: false, headline: activation.status === "made_real" ? "Live." : view.headline, activationId: activation.id };
}
