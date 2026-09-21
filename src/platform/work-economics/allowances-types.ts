import { z } from "zod";

export const WORK_ALLOWANCE_UNIT_KINDS = [
  "completed_document_change",
  "completed_tracker_change",
  "completed_investigation",
  "completed_application_change",
] as const;
export type WorkAllowanceUnitKind = (typeof WORK_ALLOWANCE_UNIT_KINDS)[number];

export const WORK_ALLOWANCE_SOURCES = ["local_configured", "subscription_configured"] as const;
export type WorkAllowanceSource = (typeof WORK_ALLOWANCE_SOURCES)[number];
/** The legacy local award source remains the default for operator commands. */
export const WORK_ALLOWANCE_SOURCE = "local_configured" as const;
export const MAX_WORK_ALLOWANCE_UNITS = 1_000_000;
export const MAX_PERIOD_SPENDING_CAP_CENTS = 100_000_000;

const UUID = z.string().uuid();
const KEY = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/);
const REFERENCE = z.string().trim().min(1).max(256);
const UNITS = z.number().int().positive().max(MAX_WORK_ALLOWANCE_UNITS);
const UNIT_KIND = z.enum(WORK_ALLOWANCE_UNIT_KINDS);
const DATE_TIME = z.string().datetime({ offset: true });

const grantSchema = z.object({
  unitKind: UNIT_KIND,
  units: UNITS,
}).strict();

export const operatorAllowanceCommandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("award_period"),
    workspaceId: UUID,
    payerId: UUID,
    periodStart: DATE_TIME,
    periodEnd: DATE_TIME,
    spendingCapCents: z.number().int().nonnegative().max(MAX_PERIOD_SPENDING_CAP_CENTS),
    grants: z.array(grantSchema).min(1).max(WORK_ALLOWANCE_UNIT_KINDS.length),
    idempotencyKey: KEY,
  }).strict(),
  z.object({
    action: z.literal("award_contribution_credit"),
    allowanceId: UUID,
    contributionReference: REFERENCE,
    unitKind: UNIT_KIND,
    units: UNITS,
    idempotencyKey: KEY,
  }).strict(),
]);

export const payerAllowanceCommandSchema = z.object({
  action: z.literal("accept_spending_cap"),
  allowanceId: UUID,
}).strict();

export const allowanceReservationSchema = z.object({
  jobId: UUID,
  executionKey: KEY.max(100),
  unitKind: UNIT_KIND,
  units: UNITS,
}).strict();

export const allowanceSettlementSchema = z.object({
  jobId: UUID,
  executionKey: KEY.max(100),
}).strict();

export type OperatorAllowanceCommand = z.infer<typeof operatorAllowanceCommandSchema>;
export type PayerAllowanceCommand = z.infer<typeof payerAllowanceCommandSchema>;
export type WorkAllowanceReservationInput = z.infer<typeof allowanceReservationSchema>;
export type WorkAllowanceSettlementInput = z.infer<typeof allowanceSettlementSchema>;

export function parseOperatorAllowanceCommand(value: unknown): OperatorAllowanceCommand {
  const parsed = operatorAllowanceCommandSchema.safeParse(value);
  if (!parsed.success) throw new WorkAllowanceValidationError("The allowance award is invalid.");
  if (parsed.data.action === "award_period") {
    const start = Date.parse(parsed.data.periodStart);
    const end = Date.parse(parsed.data.periodEnd);
    const unitKinds = new Set(parsed.data.grants.map((grant) => grant.unitKind));
    if (end <= start || end - start > 370 * 24 * 60 * 60 * 1000 || unitKinds.size !== parsed.data.grants.length) {
      throw new WorkAllowanceValidationError("The allowance period or unit grants are invalid.");
    }
  }
  return parsed.data.action === "award_period"
    ? { ...parsed.data, grants: [...parsed.data.grants].sort((a, b) => a.unitKind.localeCompare(b.unitKind)) }
    : parsed.data;
}

export function parsePayerAllowanceCommand(value: unknown): PayerAllowanceCommand {
  const parsed = payerAllowanceCommandSchema.safeParse(value);
  if (!parsed.success) throw new WorkAllowanceValidationError("The allowance command is invalid.");
  return parsed.data;
}

export interface WorkAllowanceBucket {
  unitKind: WorkAllowanceUnitKind;
  grantedUnits: number;
  creditedUnits: number;
  reservedUnits: number;
  consumedUnits: number;
  availableUnits: number;
}

export interface WorkAllowanceRecord {
  id: string;
  workspaceId: string;
  businessName: string;
  payerId: string;
  periodStart: string;
  periodEnd: string;
  spendingCapCents: number;
  reservedCapCents: number;
  consumedCapCents: number;
  actualCostCents: number;
  source: WorkAllowanceSource;
  status: "pending_cap_acceptance" | "active" | "closed";
  capAcceptedBy: string | null;
  capAcceptedAt: string | null;
  createdBy: string;
  createdAt: string;
  buckets: WorkAllowanceBucket[];
  subscription?: WorkAllowanceSubscriptionFact | null;
}

export interface WorkAllowanceSubscriptionFact {
  subscriptionId: string;
  customerId: string | null;
  configKey: string;
  status: "pending" | "active" | "trialing" | "past_due" | "cancelled" | "grandfathered" | "unavailable";
  periodStart: string;
  periodEnd: string;
  lastEventCreated: number;
  synchronizedAt: string;
}

export interface WorkAllowanceInspection {
  allowances: WorkAllowanceRecord[];
  subscription?: WorkAllowanceSubscriptionFact | null;
  policy: {
    stripeSynchronized: boolean;
    pricesDefined: false;
    customerUsageSource: "trusted_execution_receipts";
    retriesConsumeCustomerAllowance: false;
    spendingCapMeaning: "operational_cost_limit_not_invoice_price";
    contributionPayouts: false;
    subscriptionState?: "not_configured" | "pending" | "synchronized" | "unavailable";
  };
}

export interface WorkAllowanceReservation {
  allowanceId: string;
  jobId: string;
  executionKey: string;
  unitKind: WorkAllowanceUnitKind;
  reservedUnits: number;
  reservedCapCents: number;
  status: "reserved" | "consumed" | "released";
  consumedUnits: number;
  actualCostCents: number | null;
  capCostCents: number | null;
  disposition: "reserved" | "consumed" | "released" | "held_unknown";
}

export class WorkAllowanceValidationError extends Error {
  constructor(message: string) { super(message); this.name = "WorkAllowanceValidationError"; }
}
export class WorkAllowanceAccessError extends Error {
  constructor(message = "You do not have access to this allowance.") { super(message); this.name = "WorkAllowanceAccessError"; }
}
export class WorkAllowancePayerError extends WorkAllowanceAccessError {
  constructor() { super("Only the named payer can accept this spending cap."); this.name = "WorkAllowancePayerError"; }
}
export class WorkAllowanceNotFoundError extends Error {
  constructor() { super("The allowance was not found."); this.name = "WorkAllowanceNotFoundError"; }
}
export class WorkAllowanceConflictError extends Error {
  constructor(message = "The allowance changed or has insufficient capacity.") { super(message); this.name = "WorkAllowanceConflictError"; }
}
export class WorkAllowancePersistenceError extends Error {
  constructor(message = "Allowance storage is temporarily unavailable.", options?: { cause?: unknown }) { super(message, options); this.name = "WorkAllowancePersistenceError"; }
}
