import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalJson } from "@/platform/business-record/tenant-import";
import type { DeclaredEffect, Possibility } from "@/platform/possibilities/contracts";
import type { UnifiedEvent } from "@/lib/types";
import type { AuthorityPort } from "./ports";

/**
 * Approvals are records, not caller-supplied strings. Make real only accepts
 * an approval id that resolves, in the approval store, to an approved decision
 * for this business, this possibility, this candidate revision and this exact
 * effect content (fingerprint). It re-reads the record immediately before the
 * effect runs, so a dismissal after start blocks the write.
 *
 * Two shapes of approval:
 * - `make_real_effect`: one effect (the governed-work queue, today).
 * - `make_real_plan`: the owner's one yes for a whole Make real plan
 *   (systems-experience spec 21, through Needs you). Its fingerprint covers
 *   every declared effect, connection, change and introduced System of that
 *   candidate revision. The per-effect check stays: each effect's own
 *   fingerprint must sit inside the plan the owner approved.
 */

export const makeRealApprovalSubjectSchema = z.object({
  kind: z.literal("make_real_effect"),
  possibilityId: z.string().min(1).max(120),
  candidateRevision: z.number().int().positive(),
  effectId: z.string().min(1).max(80),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type MakeRealApprovalSubject = z.infer<typeof makeRealApprovalSubjectSchema>;

export const makeRealPlanSubjectSchema = z.object({
  kind: z.literal("make_real_plan"),
  possibilityId: z.string().min(1).max(120),
  candidateRevision: z.number().int().positive(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type MakeRealPlanSubject = z.infer<typeof makeRealPlanSubjectSchema>;

export const approvalSubjectSchema = z.union([makeRealApprovalSubjectSchema, makeRealPlanSubjectSchema]);
export type ApprovalSubject = z.infer<typeof approvalSubjectSchema>;

export interface ApprovalRecord {
  id: string;
  businessId: string;
  subject: ApprovalSubject;
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

type PlanParts = Pick<Possibility, "id" | "candidateRevision" | "changes" | "introduces" | "connections" | "effects">;

/**
 * The fingerprint of a whole Make real plan: every effect (by its own
 * fingerprint), every change's System and candidate, every introduced System
 * and every Connection, for this candidate revision. Baseline revision ids
 * are left out: they pin live state, which Make real checks separately.
 */
export function planFingerprint(p: PlanParts): string {
  return createHash("sha256").update(canonicalJson({
    possibilityId: p.id,
    candidateRevision: p.candidateRevision,
    effects: p.effects.map((effect) => ({ id: effect.id, fingerprint: effectApprovalSubject(p, effect).fingerprint })),
    changes: p.changes.map((change) => ({ systemId: change.baseline.systemId, businessId: change.baseline.businessId, candidate: change.candidate })),
    introduces: p.introduces.map((intro) => ({ key: intro.key, name: intro.name, purpose: intro.purpose, candidate: intro.candidate })),
    connections: p.connections,
  })).digest("hex");
}

/** What the owner's one approval for a Make real plan must name. */
export function planApprovalSubject(p: PlanParts): MakeRealPlanSubject {
  return { kind: "make_real_plan", possibilityId: p.id, candidateRevision: p.candidateRevision, fingerprint: planFingerprint(p) };
}

/** Null when a plan approval still matches this plan, else the reason. */
export function planApprovalProblem(record: ApprovalRecord | null, businessId: string, p: PlanParts): string | null {
  if (!record || record.businessId !== businessId) return "no approval record with that id exists for this business";
  if (record.status !== "approved") return `the approval is ${record.status}`;
  const s = record.subject;
  if (s.kind !== "make_real_plan") return "the approval is for one effect, not this plan";
  if (s.possibilityId !== p.id) return "the approval is for a different possibility";
  if (s.candidateRevision !== p.candidateRevision || s.fingerprint !== planFingerprint(p)) return "the approval was given for a different plan";
  return null;
}

/** Returns null when the record approves exactly this effect, else the reason. */
export function approvalProblem(record: ApprovalRecord | null, businessId: string, p: PlanParts, effect: DeclaredEffect): string | null {
  if (!record || record.businessId !== businessId) return "no approval record with that id exists for this business";
  if (record.status !== "approved") return `the approval is ${record.status}`;
  if (record.subject.kind === "make_real_plan") {
    const problem = planApprovalProblem(record, businessId, p);
    if (problem) return problem;
    // The plan fingerprint covers each effect's own fingerprint; this effect must be one of them.
    const expected = effectApprovalSubject(p, effect);
    const declared = p.effects.find((item) => item.id === effect.id);
    if (!declared || effectApprovalSubject(p, declared).fingerprint !== expected.fingerprint) return "the effect is not part of the approved plan";
    return null;
  }
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
      const subject = approvalSubjectSchema.safeParse(event.metadata?.makeRealEffect);
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

/**
 * Authority that holds only while the owner's plan approval does
 * (systems-experience spec 22). `system.activate` and every `site.publish`
 * step are allowed only while the approval record still resolves as approved
 * for this exact plan; it is re-read before every step, so a withdrawal or a
 * changed candidate stops the next step. Other scopes defer to `base`.
 */
export function planApprovalAuthority(base: AuthorityPort, deps: {
  approvals: ApprovalRecordsPort;
  businessId: string;
  approvalId: string;
  plan(): Promise<PlanParts>;
}): AuthorityPort {
  return {
    async check(actor, request) {
      if (request.scope === "system.activate" || request.scope === "site.publish") {
        const problem = planApprovalProblem(await deps.approvals.get(deps.businessId, deps.approvalId), deps.businessId, await deps.plan());
        if (problem) return { allowed: false, reason: `the owner's approval does not hold: ${problem}` };
      }
      return base.check(actor, request);
    },
  };
}
