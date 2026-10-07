/**
 * Needs you source: accepting a work plan's output (needs-you spec section 6,
 * "Work plan accept" → request.scope).
 *
 * A saved plan (`src/products/work-plans`) holds proposed outputs that are
 * data only until someone accepts one through the execution route. What waits
 * on the owner is each output of a `ready` plan that:
 * - has a reviewable draft (so accepting needs no further input),
 * - asks no required decision and needs no required input (those need
 *   answers the owner types on the plan; Approve can't supply them, so the
 *   plan's own screen keeps them), and
 * - has no output execution receipt yet.
 *
 * Approve runs the lifecycle's own `executeWorkPlanOutput` (the same path as
 * POST /api/work-plans/execute), which rechecks membership, plan revision and
 * source freshness and writes the output and its receipt together. A replay
 * returns `already_completed` rather than a second output.
 *
 * Not yet and a lapse change nothing: the plan keeps its outputs.
 */
import { createHash } from "node:crypto";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { ProposedItem } from "../contracts";
import type { SourceAdapter } from "../adapters";

/** The slice of a saved plan the adapter reads. */
export interface WorkPlanView {
  workId: string;
  workspaceId: string;
  status: "ready" | "needs_scoping";
  userGoal: string;
  /** Saved plans have one revision today; executions name it. */
  revision: number;
  requiredDecisions: { id: string }[];
  /** The plan still needs an input marked required; execution refuses until the plan is revised. */
  hasRequiredInputs: boolean;
  outputs: { id: string; title: string; description: string; hasDraft: boolean }[];
  /** Output ids that already have an execution receipt. */
  executedOutputIds: string[];
}

export interface WorkPlanPorts {
  list(actor: WorkspaceActor, workspaceId: string): Promise<WorkPlanView[]>;
  read(actor: WorkspaceActor, workspaceId: string, planWorkId: string): Promise<WorkPlanView | null>;
  /** The work plans lifecycle's own output execution. */
  execute(actor: WorkspaceActor, input: { workspaceId: string; planWorkId: string; outputId: string; expectedPlanRevision: number }): Promise<{ status: "completed" | "already_completed"; nativeWorkId: string }>;
}

function waiting(plan: WorkPlanView, outputId: string): boolean {
  if (plan.status !== "ready" || plan.requiredDecisions.length > 0 || plan.hasRequiredInputs) return false;
  const output = plan.outputs.find(row => row.id === outputId);
  return Boolean(output && output.hasDraft && !plan.executedOutputIds.includes(outputId));
}

function revision(plan: WorkPlanView, outputId: string): string {
  return createHash("sha256").update(JSON.stringify(["work_plan", plan.workId, plan.revision, outputId, plan.status])).digest("hex");
}

export function workPlanItems(plan: WorkPlanView): ProposedItem[] {
  return plan.outputs.filter(output => waiting(plan, output.id)).map(output => ({
    kind: "request.scope" as const,
    route: "owner_decides" as const,
    title: `Accept from your plan: ${output.title.replace(/\s+/g, " ").trim()}`.slice(0, 200).trim(),
    detail: output.description.slice(0, 600),
    approveEffect: "Strelva saves this as a draft in your workspace. Nothing goes live.",
    notYetEffect: "Nothing changes; the plan keeps it.",
    sourceLifecycle: "work_plan" as const,
    sourceId: `${plan.workId}:${output.id}`,
    revisionHash: revision(plan, output.id),
    urgent: false,
    adminMayDecide: true,
    openHref: `/workspace?workspaceId=${encodeURIComponent(plan.workspaceId)}&work=${encodeURIComponent(plan.workId)}`,
  }));
}

function split(sourceId: string): { planWorkId: string; outputId: string } | null {
  const at = sourceId.indexOf(":");
  if (at <= 0 || at === sourceId.length - 1) return null;
  return { planWorkId: sourceId.slice(0, at), outputId: sourceId.slice(at + 1) };
}

export function workPlanAdapter(ports: WorkPlanPorts): SourceAdapter {
  async function find(actor: WorkspaceActor, workspaceId: string, sourceId: string) {
    const source = split(sourceId);
    if (!source) return null;
    const plan = await ports.read(actor, workspaceId, source.planWorkId);
    if (!plan || plan.workspaceId !== workspaceId || !waiting(plan, source.outputId)) return null;
    return { plan, outputId: source.outputId };
  }
  return {
    lifecycle: "work_plan",
    needsMemberActor: true,
    ownerLinkWithoutAccount: true,
    async propose(ctx) {
      if (!ctx.actor) return { items: [], complete: false };
      try {
        const plans = await ports.list(ctx.actor, ctx.workspaceId);
        return { items: plans.filter(plan => plan.workspaceId === ctx.workspaceId).flatMap(workPlanItems), complete: true };
      } catch {
        return { items: [], complete: false };
      }
    },
    async currentRevision(ctx, sourceId) {
      if (!ctx.actor) return null;
      const found = await find(ctx.actor, ctx.workspaceId, sourceId);
      return found ? revision(found.plan, found.outputId) : null;
    },
    async resolve(ctx, item, decision, by) {
      if (by.kind === "expiry") return { outcome: "done", reason: "Expired, nothing changed" };
      if (decision === "not_yet") return { outcome: "done", reason: "Not yet" };
      const actor = by.actor;
      if (!actor) return { outcome: "failed", reason: "owner_not_member" };
      try {
        const found = await find(actor, ctx.workspaceId, item.sourceId);
        if (!found) return { outcome: "done", reason: "already_resolved" };
        const result = await ports.execute(actor, { workspaceId: ctx.workspaceId, planWorkId: found.plan.workId, outputId: found.outputId, expectedPlanRevision: found.plan.revision });
        return { outcome: "done", ...(result.status === "already_completed" ? { reason: "already_resolved" } : {}), receiptRef: `work_plan_output:${found.plan.workId}:${found.outputId}:${result.nativeWorkId}` };
      } catch {
        return { outcome: "failed", reason: "resolver_failed" };
      }
    },
  };
}
