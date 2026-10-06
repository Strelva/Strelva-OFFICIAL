import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalJson } from "@/platform/business-record/tenant-import";
import type { DeclaredEffect, Possibility } from "@/platform/possibilities/contracts";
import type { UnifiedEvent } from "@/lib/types";

/**
 * Approvals are records, not caller-supplied strings. Make real only accepts
 * an approval id that resolves, in the approval store, to an approved decision
 * for this business and this exact content. It re-reads the record
 * immediately before each effect runs, so a dismissal after start blocks the
 * write.
 *
 * Two subjects:
 * - `make_real_effect`: one effect of one candidate (the older, per-effect form).
 * - `make_real_plan`: the owner decides once per plan (spec behavior 21). Its
 *   fingerprint covers every changed System's baseline and candidate, every
 *   introduced System, every connection and every declared effect of that
 *   candidate revision. The per-effect check stays: an effect is inside the
 *   plan only when the plan recomputed from the current possibility has the
 *   approved fingerprint, which it cannot if any effect changed.
 *
 * Approvals are keyed by business (workspace), never through a tenant, so a
 * business with no tenant can approve (createNeedsYouApprovalRecords).
 */

const FINGERPRINT = z.string().regex(/^[a-f0-9]{64}$/);

export const makeRealApprovalSubjectSchema = z.object({
  kind: z.literal("make_real_effect"),
  possibilityId: z.string().min(1).max(120),
  candidateRevision: z.number().int().positive(),
  effectId: z.string().min(1).max(80),
  fingerprint: FINGERPRINT,
}).strict();
export type MakeRealApprovalSubject = z.infer<typeof makeRealApprovalSubjectSchema>;

export const makeRealPlanSubjectSchema = z.object({
  kind: z.literal("make_real_plan"),
  possibilityId: z.string().min(1).max(120),
  fingerprint: FINGERPRINT,
}).strict();
export type MakeRealPlanSubject = z.infer<typeof makeRealPlanSubjectSchema>;

export interface ApprovalRecord {
  id: string;
  businessId: string;
  subject: MakeRealApprovalSubject | MakeRealPlanSubject;
  /** Auto-approval never counts: only a recorded human decision approves an outside write. */
  status: "pending" | "approved" | "dismissed";
  decidedBy?: string;
  decidedAt?: string;
}

export interface ApprovalRecordsPort {
  get(businessId: string, approvalId: string): Promise<ApprovalRecord | null>;
}

function sha(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

/** The content one effect sends. `channel` is included only when named, so
 * fingerprints of effects without a channel are unchanged. */
export function effectFingerprint(effect: DeclaredEffect): string {
  return sha({
    kind: effect.kind, system: effect.system, request: effect.request, publish: effect.publish ?? null,
    ...(effect.channel ? { channel: effect.channel } : {}),
  });
}

/** What an approval for one effect of one candidate must name. */
export function effectApprovalSubject(p: Pick<Possibility, "id" | "candidateRevision">, effect: DeclaredEffect): MakeRealApprovalSubject {
  return { kind: "make_real_effect", possibilityId: p.id, candidateRevision: p.candidateRevision, effectId: effect.id, fingerprint: effectFingerprint(effect) };
}

export type PlanSource = Pick<Possibility, "id" | "candidateRevision" | "changes" | "introduces" | "connections" | "effects">;

/** One fingerprint for everything a candidate revision would do. */
export function planFingerprint(p: PlanSource): string {
  return sha({
    possibilityId: p.id,
    candidateRevision: p.candidateRevision,
    changes: p.changes.map((c) => ({ systemId: c.baseline.systemId, baseline: c.baseline.revisionId, candidate: sha(c.candidate) }))
      .sort((a, b) => (a.systemId < b.systemId ? -1 : a.systemId > b.systemId ? 1 : 0)),
    introduces: p.introduces.map((i) => ({ key: i.key, candidate: sha(i.candidate), name: i.name })),
    connections: p.connections.map((c) => sha(c)),
    effects: p.effects.map((e) => ({ id: e.id, fingerprint: effectFingerprint(e) })),
  });
}

export function planApprovalSubject(p: PlanSource): MakeRealPlanSubject {
  return { kind: "make_real_plan", possibilityId: p.id, fingerprint: planFingerprint(p) };
}

/** Returns null when the record approves exactly this plan, else the reason. */
export function planApprovalProblem(record: ApprovalRecord | null, businessId: string, p: PlanSource): string | null {
  if (!record || record.businessId !== businessId) return "no approval record with that id exists for this business";
  if (record.status !== "approved") return `the approval is ${record.status}`;
  if (record.subject.kind !== "make_real_plan") return "the approval is for one effect, not this plan";
  if (record.subject.possibilityId !== p.id) return "the approval is for a different possibility";
  if (record.subject.fingerprint !== planFingerprint(p)) return "the approval was given for different content";
  return null;
}

/** Returns null when the record approves exactly this effect, else the reason. */
export function approvalProblem(record: ApprovalRecord | null, businessId: string, p: Pick<Possibility, "id" | "candidateRevision"> & Partial<PlanSource>, effect: DeclaredEffect): string | null {
  if (!record || record.businessId !== businessId) return "no approval record with that id exists for this business";
  if (record.status !== "approved") return `the approval is ${record.status}`;
  const s = record.subject;
  if (s.kind === "make_real_plan") {
    if (!p.changes || !p.introduces || !p.connections || !p.effects) return "the approval is for a whole plan";
    if (!p.effects.some((e) => e.id === effect.id && effectFingerprint(e) === effectFingerprint(effect))) return "the approval is for a different effect";
    return planApprovalProblem(record, businessId, p as PlanSource);
  }
  const expected = effectApprovalSubject(p, effect);
  if (s.possibilityId !== expected.possibilityId || s.effectId !== expected.effectId) return "the approval is for a different effect";
  if (s.candidateRevision !== expected.candidateRevision || s.fingerprint !== expected.fingerprint) return "the approval was given for different content";
  return null;
}

/** Test and local store. Production reads the Needs you store below. */
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

/** The Needs you item lifecycle for Make real (owner_decisions.source_lifecycle). */
export const MAKE_REAL_LIFECYCLE = "make_real";

/** The narrow slice of a Needs you item an approval needs. */
export interface MakeRealDecisionRow {
  id: string;
  workspaceId: string;
  sourceLifecycle: string;
  sourceId: string;
  revisionHash: string;
  state: string;
  decidedByKind: string | null;
  decidedAt: string | null;
}

/**
 * Approval records from Needs you (owner_decisions), keyed by workspace. A
 * Make real item names the possibility (`sourceId`) and the plan fingerprint
 * (`revisionHash`). Approved means the owner's decision was recorded as
 * approved; declined, lapsed, withdrawn or superseded items read as dismissed,
 * so a later withdrawal stops the next step.
 */
export function createNeedsYouApprovalRecords(deps: { read(workspaceId: string, itemId: string): Promise<MakeRealDecisionRow | null> }): ApprovalRecordsPort {
  return {
    async get(businessId, approvalId) {
      if (!z.string().uuid().safeParse(approvalId).success || !z.string().uuid().safeParse(businessId).success) return null;
      const item = await deps.read(businessId, approvalId);
      if (!item || item.workspaceId !== businessId || item.sourceLifecycle !== MAKE_REAL_LIFECYCLE) return null;
      const subject = makeRealPlanSubjectSchema.safeParse({ kind: "make_real_plan", possibilityId: item.sourceId, fingerprint: item.revisionHash });
      if (!subject.success) return null;
      const status = item.state === "approved" ? "approved" : item.state === "open" ? "pending" : "dismissed";
      return {
        id: item.id, businessId, subject: subject.data, status,
        ...(item.decidedByKind ? { decidedBy: item.decidedByKind } : {}),
        ...(item.decidedAt ? { decidedAt: item.decidedAt } : {}),
      };
    },
  };
}

/**
 * Adapter over the existing governed-work approval queue
 * (src/lib/governed-work: proposals + decisions, read as a UnifiedEvent).
 * The proposal's metadata carries `makeRealEffect` (the subject above); the
 * decision is the event status. `auto_approved` is treated as pending.
 *
 * The business is the one the proposal names (`metadata.businessId`), so a
 * business with no tenant can approve; only an older proposal without it
 * falls back to the tenant's business.
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
      const named = (event.metadata as Record<string, unknown> | undefined)?.businessId;
      const owner = typeof named === "string" && named ? named : await deps.businessForTenant(event.tenantId);
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
