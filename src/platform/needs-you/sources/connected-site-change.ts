/**
 * A planned change to a connected site as a Needs you item (`system.change_live`).
 *
 * Pending: the agency saved the exact edit and the owner's yes is asked for.
 * Make it live records "approved" and the agency makes the edit in the
 * builder's own editor; Not yet records "declined", which the agency sees.
 * Strelva never edits the site. Platform layer: ports only, no product imports.
 */
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { ProposedItem } from "../contracts";
import type { SourceAdapter } from "../adapters";
import { itemDetail, itemTitle, memberActor, proposeAsMember, revisionOf, workspaceHref } from "./shared";

export interface PendingConnectedSiteChange {
  changeId: string; systemId: string; siteHost: string; platform: string; title: string; planStepId: string; pageUrl: string;
  expectText: string; removeText: string | null; agencyName: string | null; recordedAt: string;
}

export interface ConnectedSiteChangePorts {
  /** keep_your_site is on for this business. */
  enabled(actor: WorkspaceActor, workspaceId: string): Promise<boolean>;
  pending(actor: WorkspaceActor, workspaceId: string): Promise<PendingConnectedSiteChange[]>;
  /** The lifecycle's own command: SQL checks the actor is a direct owner and the change is waiting. */
  decide(actor: WorkspaceActor, workspaceId: string, changeId: string, decision: "approved" | "declined"): Promise<{ stage: string }>;
  platformLabel(platform: string): string;
}

/** A re-plan is a new step, so it is a new revision the owner has not seen. */
export function connectedSiteChangeRevision(p: PendingConnectedSiteChange): string {
  return revisionOf("connected_site_change", p.changeId, p.planStepId);
}

export function connectedSiteChangeItem(p: PendingConnectedSiteChange, workspaceId: string, label: (platform: string) => string): ProposedItem {
  return {
    kind: "system.change_live",
    route: "owner_decides",
    systemId: p.systemId,
    title: itemTitle(`Change ${p.siteHost}: ${p.title}`),
    detail: itemDetail(`Page: ${p.pageUrl}. Afterwards it should say “${p.expectText}”${p.removeText ? ` and no longer say “${p.removeText}”` : ""}.`),
    approveEffect: `${p.agencyName ?? "Your agency"} makes this edit in ${label(p.platform)}. Strelva checks the live page afterwards.`,
    notYetEffect: "Nothing changes on your site. Your agency sees you said not yet.",
    sourceLifecycle: "connected_site_change",
    sourceId: p.changeId,
    revisionHash: connectedSiteChangeRevision(p),
    urgent: false,
    adminMayDecide: false,
    openHref: workspaceHref(workspaceId, { view: "system", system: p.systemId }),
  };
}

export function connectedSiteChangeAdapter(ports: ConnectedSiteChangePorts): SourceAdapter {
  async function find(actor: WorkspaceActor, workspaceId: string, changeId: string) {
    if (!(await ports.enabled(actor, workspaceId))) return null;
    return (await ports.pending(actor, workspaceId)).find(row => row.changeId === changeId) ?? null;
  }
  return {
    lifecycle: "connected_site_change",
    needsMemberActor: true,
    ownerLinkWithoutAccount: false,
    propose: (ctx) => proposeAsMember(ctx, async actor =>
      (await ports.enabled(actor, ctx.workspaceId))
        ? (await ports.pending(actor, ctx.workspaceId)).map(row => connectedSiteChangeItem(row, ctx.workspaceId, ports.platformLabel))
        : []),
    async currentRevision(ctx, sourceId) {
      if (!ctx.actor) return null;
      const row = await find(ctx.actor, ctx.workspaceId, sourceId);
      return row ? connectedSiteChangeRevision(row) : null;
    },
    async resolve(ctx, item, decision, by) {
      if (by.kind === "expiry") return { outcome: "done", reason: "Expired, nothing changed" };
      const actor = memberActor(by);
      if (!actor) return { outcome: "failed", reason: "owner_not_member" };
      try {
        const row = await find(actor, ctx.workspaceId, item.sourceId);
        if (!row) return { outcome: "done", reason: "already_resolved" };
        if (connectedSiteChangeRevision(row) !== item.revisionHash) return { outcome: "failed", reason: "source_changed" };
        const verdict = decision === "approve" ? "approved" : "declined";
        await ports.decide(actor, ctx.workspaceId, row.changeId, verdict);
        return { outcome: "done", receiptRef: `connected_site_change:${row.changeId}:${verdict}` };
      } catch {
        return { outcome: "failed", reason: "resolver_failed" };
      }
    },
  };
}
