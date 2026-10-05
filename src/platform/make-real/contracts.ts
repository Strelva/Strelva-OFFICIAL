import { z } from "zod";
import { authorityScopeSchema, effectKindSchema, reversibilitySchema } from "@/platform/possibilities/contracts";

/**
 * The durable log of one Make real attempt (COMP_MULTI_SYSTEM_ACTIVATION).
 * There is no cross-provider atomicity: each step records its own outcome,
 * accepted outside effects are never replayed, and the possibility is only
 * "made real" after every declared operating check passes.
 */

const DATE = z.string().datetime();

export const stepKindSchema = z.enum(["stage", "introduce", "effect", "activate", "connect", "verify"]);
export type StepKind = z.infer<typeof stepKindSchema>;

export const stepStatusSchema = z.enum([
  "pending",
  "running",
  /** Done. For an effect step this means the provider accepted it. */
  "completed",
  /** Not attempted: authority, approval or a moved baseline stopped it. Safe to resume. */
  "blocked",
  /** Attempted and refused with no effect. Safe to resume. */
  "failed",
  /** The outcome is not known. Never replayed; reconcile with evidence. */
  "unknown",
  /** An accepted effect was explicitly undone during rollback. */
  "compensated",
  /** A staged/activated internal change was restored during rollback. */
  "restored",
]);
export type StepStatus = z.infer<typeof stepStatusSchema>;

export const activationStepSchema = z.object({
  id: z.string().min(1).max(80),
  kind: stepKindSchema,
  /** Existing systemId, `introduced:<key>`, connection id or effect id. */
  target: z.string().min(1).max(160),
  label: z.string().min(1).max(300),
  dependsOn: z.array(z.string()).max(40),
  scope: authorityScopeSchema.optional(),
  effectKind: effectKindSchema.optional(),
  reversibility: reversibilitySchema,
  /** Stable across attempts so a provider can dedupe a replay. */
  idempotencyKey: z.string().min(1).max(240),
  status: stepStatusSchema,
  effect: z.enum(["none", "accepted", "unknown"]),
  attempts: z.number().int().nonnegative(),
  leaseId: z.string().optional(),
  startedAt: DATE.optional(),
  finishedAt: DATE.optional(),
  reason: z.string().max(2000).optional(),
  receipt: z.object({
    providerRef: z.string().max(240).optional(),
    adapterMode: z.enum(["isolated", "live", "internal"]),
    grantId: z.string().max(120).optional(),
    approvalId: z.string().max(120).optional(),
    acceptedAt: DATE,
    reconciledBy: z.enum(["provider_lookup", "operator_evidence"]).optional(),
    result: z.record(z.string(), z.unknown()).optional(),
  }).strict().optional(),
  /** Read-back is recorded separately from acceptance and never makes the
   * accepted write retryable (AGENTS.md: outside writes). */
  readBack: z.object({ status: z.enum(["confirmed", "failed"]), detail: z.string().max(1000), at: DATE }).strict().optional(),
}).strict();
export type ActivationStep = z.infer<typeof activationStepSchema>;

export const activationStatusSchema = z.enum([
  "in_progress",
  "needs_attention",
  "made_real",
  "rolled_back",
]);
export type ActivationStatus = z.infer<typeof activationStatusSchema>;

export const activationSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1).max(120),
  businessId: z.string().min(1).max(120),
  possibilityId: z.string().min(1).max(120),
  candidateRevision: z.number().int().positive(),
  actorId: z.string().min(1),
  status: activationStatusSchema,
  revision: z.number().int().nonnegative(),
  pinned: z.array(z.object({ systemId: z.string(), baselineRevisionId: z.string(), stagedRevisionId: z.string().optional() }).strict()),
  introduced: z.array(z.object({ key: z.string(), systemId: z.string().optional(), revisionId: z.string().optional() }).strict()),
  connections: z.array(z.object({ id: z.string(), connectionId: z.string().optional() }).strict()),
  approvals: z.array(z.object({ effectId: z.string(), approvalId: z.string().min(1).max(120), approvedBy: z.string(), at: DATE, consumedAt: DATE.optional() }).strict()),
  checks: z.array(z.object({ id: z.string(), description: z.string(), status: z.enum(["pending", "passed", "failed"]), detail: z.string().max(1000).optional(), at: DATE.optional() }).strict()),
  steps: z.array(activationStepSchema).min(1).max(120),
  createdAt: DATE,
  updatedAt: DATE,
  history: z.array(z.object({ revision: z.number().int().positive(), kind: z.string(), actorId: z.string(), at: DATE, detail: z.string().max(1000).optional() }).strict()).max(2000),
}).strict();
export type Activation = z.infer<typeof activationSchema>;
