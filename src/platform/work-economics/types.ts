import { z } from "zod";

/**
 * This ledger is a local authorization record. It does not charge Stripe,
 * call a paid provider, or claim that a provider enforced a budget.
 */
export const JOB_ECONOMICS_CURRENCY = "usd" as const;
export const MAX_JOB_ECONOMICS_CENTS = 1_000_000;
export const JOB_ECONOMICS_POLICY = Object.freeze({
  accounting: "local_explicit_budget",
  providerEnforcement: "not_wired",
  stripeCharged: false,
  paidProvidersInvoked: false,
} as const);

const UUID = z.string().uuid();
const CENTS = z.number().int().nonnegative().max(MAX_JOB_ECONOMICS_CENTS);
const ID = z.string().trim().min(1).max(256).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/);
const TENANT = z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,62}$/);

export const JOB_ECONOMICS_PRODUCTS = ["tracker", "ai_visibility", "inquiry", "operations", "work_plans", "custom-applications"] as const;
export type JobEconomicsProduct = (typeof JOB_ECONOMICS_PRODUCTS)[number];

export const JOB_ECONOMICS_RESOURCE_KINDS = [
  "tracker",
  "private_ai_visibility_work",
  "ai_visibility_assessment",
  "inquiry_capability",
  "responsibility",
  "plan",
  "custom-application",
] as const;
export type JobEconomicsResourceKind = (typeof JOB_ECONOMICS_RESOURCE_KINDS)[number];

const createCommandSchema = z.object({
  action: z.literal("create"),
  productId: z.enum(JOB_ECONOMICS_PRODUCTS),
  resourceKind: z.enum(JOB_ECONOMICS_RESOURCE_KINDS),
  workspaceId: UUID.nullable().optional(),
  workId: UUID.nullable().optional(),
  tenantId: TENANT.nullable().optional(),
  businessId: ID.nullable().optional(),
  requestId: ID.nullable().optional(),
  capabilityId: ID.nullable().optional(),
  /** Omit to make the authenticated actor the payer. */
  payerId: UUID.optional(),
  /** Null is an explicit unknown estimate. It is never interpreted as zero. */
  estimateCents: CENTS.nullable(),
  maxAuthorizedCents: CENTS,
}).strict();

const jobCommandSchema = z.discriminatedUnion("action", [
  createCommandSchema,
  z.object({ action: z.literal("accept"), jobId: UUID }).strict(),
  z.object({
    action: z.literal("reserve"),
    jobId: UUID,
    idempotencyKey: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/),
    amountCents: CENTS,
  }).strict(),
  z.object({
    action: z.literal("report_usage"),
    jobId: UUID,
    idempotencyKey: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/),
    kind: z.enum(["provider", "model", "tool", "human"]),
    attribution: z.enum(["normal", "strelva_retry"]),
    /** Null is an explicitly unknown measured amount. */
    amountCents: CENTS.nullable(),
  }).strict(),
  z.object({ action: z.literal("settle"), jobId: UUID, actualCents: CENTS }).strict(),
  z.object({ action: z.literal("cancel"), jobId: UUID }).strict(),
]);

export type JobEconomicsCommand = z.infer<typeof jobCommandSchema>;
export type CreateJobEconomicsCommand = z.infer<typeof createCommandSchema>;

export function parseJobEconomicsCommand(value: unknown): JobEconomicsCommand {
  const result = jobCommandSchema.safeParse(value);
  if (!result.success) throw new JobEconomicsValidationError("The work economics command is invalid.");
  const command = result.data;
  if (command.action === "create") {
    if (command.estimateCents !== null && command.estimateCents > command.maxAuthorizedCents) {
      throw new JobEconomicsValidationError("The estimate cannot exceed the authorized maximum.");
    }
    if (command.productId !== "inquiry") {
      const expectedKind = command.productId === "tracker"
        ? command.resourceKind === "tracker"
        : command.productId === "operations" ? command.resourceKind === "responsibility"
          : command.productId === "work_plans" ? command.resourceKind === "plan"
            : command.productId === "custom-applications" ? command.resourceKind === "custom-application"
            : command.resourceKind === "private_ai_visibility_work" || command.resourceKind === "ai_visibility_assessment";
      const requiresSavedWork = command.productId !== "work_plans";
      if (!expectedKind || !command.workspaceId || (requiresSavedWork && !command.workId)
        || (!requiresSavedWork && command.workId !== undefined && command.workId !== null)
        || command.tenantId !== undefined || command.businessId !== undefined
        || command.requestId !== undefined || command.capabilityId !== undefined) {
        throw new JobEconomicsValidationError("This workspace product reference is invalid.");
      }
    } else if (command.resourceKind !== "inquiry_capability"
      || command.workspaceId !== undefined || command.workId !== undefined
      || !command.tenantId || !command.businessId || !command.requestId || !command.capabilityId) {
      throw new JobEconomicsValidationError("This inquiry product reference is invalid.");
    }
  }
  return command;
}

export function parseJobEconomicsId(value: unknown): string {
  const result = UUID.safeParse(value);
  if (!result.success) throw new JobEconomicsValidationError("A valid job id is required.");
  return result.data;
}

export type JobEconomicsStatus = "draft" | "accepted" | "reserved" | "settled" | "cancelled";

export interface JobEconomicsRecord {
  id: string;
  workspaceId: string | null;
  workId: string | null;
  productId: JobEconomicsProduct;
  resourceKind: JobEconomicsResourceKind;
  tenantId: string | null;
  businessId: string | null;
  requestId: string | null;
  capabilityId: string | null;
  payerId: string;
  currency: typeof JOB_ECONOMICS_CURRENCY;
  estimateCents: number | null;
  maxAuthorizedCents: number;
  reservedCents: number;
  usedCents: number;
  /** Known Strelva-caused retry cost, tracked separately from customer usage. */
  strelvaRetryCents: number;
  actualCents: number | null;
  actualKnown: boolean;
  status: JobEconomicsStatus;
  createdBy: string;
  acceptedBy: string | null;
  acceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type JobEconomicsUsageKind = "provider" | "model" | "tool" | "human";
export type JobEconomicsAttribution = "normal" | "strelva_retry";

export interface JobEconomicsUsage {
  id: string;
  jobId: string;
  idempotencyKey: string;
  kind: JobEconomicsUsageKind;
  attribution: JobEconomicsAttribution;
  amountCents: number | null;
  known: boolean;
  /** Neither source is independently verified provider billing. */
  source: "operator_reported" | "runtime_reported";
  recordedBy: string;
  createdAt: string;
}

export interface JobEconomicsReservation {
  id: string;
  jobId: string;
  idempotencyKey: string;
  amountCents: number;
  createdBy: string;
  createdAt: string;
}

export interface JobEconomicsInspection {
  job: JobEconomicsRecord;
  usage: JobEconomicsUsage[];
  reservations: JobEconomicsReservation[];
  executions?: import("./execution-contracts").BudgetExecution[];
  policy: typeof JOB_ECONOMICS_POLICY;
}

export class JobEconomicsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobEconomicsValidationError";
  }
}

export class JobEconomicsAccessError extends Error {
  constructor(message = "You do not have access to this work economics record.") {
    super(message);
    this.name = "JobEconomicsAccessError";
  }
}

export class JobEconomicsPayerError extends JobEconomicsAccessError {
  constructor() {
    super("Only the named payer can accept this budget.");
    this.name = "JobEconomicsPayerError";
  }
}

export class JobEconomicsNotFoundError extends Error {
  constructor(message = "The work economics record was not found.") {
    super(message);
    this.name = "JobEconomicsNotFoundError";
  }
}

export class JobEconomicsConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobEconomicsConflictError";
  }
}

export class JobEconomicsPersistenceError extends Error {
  constructor(message = "Work economics storage is temporarily unavailable.", options?: { cause?: unknown }) {
    super(message, options);
    this.name = "JobEconomicsPersistenceError";
  }
}

export class JobEconomicsTargetError extends JobEconomicsNotFoundError {
  constructor() {
    super("The referenced native work does not exist or is not available to you.");
    this.name = "JobEconomicsTargetError";
  }
}
