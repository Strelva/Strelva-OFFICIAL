/**
 * Needs you source: a website change waiting to go live (`system.change_live`).
 *
 * What waits on the owner: a website Request whose newest receipt is a
 * preview, reported by a person or a coding agent. Approve records the same
 * `approved` receipt the site page's Make it live records, through the
 * lifecycle's own command; the agency's coding agent then deploys. Approval is
 * owner-only in the database (website_change_owner_required), so an admin
 * never decides here. Not yet and a lapse change nothing: the preview stays
 * open on the site page.
 *
 * Off with the business's `sites_by_code` flag: no items, so nothing changes
 * for a business that has not been released.
 */
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { workspaceSiteHref } from "@/platform/workspaces/site-places";
import type { ProposedItem } from "../contracts";
import type { SourceAdapter } from "../adapters";
import { itemDetail, itemTitle, memberActor, proposeAsMember, revisionOf, unchangedOutcome } from "./shared";

/** A Request waiting on the owner's Make it live. The products store returns a structurally identical type. */
export interface PendingSiteChangeReview {
  requestId: string;
  systemId: string;
  request: string;
  page: string | null;
  siteName: string;
  previewReceiptId: string;
  previewUrl: string;
  summary: string | null;
  ownerFacing: boolean;
  reportedBy: "person" | "coding_agent";
  recordedAt: string;
}

export interface WebsiteChangeReviewPorts {
  enabled(workspaceId: string): Promise<boolean>;
  pending(actor: WorkspaceActor, workspaceId: string): Promise<PendingSiteChangeReview[]>;
  /** The lifecycle's own command: record the `approved` receipt. */
  approve(actor: WorkspaceActor, workspaceId: string, requestId: string): Promise<{ id: string; kind: string }>;
}

/** A newer preview on the same Request is a new revision: an approval of the old one refuses. */
export function websiteChangeRevision(review: Pick<PendingSiteChangeReview, "requestId" | "previewReceiptId">): string {
  return revisionOf("website_change", review.requestId, review.previewReceiptId);
}

export function websiteChangeItem(review: PendingSiteChangeReview, workspaceId: string): ProposedItem {
  const words = `${review.request}${review.page ? ` (${review.page})` : ""}.`;
  return {
    kind: "system.change_live",
    route: "owner_decides",
    systemId: review.systemId,
    title: itemTitle(`Make the change to ${review.siteName} live`),
    detail: itemDetail(`${words} ${review.summary ?? ""} Preview: ${review.previewUrl}${review.ownerFacing ? "" : " · No visible change"}`),
    approveEffect: "Your agency puts this change on your live website.",
    notYetEffect: "Your website stays as it is. The preview stays open.",
    sourceLifecycle: "website_change",
    sourceId: review.requestId,
    revisionHash: websiteChangeRevision(review),
    urgent: false,
    adminMayDecide: false,
    openHref: workspaceSiteHref({ workspaceId, systemId: review.systemId, tab: "request" }),
  };
}

export function websiteChangeAdapter(ports: WebsiteChangeReviewPorts): SourceAdapter {
  async function find(actor: WorkspaceActor, workspaceId: string, requestId: string) {
    if (!(await ports.enabled(workspaceId))) return null;
    return (await ports.pending(actor, workspaceId)).find(review => review.requestId === requestId) ?? null;
  }
  return {
    lifecycle: "website_change",
    needsMemberActor: true,
    ownerLinkWithoutAccount: false,
    ownerLinkApprovalRequiresSignIn: true,
    propose: (ctx) => proposeAsMember(ctx, async actor =>
      (await ports.enabled(ctx.workspaceId)) ? (await ports.pending(actor, ctx.workspaceId)).map(review => websiteChangeItem(review, ctx.workspaceId)) : []),
    async currentRevision(ctx, sourceId) {
      if (!ctx.actor) return null;
      const review = await find(ctx.actor, ctx.workspaceId, sourceId);
      return review ? websiteChangeRevision(review) : null;
    },
    async resolve(ctx, item, decision, by) {
      const unchanged = unchangedOutcome(decision, by);
      if (unchanged) return unchanged;
      const actor = memberActor(by);
      if (!actor) return { outcome: "failed", reason: "owner_not_member" };
      try {
        const review = await find(actor, ctx.workspaceId, item.sourceId);
        if (!review) return { outcome: "done", reason: "already_resolved" };
        if (websiteChangeRevision(review) !== item.revisionHash) return { outcome: "failed", reason: "source_changed" };
        const receipt = await ports.approve(actor, ctx.workspaceId, review.requestId);
        if (receipt.kind !== "approved") return { outcome: "failed", reason: "not_approved" };
        return { outcome: "done", receiptRef: `website_change:${receipt.id}` };
      } catch {
        return { outcome: "failed", reason: "resolver_failed" };
      }
    },
  };
}
