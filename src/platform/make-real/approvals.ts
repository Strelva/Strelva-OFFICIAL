import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalJson } from "@/platform/business-record/tenant-import";
import type { DeclaredEffect, Possibility } from "@/platform/possibilities/contracts";
import type { UnifiedEvent } from "@/lib/types";

/**
 * Approvals are records, not caller-supplied strings. Make real only accepts
 * an approval id that resolves, in the approval store, to an approved decision
 * for this business, this possibility, this candidate revision and this exact
 * effect content (fingerprint). It re-reads the record immediately before the
 * effect runs, so a dismissal after start blocks the write.
 */

export const makeRealApprovalSubjectSchema = z.object({
  kind: z.literal("make_real_effect"),
  possibilityId: z.string().min(1).max(120),
  candidateRevision: z.number().int().positive(),
  effectId: z.string().min(1).max(80),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type MakeRealApprovalSubject = z.infer<typeof makeRealApprovalSubjectSchema>;

export interface ApprovalRecord {
  id: string;
  businessId: string;
  subject: MakeRealApprovalSubject;
  /** Auto-approval never counts: only a recorded human decision approves an outside write. */
  status: "pending" | "approved" | "dismissed";
  decidedBy?: string;
  decidedAt?: string;
}

export interface ApprovalRecordsPort {
  get(businessId: string, approvalId: string): Promise<ApprovalRecord | null>;
}

/** What an approval for one effect of one candidate must name. */
export function effectApprovalSubject(p: Pick<Possibility, "id" | "candidateRevision">, effect: DeclaredEffect): MakeRealApprovalSubject {
  const fingerprint = createHash("sha256")
    .update(canonicalJson({ kind: effect.kind, system: effect.system, request: effect.request, publish: effect.publish ?? null }))
    .digest("hex");
  return { kind: "make_real_effect", possibilityId: p.id, candidateRevision: p.candidateRevision, effectId: effect.id, fingerprint };
}

/** Returns null when the record approves exactly this effect, else the reason. */
export function approvalProblem(record: ApprovalRecord | null, businessId: string, p: Pick<Possibility, "id" | "candidateRevision">, effect: DeclaredEffect): string | null {
  if (!record || record.businessId !== businessId) return "no approval record with that id exists for this business";
  if (record.status !== "approved") return `the approval is ${record.status}`;
  const expected = effectApprovalSubject(p, effect);
  const s = record.subject;
  if (s.possibilityId !== expected.possibilityId || s.effectId !== expected.effectId) return "the approval is for a different effect";
  if (s.candidateRevision !== expected.candidateRevision || s.fingerprint !== expected.fingerprint) return "the approval was given for different content";
  return null;
}

/** Test and local store. Production reads the governed-work store below. */
export function createInMemoryApprovalRecords() {
  const rows = new Map<string, ApprovalRecord>();
  return {
    async get(businessId: string, approvalId: string) {
      const row = rows.get(approvalId);
      return row && row.businessId === businessId ? structuredClone(row) : null;
    },
    record(row: ApprovalRecord) { rows.set(row.id, structuredClone(row)); return row.id; },
    setStatus(id: string, status: ApprovalRecord["status"]) { const row = rows.get(id); if (row) row.status = status; },
  } satisfies ApprovalRecordsPort & Record<string, unknown>;
}

/**
 * Adapter over the existing governed-work approval queue
 * (src/lib/governed-work: proposals + decisions, read as a UnifiedEvent).
 * The proposal's metadata carries `makeRealEffect` (the subject above); the
 * decision is the event status. `auto_approved` is treated as pending.
 */
export function createGovernedWorkApprovalRecords(deps: {
  readEvent(id: string): Promise<UnifiedEvent | null>;
  businessForTenant(tenantId: string): Promise<string | null>;
}): ApprovalRecordsPort {
  return {
    async get(businessId, approvalId) {
      const event = await deps.readEvent(approvalId);
      if (!event) return null;
      const subject = makeRealApprovalSubjectSchema.safeParse(event.metadata?.makeRealEffect);
      if (!subject.success) return null;
      const owner = await deps.businessForTenant(event.tenantId);
      if (!owner || owner !== businessId) return null;
      const status = event.status === "approved" ? "approved" : event.status === "dismissed" ? "dismissed" : "pending";
      return {
        id: event.id, businessId: owner, subject: subject.data, status,
        ...(event.metadata?.execution?.actor ? { decidedBy: event.metadata.execution.actor } : {}),
        ...(event.resolvedAt ? { decidedAt: event.resolvedAt } : {}),
      };
    },
  };
}
