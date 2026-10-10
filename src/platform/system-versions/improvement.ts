/**
 * An upstream improvement, as the Version's business sees it, and the only
 * way it goes live.
 *
 * - `improvementState` turns a three-way compare into the states the agency
 *   Library and the Versions panel show (ready, conflicts, missing accounts,
 *   declined, up to date).
 * - `improvementPossibility` is the Possibility it arrives as on the
 *   Version's own System: the preview, every change, and every conflict with
 *   both values. Nothing about it is applied until someone decides.
 * - Adoption changes the working definition only (service.adoptImprovement).
 *   Going live is a separate release, and `createVersionReleaseGate` lets it
 *   happen only when the release port says the business approved it (Make
 *   real through Needs you: the owner's yes, or a standing owner policy).
 *   Without an approval it refuses and nothing changes.
 */
import type { JsonObject, JsonValue } from "./compare";
import type { SystemRef } from "./refs";
import type { SystemVersions } from "./service";
import type { ImprovementComparison, VersionActor, VersionDecision, VersionLineage } from "./types";

export type ImprovementState = "up_to_date" | "ready" | "conflicts" | "missing_accounts" | "declined";

/** The state for one Version against its source's latest revision. */
export function improvementState(offers: readonly ImprovementComparison[], decisions: readonly VersionDecision[]): {
  state: ImprovementState;
  latest: ImprovementComparison | null;
  declinedReason: string | null;
} {
  const latest = offers.at(-1) ?? null;
  if (!latest || latest.status === "up_to_date") return { state: "up_to_date", latest: null, declinedReason: null };
  const declined = [...decisions].reverse().find((decision) => decision.sourceRevision === latest.sourceRevision && decision.choice === "declined");
  if (declined && declined.choice === "declined") return { state: "declined", latest, declinedReason: declined.reason };
  if (latest.conflicts.length > 0) return { state: "conflicts", latest, declinedReason: null };
  if (latest.missingBindings.length > 0) return { state: "missing_accounts", latest, declinedReason: null };
  return { state: "ready", latest, declinedReason: null };
}

export interface ImprovementPossibility {
  kind: "possibility";
  id: string;
  /** The Version's own System. Never the source's and never another client's. */
  system: SystemRef;
  title: string;
  summary: string;
  sourceRevision: number;
  status: "exploring" | "ready";
  changes: Array<{ path: string; before: JsonValue | undefined; after: JsonValue | undefined }>;
  /** Each conflict waits for keep local or take upstream, with both values shown. */
  conflicts: Array<{ path: string; local: JsonValue | undefined; upstream: JsonValue | undefined; reason: string; locked?: boolean }>;
  missingAccounts: string[];
  preview: JsonObject;
  /** Make real = this Version's next release. */
  makeReal: { kind: "version_release"; versionId: string };
}

export function improvementPossibility(lineage: Pick<VersionLineage, "id" | "version" | "context">, offer: ImprovementComparison, sourceName: string): ImprovementPossibility {
  return {
    kind: "possibility",
    id: `improvement:${lineage.id}:${offer.sourceRevision}`,
    system: lineage.version,
    title: `${sourceName} got an update. Bring it to ${lineage.context.label}?`,
    summary: offer.summary,
    sourceRevision: offer.sourceRevision,
    // Ready only when nothing waits on a choice or an account.
    status: offer.status === "auto_applicable" ? "ready" : "exploring",
    changes: offer.changes.map((change) => ({ path: change.path, before: change.base, after: change.upstream })),
    conflicts: offer.conflicts.map((conflict) => ({ path: conflict.path, local: conflict.local, upstream: conflict.upstream, reason: conflict.reason, locked: offer.lockedPaths?.some(path => path === "*" || path === conflict.path || path.startsWith(`${conflict.path}.`) || conflict.path.startsWith(`${path}.`)) ?? false })),
    missingAccounts: [...offer.missingBindings],
    preview: offer.preview,
    makeReal: { kind: "version_release", versionId: lineage.id },
  };
}

/** Whether the business approved putting this Version's working definition live. */
export interface VersionReleaseApprovals {
  approved(actor: VersionActor, input: { businessId: string; versionId: string; rowRevision: number }): Promise<{ approvalId: string } | null>;
}

export class VersionReleaseNeedsApprovalError extends Error {
  constructor(message = "Releasing this Version needs the owner's approval. Nothing went live.") {
    super(message);
    this.name = "VersionReleaseNeedsApprovalError";
  }
}

/**
 * The one release path for Versions: the approval is checked against the
 * exact row revision the decision was made on, then the service releases
 * (which, in Postgres, also records the spine revision and moves the pointer).
 */
export function createVersionReleaseGate(deps: { versions: SystemVersions; approvals: VersionReleaseApprovals }) {
  return {
    async release(actor: VersionActor, versionId: string, input: { expectedRowRevision: number }): Promise<{ lineage: VersionLineage; approvalId: string }> {
      const view = await deps.versions.readVersion(actor, versionId);
      const approval = await deps.approvals.approved(actor, { businessId: view.version.businessId, versionId, rowRevision: input.expectedRowRevision });
      if (!approval) throw new VersionReleaseNeedsApprovalError();
      const lineage = await deps.versions.release(actor, versionId, input);
      return { lineage, approvalId: approval.approvalId };
    },
  };
}
