import type { SavedWork, WorkspaceActor } from "@/platform/workspaces";
import type { OperationEffect } from "@/platform/products";
import { z } from "zod";
import { applicationSpecSchema } from "@/products/applications/contracts";

export const WORK_PLAN_PRODUCT_ID = "work_plans" as const;
export const WORK_PLAN_RESOURCE_KIND = "plan" as const;
export const WORK_PLAN_VERSION = 1 as const;

const identifier = z.string().trim().min(1).max(96).regex(/^[a-z0-9][a-z0-9_-]*$/i);
const text = (max: number) => z.string().trim().min(1).max(max);

const contextSourceId = z.string().uuid();
const contextSourceVersion = z.union([
  z.number().int().nonnegative(),
  z.string().trim().min(1).max(80),
  z.null(),
]);

/** Browser-safe references retained on a saved plan for source citations. */
export const workPlanContextSourceReferenceSchema = z.object({
  workId: contextSourceId,
  productId: z.string().trim().min(1).max(120),
  resourceKind: z.string().trim().min(1).max(120),
  kind: z.enum(["document", "tracker", "assessment"]),
  title: text(160),
  version: contextSourceVersion,
  revision: z.number().int().nonnegative().nullable(),
  updatedAt: z.string().datetime({ offset: true }),
}).strict();
export type WorkPlanContextSourceReference = z.infer<typeof workPlanContextSourceReferenceSchema>;

export const workPlanContextSummarySchema = z.object({
  version: z.literal(1),
  sources: z.array(workPlanContextSourceReferenceSchema).max(6),
}).strict();
export type WorkPlanContextSummary = z.infer<typeof workPlanContextSummarySchema>;

export const workPlanOutcomeSchema = z.enum(["answer", "change", "capability", "responsibility"]);
export type WorkPlanOutcome = z.infer<typeof workPlanOutcomeSchema>;

export const workPlanEvidenceSchema = z.object({
  label: text(120),
  value: text(2_000),
}).strict();
export type WorkPlanEvidence = z.infer<typeof workPlanEvidenceSchema>;

/**
 * A plan may include a small reviewable draft. The draft is data only until a
 * person explicitly accepts the matching output through the execution route.
 */
export const workPlanApplicationDraftSchema = z.object({
  kind: z.literal("application"),
  title: applicationSpecSchema.shape.title,
  fields: applicationSpecSchema.shape.fields,
  components: applicationSpecSchema.shape.components,
}).strict().superRefine((value, context) => {
  const { kind: _kind, ...spec } = value;
  const parsed = applicationSpecSchema.safeParse({ ...spec, maintenanceOwner: "assigned-by-server" });
  if (!parsed.success) for (const issue of parsed.error.issues) context.addIssue({ code: "custom", message: issue.message, path: issue.path });
});

export const workPlanOutputDraftSchema = z.discriminatedUnion("kind", [
  workPlanApplicationDraftSchema,
  z.object({
    kind: z.literal("document"),
    title: text(160),
    text: z.string().max(12_000),
  }).strict(),
  z.object({
    kind: z.literal("tracker"),
    templateId: z.enum(["tasks", "projects", "inventory"]),
    title: text(160).optional(),
  }).strict(),
]);
export type WorkPlanOutputDraft = z.infer<typeof workPlanOutputDraftSchema>;

const workPlanOutputSchema = z.object({
  id: identifier,
  title: text(160),
  description: text(1_000),
  outcome: workPlanOutcomeSchema,
  nativeOperationIds: z.array(identifier).max(12),
  draft: workPlanOutputDraftSchema.optional(),
}).strict();

const workPlanStepSchema = z.object({
  id: identifier,
  title: text(160),
  description: text(1_000),
  dependsOn: z.array(identifier).max(12),
  nativeOperationIds: z.array(identifier).max(12),
}).strict();

const workPlanInputSchema = z.object({
  id: identifier,
  label: text(160),
  reason: text(1_000),
  required: z.boolean(),
}).strict();

const workPlanDecisionSchema = z.object({
  id: identifier,
  question: text(300),
  reason: text(1_000),
}).strict();

/**
 * The model is allowed to propose only identifiers. Server code resolves them
 * against the native product catalog before a plan can be saved.
 */
export const generatedWorkPlanSchema = z.object({
  status: z.enum(["ready", "needs_scoping"]),
  summary: text(1_000),
  proposedOutputs: z.array(workPlanOutputSchema).max(8),
  steps: z.array(workPlanStepSchema).max(16),
  neededInputs: z.array(workPlanInputSchema).max(16),
  supportedNativeOperationIds: z.array(identifier).max(24),
  requiredDecisions: z.array(workPlanDecisionSchema).max(16),
}).strict();
export type GeneratedWorkPlan = z.infer<typeof generatedWorkPlanSchema>;

export interface WorkPlanNativeOperation {
  id: string;
  /** Exact executable capability version selected for this plan. */
  capabilityVersion?: number;
  productId: string;
  resourceKind: string;
  label: string;
  effect: OperationEffect;
  support: "supported" | "release_gated";
  description: string;
}

export const workPlanNativeOperationSchema = z.object({
  id: identifier,
  capabilityVersion: z.number().int().positive().optional(),
  productId: identifier,
  resourceKind: identifier,
  label: text(160),
  effect: z.enum(["read", "create_resource", "propose_change", "external_side_effect"]),
  support: z.enum(["supported", "release_gated"]),
  description: text(1_000),
}).strict();

export interface WorkPlanMetadata {
  revision: 1;
  actorId: string;
  createdBy: string;
  workspaceId: string;
  createdAt: string;
}

export const workPlanSchema = z.object({
  version: z.literal(WORK_PLAN_VERSION),
  status: z.enum(["ready", "needs_scoping"]),
  userGoal: text(3_000),
  summary: text(1_000),
  proposedOutputs: z.array(workPlanOutputSchema).max(8),
  steps: z.array(workPlanStepSchema).max(16),
  neededInputs: z.array(workPlanInputSchema).max(16),
  supportedNativeOperations: z.array(workPlanNativeOperationSchema).max(24),
  /** No trusted pricing source exists for planning yet. Unknown stays null. */
  estimatedCost: z.null(),
  requiredDecisions: z.array(workPlanDecisionSchema).max(16),
  /** Source identities are safe to show with the plan; evidence stays private. */
  context: workPlanContextSummarySchema.optional(),
  metadata: z.object({
    revision: z.literal(1),
    actorId: text(160),
    createdBy: text(160),
    workspaceId: text(160),
    createdAt: z.string().datetime(),
  }).strict(),
}).strict();
export type WorkPlan = z.infer<typeof workPlanSchema>;

export const createWorkPlanRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  userGoal: text(3_000),
  evidence: z.array(workPlanEvidenceSchema).max(12).optional().default([]),
  sourceWorkIds: z.array(z.string().uuid()).max(6).optional(),
  /** A payer-created and accepted work-economics job is required for model generation. */
  planningEconomics: z.object({
    jobId: z.string().uuid(),
    executionKey: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/),
    maximumCents: z.number().int().nonnegative().max(1_000_000),
  }).strict().optional(),
}).strict();
export type CreateWorkPlanRequest = z.infer<typeof createWorkPlanRequestSchema>;

export const executeWorkPlanOutputRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  planWorkId: z.string().uuid(),
  outputId: identifier,
  expectedPlanRevision: z.number().int().positive(),
  operationId: identifier.optional(),
  inputs: z.record(z.string(), z.unknown()).optional().default({}),
  decisions: z.record(z.string(), z.string().trim().min(1).max(1_000)).optional().default({}),
}).strict();
export type ExecuteWorkPlanOutputRequest = z.infer<typeof executeWorkPlanOutputRequestSchema>;

export const workPlanOutputExecutionReceiptSchema = z.object({
  version: z.literal(1),
  kind: z.literal("work_plan_output"),
  planWorkId: z.string().uuid(),
  outputId: identifier,
  planRevision: z.number().int().positive(),
  operationId: identifier,
  /** Required for newly generated plans; optional for pre-capability receipts. */
  capabilityVersion: z.number().int().positive().optional(),
  actorId: z.string().uuid(),
  nativeWorkId: z.string().uuid(),
  completedAt: z.string().datetime({ offset: true }),
}).strict();
export type WorkPlanOutputExecutionReceipt = z.infer<typeof workPlanOutputExecutionReceiptSchema>;

export const workPlanOutputExecutionSchema = z.object({
  planWorkId: z.string().uuid(),
  outputId: identifier,
  status: z.enum(["completed", "already_completed"]),
  nativeWorkId: z.string().uuid(),
  nativeProductId: identifier,
  nativeResourceKind: identifier,
  capabilityVersion: z.number().int().positive().optional(),
  receipt: workPlanOutputExecutionReceiptSchema,
}).strict();
export type WorkPlanOutputExecution = z.infer<typeof workPlanOutputExecutionSchema>;

export interface WorkPlanRecord {
  work: SavedWork;
  plan: WorkPlan;
}

export interface CreateWorkPlanInput extends CreateWorkPlanRequest {
  actor: WorkspaceActor;
}
