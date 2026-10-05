import { systemRefSchema, systemRevisionRefSchema } from "@/platform/systems/contracts";

/**
 * System identity comes from the spine (src/platform/systems). A Possibility
 * pins each baseline as a canonical SystemRevisionRef, so a pinned baseline
 * is exactly what SystemStore.setCurrentRevision compares against.
 */
export { systemRefSchema, systemRevisionRefSchema } from "@/platform/systems/contracts";
export type { SystemRef, SystemRevisionRef } from "@/platform/systems/contracts";
export { sameSystem } from "@/platform/systems/invariants";

export const SYSTEM_ID = systemRefSchema.shape.systemId;
export const REVISION_ID = systemRevisionRefSchema.shape.revisionId;
