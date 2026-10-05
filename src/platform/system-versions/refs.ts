/**
 * System identity comes from the spine (src/platform/systems). A source
 * revision is a canonical SystemRevisionRef: `number` orders revisions within
 * one System and `revisionId` names that exact revision.
 */
import type { SystemRef, SystemRevisionRef } from "@/platform/systems/contracts";

export type { SystemRef, SystemRevisionRef } from "@/platform/systems/contracts";
export { sameSystem } from "@/platform/systems/invariants";

export function systemKey(ref: SystemRef): string {
  return `${ref.businessId}/${ref.systemId}`;
}

/**
 * The revision id a read-only projection gives a revision that has no stored
 * SystemRevision row yet (an offering semver, an inquiry pattern version).
 * Deterministic so the same legacy revision always projects to the same ref.
 */
export function projectedRevisionId(ref: SystemRef, number: number): string {
  return `${ref.systemId}@${number}`;
}

export function projectedRevisionRef(ref: SystemRef, number: number): SystemRevisionRef {
  return { businessId: ref.businessId, systemId: ref.systemId, revisionId: projectedRevisionId(ref, number), number };
}
