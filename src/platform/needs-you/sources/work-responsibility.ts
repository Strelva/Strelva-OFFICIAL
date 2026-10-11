/**
 * Finite responsibilities (a proposed piece of work) as Needs you items
 * (`request.scope`: agree the work before it starts).
 *
 * Approve runs the lifecycle's own `approve` command
 * (`workspaceResponsibilityCommands.command`, which also checks the payer
 * accepted any budget). Paid work without an attached budget isn't proposed:
 * the payer has to accept a budget first, on the work screen. Today only the
 * work's creator may approve; anyone else gets `failed: not_creator` and the
 * work keeps waiting. Not yet and expiry change nothing.
 */
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { Responsibility } from "@/platform/work-execution/engine";
import type { ProposedItem } from "../contracts";
import type { SourceAdapter } from "../adapters";
import { itemDetail, itemTitle, memberActor, proposeAsMember, revisionOf, unchangedOutcome, workspaceHref } from "./shared";

export interface WorkResponsibilityRecord { id: string; workspaceId: string; payload: Responsibility }

export interface WorkResponsibilityPorts {
  list(actor: WorkspaceActor, workspaceId: string): Promise<WorkResponsibilityRecord[]>;
  approve(actor: WorkspaceActor, workId: string, expectedRevision: number): Promise<WorkResponsibilityRecord>;
}

function decidable(work: Responsibility): boolean {
  return work.status === "proposed" && !(work.steps.some(step => step.maximumCents > 0) && !work.budgetId);
}

function workRevision(record: WorkResponsibilityRecord): string {
  return revisionOf("work_responsibility", record.id, record.payload.revision, record.payload.status, record.payload.budgetId ?? null);
}

export function workResponsibilityItem(record: WorkResponsibilityRecord): ProposedItem | null {
  if (!decidable(record.payload)) return null;
  return {
    kind: "request.scope",
    route: "owner_decides",
    title: itemTitle(`Agree this work: ${record.payload.title}`),
    detail: itemDetail(record.payload.intent),
    approveEffect: "The work is agreed and starts.",
    notYetEffect: "Nothing starts; it waits for you.",
    sourceLifecycle: "work_responsibility",
    sourceId: record.id,
    revisionHash: workRevision(record),
    urgent: false,
    adminMayDecide: true,
    openHref: workspaceHref(record.workspaceId, { work: record.id }),
  };
}

export function workResponsibilityAdapter(ports: WorkResponsibilityPorts): SourceAdapter {
  async function find(actor: WorkspaceActor, workspaceId: string, workId: string) {
    const record = (await ports.list(actor, workspaceId)).find(row => row.id === workId && row.workspaceId === workspaceId);
    return record && decidable(record.payload) ? record : null;
  }
  return {
    lifecycle: "work_responsibility",
    needsMemberActor: true,
    ownerLinkWithoutAccount: true,
    propose: (ctx) => proposeAsMember(ctx, async actor =>
      (await ports.list(actor, ctx.workspaceId)).filter(row => row.workspaceId === ctx.workspaceId).flatMap(row => workResponsibilityItem(row) ?? [])),
    async currentRevision(ctx, sourceId) {
      if (!ctx.actor) return null;
      const record = await find(ctx.actor, ctx.workspaceId, sourceId);
      return record ? workRevision(record) : null;
    },
    async resolve(ctx, item, decision, by) {
      const unchanged = unchangedOutcome(decision, by);
      if (unchanged) return unchanged;
      const actor = memberActor(by);
      if (!actor) return { outcome: "failed", reason: "owner_not_member" };
      try {
        const record = await find(actor, ctx.workspaceId, item.sourceId);
        if (!record) return { outcome: "done", reason: "already_resolved" };
        if (workRevision(record) !== item.revisionHash) return { outcome: "failed", reason: "source_changed" };
        if (record.payload.ownerId !== actor.userId) return { outcome: "failed", reason: "not_creator" };
        const approved = await ports.approve(actor, record.id, record.payload.revision);
        if (!approved.payload.approvedAt) return { outcome: "failed", reason: "not_approved" };
        return { outcome: "done", receiptRef: `work_responsibility:${approved.id}:${approved.payload.revision}` };
      } catch {
        return { outcome: "failed", reason: "resolver_failed" };
      }
    },
  };
}
