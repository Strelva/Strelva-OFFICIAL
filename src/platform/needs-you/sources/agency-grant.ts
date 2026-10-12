/**
 * Agency draft grants as Needs you items (`access.grant`, owner only, sign-in).
 *
 * Pending: an agency's provider delivery and its operational assignment are
 * accepted for exactly one application or managed website, and the agency's
 * named operator has no active draft grant. The agency can inspect and
 * rehearse but can't save a revision until the owner grants it.
 *
 * Approve runs the lifecycle's own grant command
 * (`grant_agency_application_draft_edit` or
 * `grant_agency_managed_website_draft_edit_server`), which rechecks in SQL
 * that the caller is the business owner. A grant is access: it is never
 * decided from an email link (the service refuses sign-in kinds) and an admin
 * never decides it. Not yet and expiry grant nothing.
 */
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { ProposedItem } from "../contracts";
import type { SourceAdapter } from "../adapters";
import { itemDetail, itemTitle, memberActor, proposeAsMember, revisionOf, splitSource, unchangedOutcome, workspaceHref } from "./shared";

export type AgencyGrantTarget = "application" | "website";

export interface PendingAgencyGrant {
  target: AgencyGrantTarget;
  workspaceId: string;
  deliveryId: string;
  deliveryRevision: number;
  /** The application work id, or the managed website binding id. */
  targetId: string;
  providerName: string;
  /** What the agency would edit, in the owner's words. */
  label: string;
}

export interface AgencyGrantPorts {
  /** Agency deliveries that wait on the owner's draft grant. */
  pending(actor: WorkspaceActor, workspaceId: string): Promise<PendingAgencyGrant[]>;
  grant(actor: WorkspaceActor, input: { target: AgencyGrantTarget; deliveryId: string; targetId: string }): Promise<{ id: string; status: "active" | "revoked"; expiresAt: string }>;
}

function grantRevision(row: PendingAgencyGrant): string {
  return revisionOf("agency_grant", row.target, row.deliveryId, row.deliveryRevision, row.targetId);
}

export function agencyGrantItem(row: PendingAgencyGrant): ProposedItem {
  return {
    kind: "access.grant",
    route: "owner_decides",
    title: itemTitle(`Let ${row.providerName} edit drafts of ${row.label}`),
    detail: itemDetail(row.target === "website"
      ? "The agency's named operator can prepare draft changes to the website sections you agreed. Publishing stays with you."
      : "The agency's named operator can revise this application draft. Publishing stays with you."),
    approveEffect: "The named agency operator can save draft revisions until the assignment ends. Nothing is published.",
    notYetEffect: "The agency can look but can't save drafts.",
    sourceLifecycle: "agency_grant",
    sourceId: `${row.deliveryId}:${row.target}`,
    revisionHash: grantRevision(row),
    urgent: false,
    adminMayDecide: false,
    openHref: workspaceHref(row.workspaceId, row.target === "application" ? { work: row.targetId } : { view: "websites" }),
  };
}

export function agencyGrantAdapter(ports: AgencyGrantPorts): SourceAdapter {
  async function find(actor: WorkspaceActor, workspaceId: string, sourceId: string) {
    const source = splitSource(sourceId);
    if (!source) return null;
    return (await ports.pending(actor, workspaceId)).find(row => row.deliveryId === source.id && row.target === source.stage && row.workspaceId === workspaceId) ?? null;
  }
  return {
    lifecycle: "agency_grant",
    needsMemberActor: true,
    propose: (ctx) => proposeAsMember(ctx, async actor =>
      (await ports.pending(actor, ctx.workspaceId)).filter(row => row.workspaceId === ctx.workspaceId).map(agencyGrantItem)),
    async currentRevision(ctx, sourceId) {
      if (!ctx.actor) return null;
      const row = await find(ctx.actor, ctx.workspaceId, sourceId);
      return row ? grantRevision(row) : null;
    },
    async resolve(ctx, item, decision, by) {
      const unchanged = unchangedOutcome(decision, by);
      if (unchanged) return unchanged;
      // Access is decided signed in, never from a link.
      if (by.kind !== "session") return { outcome: "failed", reason: "sign_in_required" };
      const actor = memberActor(by)!;
      try {
        const row = await find(actor, ctx.workspaceId, item.sourceId);
        if (!row) return { outcome: "done", reason: "already_resolved" };
        const granted = await ports.grant(actor, { target: row.target, deliveryId: row.deliveryId, targetId: row.targetId });
        if (granted.status !== "active") return { outcome: "failed", reason: "not_granted" };
        return { outcome: "done", receiptRef: `agency_grant:${row.target}:${granted.id}` };
      } catch {
        return { outcome: "failed", reason: "resolver_failed" };
      }
    },
  };
}
