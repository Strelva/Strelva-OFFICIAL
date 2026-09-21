import { z } from "zod";

/**
 * Version for the server-side executable-capability contract. This is the
 * shape of a definition, not the version of one particular capability.
 */
export const EXECUTABLE_CAPABILITY_CONTRACT_VERSION = 1 as const;

export const capabilityIdSchema = z.string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z][a-z0-9_.-]*$/);

export const capabilityVersionSchema = z.number().int().positive().max(10_000);

export const capabilityEntranceSchema = z.enum([
  "planner",
  "runner",
  "api",
  "event",
  "schedule",
  "contextual",
]);

export type CapabilityEntrance = z.infer<typeof capabilityEntranceSchema>;

export const capabilitySupportSchema = z.enum([
  "supported",
  "release_gated",
  "managed_only",
  "internal_only",
  "external_pilot",
  "not_enabled",
]);

export type CapabilitySupport = z.infer<typeof capabilitySupportSchema>;

export const capabilityEffectSchema = z.enum([
  "read",
  "create_resource",
  "propose_change",
  "external_side_effect",
]);

export type CapabilityEffect = z.infer<typeof capabilityEffectSchema>;

export const capabilityOwningScopeSchema = z.enum([
  "workspace",
  "tenant",
  "resource",
  "external_product",
]);

export type CapabilityOwningScope = z.infer<typeof capabilityOwningScopeSchema>;

export const capabilityAuthorityRequirementSchema = z.enum([
  "workspace_membership",
  "resource_owner",
  "tenant_membership",
  "scoped_delegation",
  "operator",
  "super_admin",
]);

export type CapabilityAuthorityRequirement = z.infer<typeof capabilityAuthorityRequirementSchema>;

export const capabilityApprovalSchema = z.enum([
  "none",
  "operation_policy",
  "customer_approval",
  "external_product",
]);

export type CapabilityApproval = z.infer<typeof capabilityApprovalSchema>;

export const capabilityAuthoritySchema = z.object({
  requirements: z.array(capabilityAuthorityRequirementSchema).min(1).max(6).readonly(),
  approval: capabilityApprovalSchema,
  /** Every native command must recheck the current scope at execution time. */
  recheckAtExecution: z.literal(true),
  /** Resource reads and writes may not cross this boundary implicitly. */
  scope: z.enum(["same_workspace", "same_tenant", "explicit_external"]),
}).strict();

export type CapabilityAuthority = z.infer<typeof capabilityAuthoritySchema>;

export const capabilityCostSchema = z.object({
  mode: z.enum(["none", "budget_required"]),
  currency: z.literal("usd"),
  /** null means the definition has no trusted estimate at registration time. */
  estimateCents: z.number().int().nonnegative().nullable(),
  maximumCents: z.number().int().nonnegative().nullable(),
  source: z.enum(["native_local", "provider", "unknown"]),
}).strict();

export type CapabilityCost = z.infer<typeof capabilityCostSchema>;

export const capabilityIdempotencySchema = z.object({
  mode: z.enum(["none", "stable_request", "work_plan_output", "native_command"]),
  /** The operation may be attempted again only through its reconciliation path. */
  retry: z.enum(["safe", "reconcile_only", "never"]),
  keyFields: z.array(z.string().trim().min(1).max(80)).max(12).readonly(),
}).strict();

export type CapabilityIdempotency = z.infer<typeof capabilityIdempotencySchema>;

export const capabilityReconciliationSchema = z.object({
  mode: z.enum(["none", "native_receipt", "read_back", "operator"]),
  /** An accepted provider write cannot become retryable because a read-back failed. */
  acceptedWriteClosed: z.literal(true),
}).strict();

export type CapabilityReconciliation = z.infer<typeof capabilityReconciliationSchema>;

export const capabilityVerificationSchema = z.object({
  mode: z.enum(["none", "native_receipt", "read_back", "operator"]),
  evidence: z.enum(["none", "local_receipt", "provider_receipt", "read_back", "operator_record"]),
}).strict();

export type CapabilityVerification = z.infer<typeof capabilityVerificationSchema>;

export const capabilityExecutionSchema = z.object({
  effect: capabilityEffectSchema,
  idempotency: capabilityIdempotencySchema,
  reconciliation: capabilityReconciliationSchema,
  verification: capabilityVerificationSchema,
}).strict();

export type CapabilityExecution = z.infer<typeof capabilityExecutionSchema>;

export const capabilityCompatibilitySchema = z.object({
  contractVersion: z.literal(EXECUTABLE_CAPABILITY_CONTRACT_VERSION),
  inputVersion: capabilityVersionSchema,
  outputVersion: capabilityVersionSchema,
  resourceKinds: z.array(z.string().trim().min(1).max(120)).min(1).max(8).readonly(),
  /** Descriptive route/API names only. They do not grant access. */
  entrances: z.array(capabilityEntranceSchema).min(1).max(6).readonly(),
  /** Client and persisted payload compatibility is checked by the native command. */
  status: z.enum(["compatible", "migration_required", "planned"]),
  notes: z.string().trim().min(1).max(1_000),
}).strict();

export type CapabilityCompatibility = z.infer<typeof capabilityCompatibilitySchema>;

/**
 * The adapter key names a product-owned command boundary. It is intentionally
 * a string so this platform layer cannot import and duplicate product writes.
 */
export const capabilityAdapterKeySchema = z.string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-z][a-z0-9_.-]*$/);

export type CapabilityAdapterKey = z.infer<typeof capabilityAdapterKeySchema>;

export type CapabilitySchema<T> = z.ZodType<T>;

export interface ExecutableCapabilityDefinition<TInput = unknown, TResult = unknown> {
  readonly contractVersion: typeof EXECUTABLE_CAPABILITY_CONTRACT_VERSION;
  readonly id: string;
  readonly version: number;
  /** Groups entrances that act on the same native product boundary. */
  readonly family: string;
  readonly productId: string;
  readonly resourceKind: string;
  readonly label: string;
  readonly description: string;
  readonly support: CapabilitySupport;
  readonly owningScope: CapabilityOwningScope;
  readonly authority: CapabilityAuthority;
  readonly cost: CapabilityCost;
  readonly execution: CapabilityExecution;
  readonly adapterKey: CapabilityAdapterKey;
  readonly entrances: readonly CapabilityEntrance[];
  readonly compatibility: CapabilityCompatibility;
  readonly inputSchema: CapabilitySchema<TInput>;
  readonly resultSchema: CapabilitySchema<TResult>;
}

export const qualificationEvidenceKindSchema = z.enum([
  "focused_test",
  "integration_test",
  "review",
  "provider_check",
]);

export type QualificationEvidenceKind = z.infer<typeof qualificationEvidenceKindSchema>;

export const qualificationEvidenceEnvironmentSchema = z.enum([
  "local",
  "preview",
  "production",
  "external",
]);

export type QualificationEvidenceEnvironment = z.infer<typeof qualificationEvidenceEnvironmentSchema>;

export const qualificationEvidenceSchema = z.object({
  id: capabilityIdSchema,
  capabilityId: capabilityIdSchema,
  capabilityVersion: capabilityVersionSchema,
  kind: qualificationEvidenceKindSchema,
  environment: qualificationEvidenceEnvironmentSchema,
  status: z.enum(["passed", "failed"]),
  reference: z.string().trim().min(1).max(500),
  checkedAt: z.string().datetime({ offset: true }),
  summary: z.string().trim().min(1).max(1_000),
}).strict();

export type CapabilityQualificationEvidence = z.infer<typeof qualificationEvidenceSchema>;

export const qualificationRecordSchema = z.object({
  capabilityId: capabilityIdSchema,
  capabilityVersion: capabilityVersionSchema,
  status: z.literal("qualified"),
  qualifiedAt: z.string().datetime({ offset: true }),
  evidence: z.array(qualificationEvidenceSchema).min(1).max(20).readonly(),
  /** Qualification is never a substitute for caller or product authorization. */
  note: z.string().trim().min(1).max(1_000),
}).strict();

export type CapabilityQualificationRecord = z.infer<typeof qualificationRecordSchema>;

/** A descriptor safe to pass to a planner or discovery surface. */
export interface ExecutableCapabilityDescriptor {
  id: string;
  version: number;
  family: string;
  productId: string;
  resourceKind: string;
  label: string;
  description: string;
  effect: CapabilityEffect;
  support: CapabilitySupport;
  owningScope: CapabilityOwningScope;
  entrances: readonly CapabilityEntrance[];
  adapterKey: CapabilityAdapterKey;
}

export type QualifiedExecutableCapability<TInput = unknown, TResult = unknown> =
  Readonly<{
    definition: ExecutableCapabilityDefinition<TInput, TResult>;
    qualification: CapabilityQualificationRecord;
  }>;

export function capabilityDescriptor(
  definition: ExecutableCapabilityDefinition,
): ExecutableCapabilityDescriptor {
  return Object.freeze({
    id: definition.id,
    version: definition.version,
    family: definition.family,
    productId: definition.productId,
    resourceKind: definition.resourceKind,
    label: definition.label,
    description: definition.description,
    effect: definition.execution.effect,
    support: definition.support,
    owningScope: definition.owningScope,
    entrances: Object.freeze([...definition.entrances]),
    adapterKey: definition.adapterKey,
  });
}
