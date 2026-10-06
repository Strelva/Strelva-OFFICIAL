/**
 * Make real (systems-experience spec 21): the owner decides once per plan.
 *
 * A Ready Possibility opens one Needs you item. Its revision is the plan
 * fingerprint (`planFingerprint` in src/platform/make-real/approvals.ts),
 * which covers every effect, change, Connection and introduced System of
 * that candidate revision, so a changed candidate supersedes the item and
 * any emailed link refuses.
 *
 * The item IS the approval record. Approving claims it (state `approved`),
 * then resolves through Make real's own resolver, started with the item id as
 * the plan approval. Make real re-reads the record before activation and
 * before every publish step (`planApprovalAuthority`), and each effect that
 * needs an approval must sit inside the approved plan (`approvalProblem`).
 * Not yet and a lapse change nothing: the Possibility stays Ready.
 *
 * Make real today runs on an isolated copy (src/platform/make-real/sandbox):
 * nothing live changes. The outcome says so instead of claiming it went live.
 */
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { ServiceSession } from "../service-actor";
import { createNeedsYouApprovalRecords, makeRealSourceId, splitMakeRealSource, type ApprovalRecordsPort } from "@/platform/make-real/approvals";
import { evaluateRoute } from "../evaluator";
import type { OwnerDecision, PolicySetting, ProposedItem } from "../contracts";
import type { SourceAdapter } from "../adapters";

export interface ReadyPlan {
  possibilityId: string;
  candidateRevision: number;
  fingerprint: string;
  title: string;
  intent: string;
  affects: string[];
  introducesSystem: boolean;
  systemId: string;
  /** A stored Possibility with a live Make real channel on: runs live (src/platform/make-real/live.ts), not on the isolated copy. */
  live?: boolean;
  /** Where the owner tries it first (the signed "Try it" link for live plans). */
  openHref?: string;
  /**
   * The website rebuild this plan came from (`rebuildWorkId`). A stored live
   * plan and the per-request isolated plan of the same rebuild are one ask:
   * the live one wins.
   */
  sourceRebuild?: string;
}

/** Live plans first; an isolated plan is dropped when a live plan has its id or its source rebuild. */
export function dedupeReadyPlans(live: readonly ReadyPlan[], isolated: readonly ReadyPlan[]): ReadyPlan[] {
  const liveIds = new Set(live.map((plan) => plan.possibilityId));
  const liveRebuilds = new Set(live.flatMap((plan) => plan.sourceRebuild ? [plan.sourceRebuild] : []));
  const kept: ReadyPlan[] = [...live];
  const seenRebuilds = new Set(liveRebuilds);
  for (const plan of isolated) {
    if (liveIds.has(plan.possibilityId)) continue;
    if (plan.sourceRebuild) {
      if (seenRebuilds.has(plan.sourceRebuild)) continue;
      seenRebuilds.add(plan.sourceRebuild);
    }
    kept.push(plan);
  }
  return kept;
}

export interface MakeRealRunResult {
  status: string;
  /** Ran on an isolated copy: nothing live changed. */
  isolated: boolean;
  liveUnchanged: boolean;
  headline: string;
  /** A live run's activation id (the receipt). */
  activationId?: string;
}

export interface MakeRealSourcePorts {
  /** Systems (and so Make real) is on for this business. */
  enabled(workspaceId: string, actor: WorkspaceActor): Promise<boolean>;
  readyPlans(actor: WorkspaceActor, workspaceId: string): Promise<ReadyPlan[]>;
  /** Live plans (stored Possibilities with a live channel on), readable without a session, so an owner who never signs in still gets the ask. */
  livePlans?(workspaceId: string): Promise<ReadyPlan[]>;
  policies(actor: WorkspaceActor, workspaceId: string): Promise<PolicySetting[]>;
  /** Make real's own resolver, started with the owner's plan approval. Null: the plan is no longer this business's. */
  start(actor: WorkspaceActor, workspaceId: string, possibilityId: string, approvalId: string): Promise<MakeRealRunResult | null>;
  /**
   * Logs Strelva (system)'s one run under a `make_real_link` session before
   * Make real starts (record_strelva_service_action). Without it, a link
   * decision from an owner with no account runs nothing.
   */
  recordLinkRun?(session: ServiceSession, subject: string, detail: string): Promise<void>;
}

export { makeRealSourceId };
const splitSource = splitMakeRealSource;

export function makeRealItem(plan: ReadyPlan, workspaceId: string, policies: readonly PolicySetting[]): ProposedItem | null {
  if (!/^[0-9a-f]{64}$/.test(plan.fingerprint)) return null;
  const kind = plan.introducesSystem ? "system.go_live" : "system.change_live";
  const evaluation = evaluateRoute({ kind, origin: "strelva", systemId: plan.systemId, policies });
  if (evaluation.route !== "owner_decides" && evaluation.route !== "strelva_reviews") return null;
  const affects = plan.affects.length ? ` It changes ${plan.affects.join(" and ")}.` : "";
  return {
    kind,
    route: evaluation.route,
    systemId: plan.systemId,
    title: `Make it live: ${plan.title}`.slice(0, 200).trim(),
    detail: `${plan.intent}${affects}`.slice(0, 600),
    approveEffect: "Strelva makes it live one step at a time and tells you what landed.",
    notYetEffect: "Nothing changes. It stays a Possibility you can open.",
    sourceLifecycle: "make_real",
    sourceId: makeRealSourceId(plan.possibilityId, plan.candidateRevision),
    revisionHash: plan.fingerprint,
    urgent: false,
    // Approve Make real: the owner, one tap. Not an admin (spec authority table).
    adminMayDecide: false,
    openHref: plan.openHref ?? `/workspace?view=system&system=${encodeURIComponent(plan.systemId)}&workspaceId=${encodeURIComponent(workspaceId)}`,
  };
}

export function makeRealAdapter(ports: MakeRealSourcePorts): SourceAdapter {
  async function plans(actor: WorkspaceActor | undefined, workspaceId: string): Promise<ReadyPlan[]> {
    const live = ports.livePlans ? await ports.livePlans(workspaceId) : [];
    const isolated = actor && (await ports.enabled(workspaceId, actor)) ? await ports.readyPlans(actor, workspaceId) : [];
    return dedupeReadyPlans(live, isolated);
  }
  return {
    lifecycle: "make_real",
    needsMemberActor: true,
    // Owner-entry decision 6: a signed link decides a Make real plan even when
    // the owner has no account. Strelva (system) reads and runs it, bound to
    // the item; the owner stays the approver of record.
    ownerLinkWithoutAccount: Boolean(ports.recordLinkRun),
    async propose(ctx) {
      if (!ctx.actor && !ports.livePlans) return { items: [], complete: false };
      try {
        const ready = await plans(ctx.actor, ctx.workspaceId);
        // Without a session only live plans can be read: the rest are unknown, not absent.
        if (!ready.length) return { items: [], complete: Boolean(ctx.actor) };
        const policies = ctx.actor ? await ports.policies(ctx.actor, ctx.workspaceId).catch(() => []) : [];
        return { items: ready.flatMap((plan) => makeRealItem(plan, ctx.workspaceId, policies) ?? []), complete: Boolean(ctx.actor) };
      } catch {
        return { items: [], complete: false };
      }
    },
    async currentRevision(ctx, sourceId) {
      if (!ctx.actor && !ports.livePlans) return null;
      const source = splitSource(sourceId);
      if (!source) return null;
      const plan = (await plans(ctx.actor, ctx.workspaceId)).find((item) => item.possibilityId === source.possibilityId);
      if (!plan) return null;
      // A new candidate revision is a new plan: this item no longer waits on anyone.
      return plan.candidateRevision === source.candidateRevision ? plan.fingerprint : null;
    },
    async resolve(ctx, item, decision, by) {
      if (by.kind === "expiry") return { outcome: "done", reason: "Expired, nothing changed" };
      if (decision === "not_yet") return { outcome: "done", reason: "Not yet: it stays a Possibility." };
      const actor = by.actor;
      if (!actor) return { outcome: "failed", reason: "owner_not_member" };
      const source = splitSource(item.sourceId);
      if (!source) return { outcome: "failed", reason: "source_invalid" };
      const service = by.kind === "owner_link" ? by.service ?? null : null;
      if (service && (service.purpose !== "make_real_link" || service.workspaceId !== ctx.workspaceId)) {
        return { outcome: "failed", reason: "service_session_invalid: nothing ran" };
      }
      // The plan fingerprint is re-checked at decision time, after the claim:
      // a candidate that changed since the link was sent runs nothing.
      let current: ReadyPlan | undefined;
      try {
        current = (await plans(actor, ctx.workspaceId)).find((plan) => plan.possibilityId === source.possibilityId);
      } catch {
        return { outcome: "failed", reason: "plan_unreadable: nothing ran" };
      }
      if (!current || current.candidateRevision !== source.candidateRevision || current.fingerprint !== item.revisionHash) {
        return { outcome: "failed", reason: "plan_changed: the plan changed after it was sent, so nothing ran" };
      }
      if (service) {
        // Logged before it runs: nothing runs as Strelva (system) unrecorded.
        try {
          if (!ports.recordLinkRun) throw new Error("no log");
          await ports.recordLinkRun(service, `possibility:${source.possibilityId}@${source.candidateRevision}`.slice(0, 300),
            `Make real started by Strelva (system) on the owner's link approval (${item.id}).`);
        } catch {
          return { outcome: "failed", reason: "service_log_failed: Strelva couldn't log the run, so nothing ran" };
        }
      }
      let result: MakeRealRunResult | null;
      try {
        result = await ports.start(actor, ctx.workspaceId, source.possibilityId, item.id);
      } catch (error) {
        return { outcome: "failed", reason: `make_real_refused: ${error instanceof Error ? error.message : "unknown"}`.slice(0, 500) };
      }
      if (!result) return { outcome: "failed", reason: "possibility_unavailable" };
      const receiptRef = result.activationId ?? `make_real:${source.possibilityId}@${source.candidateRevision}`;
      if (result.isolated || result.liveUnchanged) {
        return { outcome: "done", reason: `Approved. Make real ran on an isolated copy: nothing live changed yet. ${result.headline}`.slice(0, 500), receiptRef };
      }
      return { outcome: "done", reason: result.headline.slice(0, 500), receiptRef };
    },
  };
}

/**
 * Make real's approval store, read from Needs you: the one reader
 * (createNeedsYouApprovalRecords) for isolated and live runs alike. An
 * approval id is an owner_decisions id of lifecycle `make_real`; it approves
 * only while that item is `approved` and its outcome isn't `failed`.
 */
export function needsYouMakeRealApprovals(read: (workspaceId: string, itemId: string) => Promise<OwnerDecision | null>): ApprovalRecordsPort {
  return createNeedsYouApprovalRecords({ read: async (workspaceId, itemId) => read(workspaceId, itemId).catch(() => null) });
}
