import { z } from "zod";
import type { WorkspaceActor } from "@/platform/workspaces";
import {
  allowanceReservationSchema,
  allowanceSettlementSchema,
  parseOperatorAllowanceCommand,
  parsePayerAllowanceCommand,
  WorkAllowanceValidationError,
  type WorkAllowanceInspection,
  type WorkAllowanceReservation,
} from "./allowances-types";
import {
  applyOperatorAllowanceCommand,
  applyPayerAllowanceCommand,
  readStoredWorkAllowances,
  reserveStoredWorkAllowance,
  settleStoredWorkAllowance,
} from "./allowances-repository";

const readQuery = z.object({
  allowanceId: z.string().uuid().optional(),
  workspaceId: z.string().uuid().optional(),
}).strict().refine((value) => Boolean(value.allowanceId || value.workspaceId));

export async function inspectWorkAllowances(actor: WorkspaceActor, input: unknown): Promise<WorkAllowanceInspection> {
  const parsed = readQuery.safeParse(input);
  if (!parsed.success) throw new WorkAllowanceValidationError("An allowance or business is required.");
  return readStoredWorkAllowances(actor, parsed.data);
}

/** Operator authority is checked by both the route and the SQL command. */
export async function awardWorkAllowance(actor: WorkspaceActor, input: unknown): Promise<WorkAllowanceInspection> {
  const command = parseOperatorAllowanceCommand(input);
  const allowanceId = await applyOperatorAllowanceCommand(actor, command);
  return readStoredWorkAllowances(actor, { allowanceId });
}

export async function acceptWorkAllowanceCap(actor: WorkspaceActor, input: unknown): Promise<WorkAllowanceInspection> {
  const command = parsePayerAllowanceCommand(input);
  const allowanceId = await applyPayerAllowanceCommand(actor, command);
  return readStoredWorkAllowances(actor, { allowanceId });
}

/**
 * Trusted execution hook. The database derives the business, payer, dollar
 * hold and current period from the existing execution receipt. A null result
 * means that payer has no configured allowance for this unit and period.
 */
export function reserveAvailableWorkAllowance(actor: WorkspaceActor, input: unknown): Promise<WorkAllowanceReservation | null> {
  const parsed = allowanceReservationSchema.safeParse(input);
  if (!parsed.success) throw new WorkAllowanceValidationError("The allowance reservation is invalid.");
  return reserveStoredWorkAllowance(actor, parsed.data);
}

/**
 * Trusted execution hook. Unknown effects or costs retain their reservation;
 * Strelva retries and proven no-effect receipts release customer capacity.
 */
export function settleWorkAllowanceExecution(actor: WorkspaceActor, input: unknown): Promise<WorkAllowanceReservation | null> {
  const parsed = allowanceSettlementSchema.safeParse(input);
  if (!parsed.success) throw new WorkAllowanceValidationError("The allowance settlement is invalid.");
  return settleStoredWorkAllowance(actor, parsed.data);
}
