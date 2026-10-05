import { z } from "zod";

// Reconcile with src/platform/systems: lane B owns the canonical SystemRef and
// SystemRevisionRef. These minimal local shapes match its announced contract
// ({ businessId, systemId } plus a revision id) so this module can be rebased
// onto the real export by replacing this file with a re-export.

export const SYSTEM_ID = z.string().trim().min(1).max(120);
export const REVISION_ID = z.string().trim().min(1).max(160);

export const systemRefSchema = z.object({
  businessId: z.string().trim().min(1).max(120),
  systemId: SYSTEM_ID,
}).strict();

export const systemRevisionRefSchema = systemRefSchema.extend({
  revisionId: REVISION_ID,
}).strict();

export type SystemRef = z.infer<typeof systemRefSchema>;
export type SystemRevisionRef = z.infer<typeof systemRevisionRefSchema>;

export function sameSystem(a: SystemRef, b: SystemRef): boolean {
  return a.businessId === b.businessId && a.systemId === b.systemId;
}
