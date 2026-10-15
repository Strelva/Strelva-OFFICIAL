/**
 * Needs you source: one "make your details match" decision per business
 * (`system.change_live`, owner decides).
 *
 * What waits on the owner: the fixes the last Listings in sync check proposed
 * that Strelva can make (booking times, and Google when its Release is
 * reached) or ask the agency to make (website Requests). Approving applies them
 * through the existing paths and queues a re-check; nothing is verified until
 * that check reads each place as matching. Not yet and a lapse change nothing.
 *
 * Platform layer: ports only. The owner decides: an agency with Full control
 * never does (adminMayDecide false; SQL maps this lifecycle to owner-only).
 */
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { ProposedItem } from "../contracts";
import type { SourceAdapter } from "../adapters";
import { businessFactsDetail } from "./business-facts";
import { memberActor, unchangedOutcome } from "./shared";

export interface ListingsPlan { workspaceId: string; recordRevision: number; hash: string; lines: string[]; requests: number; strelvaChanges: number;
  /** Distinct places in the plan. Falls back to counting the lines' leading names. */
  places?: number }

export interface ListingsSyncPorts {
  enabled(workspaceId: string): Promise<boolean>;
  plan(workspaceId: string): Promise<ListingsPlan | null>;
  apply(actor: WorkspaceActor, workspaceId: string, hash: string): Promise<{ applied: number; failed: Array<{ reason: string }>; checkId: string | null }>;
  decline(workspaceId: string, recordRevision: number, decidedBy: string | null): Promise<void>;
}

export function listingsSyncItem(plan: ListingsPlan): ProposedItem {
  const places = plan.places ?? (new Set(plan.lines.map(line => line.split(":")[0]!.trim())).size || 1);
  return {
    kind: "system.change_live",
    route: "owner_decides",
    title: `Make your details match in ${places === 1 ? "1 place" : `${places} places`}`,
    detail: businessFactsDetail(plan.lines),
    approveEffect: plan.requests
      ? "Strelva changes the places it can, asks your agency to change your website, then checks each place again."
      : "Strelva changes these places, then checks each one again.",
    notYetEffect: "Nothing changes. These places keep showing different details.",
    sourceLifecycle: "listings_sync",
    sourceId: plan.workspaceId,
    revisionHash: plan.hash,
    urgent: false,
    adminMayDecide: false,
    openHref: `/workspace/business-details?workspaceId=${encodeURIComponent(plan.workspaceId)}#listings`,
  };
}

export function listingsSyncAdapter(ports: ListingsSyncPorts): SourceAdapter {
  return {
    lifecycle: "listings_sync",
    needsMemberActor: true,
    ownerLinkWithoutAccount: false,
    ownerLinkApprovalRequiresSignIn: true,
    trustedRecipientOnly: true,
    async review(ctx, item) {
      const plan = await ports.plan(ctx.workspaceId);
      return plan && plan.hash === item.revisionHash ? plan.lines : null;
    },
    async propose(ctx) {
      try {
        if (!(await ports.enabled(ctx.workspaceId))) return { items: [], complete: true };
        const plan = await ports.plan(ctx.workspaceId);
        return { items: plan && plan.strelvaChanges + plan.requests > 0 ? [listingsSyncItem(plan)] : [], complete: true };
      } catch {
        return { items: [], complete: false };
      }
    },
    async currentRevision(ctx, sourceId) {
      return sourceId === ctx.workspaceId ? (await ports.plan(sourceId))?.hash ?? null : null;
    },
    async resolve(ctx, item, decision, by) {
      try {
        if (by.kind === "expiry") {
          const plan = await ports.plan(ctx.workspaceId);
          if (plan) await ports.decline(ctx.workspaceId, plan.recordRevision, null);
          return { outcome: "done", reason: "Expired, nothing changed" };
        }
        const plan = await ports.plan(ctx.workspaceId);
        if (!plan || plan.hash !== item.revisionHash) return { outcome: "failed", reason: "source_changed" };
        const actor = memberActor(by);
        if (decision === "not_yet") {
          await ports.decline(ctx.workspaceId, plan.recordRevision, actor?.userId ?? null);
          return { outcome: "done", reason: "Not yet; nothing changed" };
        }
        const unchanged = unchangedOutcome(decision, by);
        if (unchanged) return unchanged;
        if (!actor) return { outcome: "failed", reason: "owner_not_member" };
        const result = await ports.apply(actor, ctx.workspaceId, plan.hash);
        if (result.applied === 0 && result.failed.length) return { outcome: "failed", reason: result.failed[0]!.reason.slice(0, 200) };
        return { outcome: "done_unverified", reason: "checking_again", ...(result.checkId ? { receiptRef: `listings_sync:${result.checkId}` } : {}) };
      } catch {
        return { outcome: "failed", reason: "resolver_failed" };
      }
    },
  };
}
