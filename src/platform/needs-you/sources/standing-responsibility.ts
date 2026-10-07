/**
 * Standing responsibilities (Running) as Needs you items (`running.approve`).
 *
 * A proposed policy version is one decision. Approving it runs the
 * lifecycle's own `approve` command (`commandStandingResponsibility` →
 * `update_standing_responsibility`); after that each admitted run is handled
 * under the approved policy and is never asked again. A new version (an
 * `update`) goes back to `proposed` and asks once more.
 *
 * Today the database lets only the policy's creator approve it. An owner or
 * admin who isn't the creator gets `failed: not_creator` and the policy keeps
 * waiting. Not yet and expiry change nothing.
 */
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { StandingResponsibilityRecord } from "@/platform/work-execution/standing-repository";
import type { ProposedItem } from "../contracts";
import type { SourceAdapter } from "../adapters";
import { itemDetail, itemTitle, memberActor, proposeAsMember, revisionOf, unchangedOutcome, workspaceHref } from "./shared";

export interface StandingResponsibilityPorts {
  list(actor: WorkspaceActor, workspaceId: string): Promise<StandingResponsibilityRecord[]>;
  approve(actor: WorkspaceActor, standingId: string, expectedRevision: number): Promise<StandingResponsibilityRecord>;
}

function standingRevision(record: StandingResponsibilityRecord): string {
  return revisionOf("standing_responsibility", record.id, record.policy.version, record.policy.revision, record.policy.status);
}

export function standingResponsibilityItem(record: StandingResponsibilityRecord): ProposedItem | null {
  if (record.policy.status !== "proposed") return null;
  return {
    kind: "running.approve",
    route: "owner_decides",
    title: itemTitle(`Let Strelva keep doing this: ${record.policy.title}`),
    detail: itemDetail(record.policy.intent),
    approveEffect: "Strelva runs this on its schedule and reports each run. You aren't asked again unless it changes.",
    notYetEffect: "Nothing runs; it waits for you.",
    sourceLifecycle: "standing_responsibility",
    sourceId: record.id,
    revisionHash: standingRevision(record),
    urgent: false,
    adminMayDecide: true,
    openHref: workspaceHref(record.workspaceId, { view: "operations" }),
  };
}

export function standingResponsibilityAdapter(ports: StandingResponsibilityPorts): SourceAdapter {
  async function find(actor: WorkspaceActor, workspaceId: string, standingId: string) {
    const record = (await ports.list(actor, workspaceId)).find(row => row.id === standingId && row.workspaceId === workspaceId);
    return record && record.policy.status === "proposed" ? record : null;
  }
  return {
    lifecycle: "standing_responsibility",
    needsMemberActor: true,
    ownerLinkWithoutAccount: true,
    propose: (ctx) => proposeAsMember(ctx, async actor =>
      (await ports.list(actor, ctx.workspaceId)).filter(row => row.workspaceId === ctx.workspaceId).flatMap(row => standingResponsibilityItem(row) ?? [])),
    async currentRevision(ctx, sourceId) {
      if (!ctx.actor) return null;
      const record = await find(ctx.actor, ctx.workspaceId, sourceId);
      return record ? standingRevision(record) : null;
    },
    async resolve(ctx, item, decision, by) {
      const unchanged = unchangedOutcome(decision, by);
      if (unchanged) return unchanged;
      const actor = memberActor(by);
      if (!actor) return { outcome: "failed", reason: "owner_not_member" };
      try {
        const record = await find(actor, ctx.workspaceId, item.sourceId);
        if (!record) return { outcome: "done", reason: "already_resolved" };
        if (record.policy.ownerId !== actor.userId) return { outcome: "failed", reason: "not_creator" };
        const approved = await ports.approve(actor, record.id, record.policy.revision);
        if (approved.policy.status !== "active") return { outcome: "failed", reason: "not_approved" };
        return { outcome: "done", receiptRef: `standing_responsibility:${approved.id}:v${approved.policy.version}` };
      } catch {
        return { outcome: "failed", reason: "resolver_failed" };
      }
    },
  };
}
