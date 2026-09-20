import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getSupabase } from "@/lib/db/client";
import type { WorkspaceActor } from "@/platform/workspaces";
import {
  WORK_ALLOWANCE_UNIT_KINDS,
  WorkAllowanceAccessError,
  WorkAllowanceConflictError,
  WorkAllowanceNotFoundError,
  WorkAllowancePayerError,
  WorkAllowancePersistenceError,
  WorkAllowanceValidationError,
  type WorkAllowanceSubscriptionFact,
  type OperatorAllowanceCommand,
  type PayerAllowanceCommand,
  type WorkAllowanceInspection,
  type WorkAllowanceReservation,
  type WorkAllowanceReservationInput,
  type WorkAllowanceSettlementInput,
} from "./allowances-types";

type AllowanceDatabase = { public: {
  Tables: Record<string, never>;
  Views: Record<string, never>;
  Enums: Record<string, never>;
  CompositeTypes: Record<string, never>;
  Functions: {
    read_work_allowances: { Args: { p_actor_id: string; p_verified_email: string; p_allowance_id: string | null; p_workspace_id: string | null }; Returns: unknown };
    work_allowance_operator_command: { Args: { p_actor_id: string; p_verified_email: string; p_command: unknown }; Returns: string };
    work_allowance_accept_cap: { Args: { p_actor_id: string; p_verified_email: string; p_allowance_id: string }; Returns: string };
    work_allowance_execution_command: { Args: { p_actor_id: string; p_verified_email: string; p_command: unknown }; Returns: unknown };
  };
} };

const bucketResult = z.object({
  unitKind: z.enum(WORK_ALLOWANCE_UNIT_KINDS),
  grantedUnits: z.number().int().nonnegative(),
  creditedUnits: z.number().int().nonnegative(),
  reservedUnits: z.number().int().nonnegative(),
  consumedUnits: z.number().int().nonnegative(),
  availableUnits: z.number().int().nonnegative(),
}).strict();

const subscriptionFactResult = z.object({
  subscriptionId: z.string().min(1),
  customerId: z.string().nullable(),
  configKey: z.string().min(1),
  status: z.enum(["pending", "active", "trialing", "past_due", "cancelled", "grandfathered", "unavailable"]),
  periodStart: z.string(),
  periodEnd: z.string(),
  lastEventCreated: z.number().int().nonnegative(),
  synchronizedAt: z.string(),
}).strict();

const allowanceResult = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  businessName: z.string().min(1),
  payerId: z.string().uuid(),
  periodStart: z.string(),
  periodEnd: z.string(),
  spendingCapCents: z.number().int().nonnegative(),
  reservedCapCents: z.number().int().nonnegative(),
  consumedCapCents: z.number().int().nonnegative(),
  actualCostCents: z.number().int().nonnegative(),
  source: z.enum(["local_configured", "subscription_configured"]),
  status: z.enum(["pending_cap_acceptance", "active", "closed"]),
  capAcceptedBy: z.string().uuid().nullable(),
  capAcceptedAt: z.string().nullable(),
  createdBy: z.string().uuid(),
  createdAt: z.string(),
  buckets: z.array(bucketResult),
  subscription: subscriptionFactResult.nullable().optional(),
}).strict();

const inspectionResult = z.object({
  allowances: z.array(allowanceResult),
  subscription: subscriptionFactResult.nullable().optional(),
}).strict();
const reservationResult = z.object({
  allowanceId: z.string().uuid(),
  jobId: z.string().uuid(),
  executionKey: z.string(),
  unitKind: z.enum(WORK_ALLOWANCE_UNIT_KINDS),
  reservedUnits: z.number().int().nonnegative(),
  reservedCapCents: z.number().int().nonnegative(),
  status: z.enum(["reserved", "consumed", "released"]),
  consumedUnits: z.number().int().nonnegative(),
  actualCostCents: z.number().int().nonnegative().nullable(),
  capCostCents: z.number().int().nonnegative().nullable(),
  disposition: z.enum(["reserved", "consumed", "released", "held_unknown"]),
}).strict().nullable();

const POLICY = Object.freeze({
  stripeSynchronized: false,
  pricesDefined: false,
  customerUsageSource: "trusted_execution_receipts",
  retriesConsumeCustomerAllowance: false,
  spendingCapMeaning: "operational_cost_limit_not_invoice_price",
  contributionPayouts: false,
} as const);

function policyFor(subscription: WorkAllowanceSubscriptionFact | null | undefined) {
  const synchronized = Boolean(subscription && subscription.status !== "unavailable");
  return {
    ...POLICY,
    stripeSynchronized: synchronized,
    subscriptionState: !subscription
      ? "not_configured" as const
      : subscription.status === "unavailable"
        ? "unavailable" as const
        : subscription.status === "pending"
          ? "pending" as const
          : "synchronized" as const,
  };
}

function client(): SupabaseClient<AllowanceDatabase> {
  const value = getSupabase();
  if (!value) throw new WorkAllowancePersistenceError("Allowance storage is not configured.");
  return value as unknown as SupabaseClient<AllowanceDatabase>;
}

function identity(actor: WorkspaceActor) {
  const parsed = z.object({ userId: z.string().uuid(), verifiedEmail: z.string().email() }).safeParse({
    userId: actor.userId,
    verifiedEmail: actor.verifiedEmail.trim().toLowerCase(),
  });
  if (!parsed.success) throw new WorkAllowanceAccessError("A verified signed-in identity is required.");
  return { p_actor_id: parsed.data.userId, p_verified_email: parsed.data.verifiedEmail };
}

function fail(error: { message?: string } | null, fallback = "Allowance storage is temporarily unavailable."): never {
  const detail = error?.message ?? "";
  if (detail.includes("work_allowance_payer_required")) throw new WorkAllowancePayerError();
  if (detail.includes("work_allowance_identity_denied") || detail.includes("work_allowance_access_denied") || detail.includes("work_allowance_operator_required")) {
    throw new WorkAllowanceAccessError();
  }
  if (detail.includes("work_allowance_not_found") || detail.includes("work_allowance_target_not_found")) throw new WorkAllowanceNotFoundError();
  if (detail.includes("work_allowance_command_invalid")) throw new WorkAllowanceValidationError("The allowance command is invalid.");
  if (detail.includes("work_allowance_")) {
    throw new WorkAllowanceConflictError(
      detail.includes("capacity_exceeded") ? "This allowance has insufficient unit or spending-cap capacity."
        : detail.includes("period_overlap") ? "This payer already has an allowance for part of that period."
          : detail.includes("idempotency_conflict") ? "That idempotency key was already used for a different award."
            : "The allowance or execution receipt changed. Reload before continuing.",
    );
  }
  throw new WorkAllowancePersistenceError(fallback, { cause: error ?? undefined });
}

export async function readStoredWorkAllowances(
  actor: WorkspaceActor,
  query: { allowanceId?: string; workspaceId?: string },
): Promise<WorkAllowanceInspection> {
  const { data, error } = await client().rpc("read_work_allowances", {
    ...identity(actor),
    p_allowance_id: query.allowanceId ?? null,
    p_workspace_id: query.workspaceId ?? null,
  });
  if (error) fail(error, "Allowances could not be read.");
  const parsed = inspectionResult.safeParse(data);
  if (!parsed.success) throw new WorkAllowancePersistenceError("Allowance storage returned an invalid record.");
  return { ...parsed.data, policy: policyFor(parsed.data.subscription) };
}

export async function applyOperatorAllowanceCommand(actor: WorkspaceActor, command: OperatorAllowanceCommand): Promise<string> {
  const { data, error } = await client().rpc("work_allowance_operator_command", { ...identity(actor), p_command: command });
  if (error) fail(error, "The allowance award could not be confirmed.");
  const parsed = z.string().uuid().safeParse(data);
  if (!parsed.success) throw new WorkAllowancePersistenceError("The allowance award returned no record.");
  return parsed.data;
}

export async function applyPayerAllowanceCommand(actor: WorkspaceActor, command: PayerAllowanceCommand): Promise<string> {
  const { data, error } = await client().rpc("work_allowance_accept_cap", { ...identity(actor), p_allowance_id: command.allowanceId });
  if (error) fail(error, "The spending-cap acceptance could not be confirmed.");
  const parsed = z.string().uuid().safeParse(data);
  if (!parsed.success) throw new WorkAllowancePersistenceError("The spending-cap acceptance returned no record.");
  return parsed.data;
}

async function executionCommand(actor: WorkspaceActor, command: Record<string, unknown>): Promise<WorkAllowanceReservation | null> {
  const { data, error } = await client().rpc("work_allowance_execution_command", { ...identity(actor), p_command: command });
  if (error) fail(error, "The allowance reservation could not be confirmed.");
  const parsed = reservationResult.safeParse(data);
  if (!parsed.success) throw new WorkAllowancePersistenceError("Allowance storage returned an invalid execution reservation.");
  return parsed.data;
}

export function reserveStoredWorkAllowance(actor: WorkspaceActor, input: WorkAllowanceReservationInput): Promise<WorkAllowanceReservation | null> {
  return executionCommand(actor, { action: "reserve", ...input });
}

export function settleStoredWorkAllowance(actor: WorkspaceActor, input: WorkAllowanceSettlementInput): Promise<WorkAllowanceReservation | null> {
  return executionCommand(actor, { action: "settle", ...input });
}
