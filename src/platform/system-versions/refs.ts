// reconcile with src/platform/systems: lane B owns the canonical SystemRef and
// SystemRevisionRef. These local shapes match the agreed contract
// (`SystemRef = { businessId, systemId }`) so the swap is an import change.

/** A business-owned System. The pair is the identity; category is not. */
export interface SystemRef {
  businessId: string;
  systemId: string;
}

/** One immutable authored revision of a System's shareable definition. */
export interface SystemRevisionRef extends SystemRef {
  revision: number;
}

export function sameSystem(left: SystemRef, right: SystemRef): boolean {
  return left.businessId === right.businessId && left.systemId === right.systemId;
}

export function systemKey(ref: SystemRef): string {
  return `${ref.businessId}/${ref.systemId}`;
}
