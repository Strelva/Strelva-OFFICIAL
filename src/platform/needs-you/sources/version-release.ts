/**
 * Releasing a Version (src/platform/system-versions). Going live is a
 * release, and `createVersionReleaseGate` releases only when its
 * `VersionReleaseApprovals` port says the business approved this exact row
 * revision. That port is Needs you: the approval is the owner_decisions item
 * of lifecycle `version_release` for this Version, `approved`, with the
 * revision hash of the row revision the decision was made on.
 *
 * A Version whose working definition differs from its current release opens
 * one item (`system.change_live`, routed by the policy; floor
 * `strelva_reviews`). Approving claims the item, then resolves through the
 * gate, which re-reads the item before releasing. Not yet and a lapse change
 * nothing: the working definition waits, unreleased.
 */
import { createHash } from "node:crypto";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { VersionActor, VersionReleaseApprovals } from "@/platform/system-versions";
import { evaluateRoute } from "../evaluator";
import type { OwnerDecision, PolicySetting, ProposedItem } from "../contracts";
import type { SourceAdapter } from "../adapters";

export interface PendingVersionRelease {
  versionId: string;
  /** The Version's own System. */
  systemId: string;
  /** "Mooney Firm, Buffalo office". */
  label: string;
  rowRevision: number;
  /** The release number this would become. */
  nextRelease: number;
  /** Paths that differ from the current release, for the owner to read. */
  changedPaths: string[];
}

export interface VersionReleaseSourcePorts {
  enabled(workspaceId: string, actor: WorkspaceActor): Promise<boolean>;
  /** Versions of this business with an unreleased working definition. */
  pending(actor: WorkspaceActor, workspaceId: string): Promise<PendingVersionRelease[]>;
  policies(actor: WorkspaceActor, workspaceId: string): Promise<PolicySetting[]>;
  /** The release gate (createVersionReleaseGate) with the given approvals port. */
  release(actor: WorkspaceActor, input: { workspaceId: string; versionId: string; expectedRowRevision: number; approvals: VersionReleaseApprovals }): Promise<{ releaseNumber: number | null }>;
  /** Re-read one item, for the approvals port. */
  read(workspaceId: string, itemId: string): Promise<OwnerDecision | null>;
}

/** The revision a release decision binds: this Version at this row revision. */
export function versionReleaseRevision(versionId: string, rowRevision: number): string {
  return createHash("sha256").update(JSON.stringify(["version_release", versionId, rowRevision])).digest("hex");
}

export function versionReleaseItem(release: PendingVersionRelease, workspaceId: string, policies: readonly PolicySetting[]): ProposedItem | null {
  const evaluation = evaluateRoute({ kind: "system.change_live", origin: "strelva", systemId: release.systemId, policies });
  if (evaluation.route !== "owner_decides" && evaluation.route !== "strelva_reviews") return null;
  const changed = release.changedPaths.slice(0, 8).join(", ");
  return {
    kind: "system.change_live",
    route: evaluation.route,
    systemId: release.systemId,
    title: `Put the updated ${release.label} live`.slice(0, 200).trim(),
    detail: (changed ? `This becomes release ${release.nextRelease}. What changed: ${changed}.` : `This becomes release ${release.nextRelease}.`).slice(0, 600),
    approveEffect: `Release ${release.nextRelease} goes live for ${release.label}.`.slice(0, 300),
    notYetEffect: "Nothing goes live. The change waits for you.",
    sourceLifecycle: "version_release",
    sourceId: release.versionId,
    revisionHash: versionReleaseRevision(release.versionId, release.rowRevision),
    urgent: false,
    adminMayDecide: false,
    openHref: `/workspace?view=system&system=${encodeURIComponent(release.systemId)}&workspaceId=${encodeURIComponent(workspaceId)}`,
  };
}

/**
 * The release gate's approvals port over Needs you. `lookup` returns the
 * Version's items, freshly read; one approves only when it is `approved`,
 * did not fail, belongs to this business and binds this row revision.
 */
export function needsYouVersionReleaseApprovals(lookup: (actor: VersionActor, businessId: string, versionId: string) => Promise<OwnerDecision[]>): VersionReleaseApprovals {
  return {
    async approved(actor, input) {
      const expected = versionReleaseRevision(input.versionId, input.rowRevision);
      const items = await lookup(actor, input.businessId, input.versionId).catch(() => []);
      const item = items.find((row) => row.workspaceId === input.businessId && row.sourceLifecycle === "version_release"
        && row.sourceId === input.versionId && row.state === "approved" && row.outcome !== "failed" && row.revisionHash === expected);
      return item ? { approvalId: item.id } : null;
    },
  };
}

export function versionReleaseAdapter(ports: VersionReleaseSourcePorts): SourceAdapter {
  async function pending(actor: WorkspaceActor, workspaceId: string) {
    if (!(await ports.enabled(workspaceId, actor))) return [];
    return ports.pending(actor, workspaceId);
  }
  return {
    lifecycle: "version_release",
    needsMemberActor: true,
    ownerLinkWithoutAccount: false,
    ownerLinkApprovalRequiresSignIn: true,
    async propose(ctx) {
      if (!ctx.actor) return { items: [], complete: false };
      try {
        const rows = await pending(ctx.actor, ctx.workspaceId);
        if (!rows.length) return { items: [], complete: true };
        const policies = await ports.policies(ctx.actor, ctx.workspaceId).catch(() => []);
        return { items: rows.flatMap((row) => versionReleaseItem(row, ctx.workspaceId, policies) ?? []), complete: true };
      } catch {
        return { items: [], complete: false };
      }
    },
    async currentRevision(ctx, sourceId) {
      if (!ctx.actor) return null;
      const row = (await pending(ctx.actor, ctx.workspaceId)).find((item) => item.versionId === sourceId);
      return row ? versionReleaseRevision(row.versionId, row.rowRevision) : null;
    },
    async resolve(ctx, item, decision, by) {
      if (by.kind === "expiry") return { outcome: "done", reason: "Expired, nothing changed" };
      if (decision === "not_yet") return { outcome: "done", reason: "Not yet: nothing went live." };
      // Existing service sessions also refuse: the ordinary member mutation
      // cannot atomically recheck the owner-link agency assignment/effect.
      if (by.kind === "owner_link") return { outcome: "failed", reason: "sign_in_required" };
      const actor = by.actor;
      if (!actor) return { outcome: "failed", reason: "owner_not_member" };
      const row = (await pending(actor, ctx.workspaceId).catch(() => null))?.find((entry) => entry.versionId === item.sourceId);
      if (!row) return { outcome: "done", reason: "already_resolved" };
      if (versionReleaseRevision(row.versionId, row.rowRevision) !== item.revisionHash) return { outcome: "failed", reason: "changed_since_decided" };
      // The gate re-reads this item: the approval is the record, not this call.
      const approvals = needsYouVersionReleaseApprovals(async () => {
        const fresh = await ports.read(ctx.workspaceId, item.id);
        return fresh ? [fresh] : [];
      });
      try {
        const released = await ports.release(actor, { workspaceId: ctx.workspaceId, versionId: row.versionId, expectedRowRevision: row.rowRevision, approvals });
        return { outcome: "done", receiptRef: `version_release:${row.versionId}:${released.releaseNumber ?? row.nextRelease}` };
      } catch (error) {
        const name = error instanceof Error ? error.name : "";
        if (name === "VersionValidationError") return { outcome: "done", reason: "already_resolved" };
        return { outcome: "failed", reason: name === "VersionStaleError" ? "changed_since_decided" : name === "VersionReleaseNeedsApprovalError" ? "approval_not_found" : "release_failed" };
      }
    },
  };
}
