import { z } from "zod";
import { verifiedPayerReceipt } from "./payer-receipts";
import { getSupabase } from "@/platform/infra/db/client";

export type PayerTransitionStatus = "pending" | "accepted" | "rejected" | "revoked" | "stale";
/**
 * Who would pay (20261009154000_payer_party.sql): a named person signing for
 * the business, an agency workspace (any of its owners/admins answers), or
 * the business itself (an owner answers; switches back from agency pays).
 */
export type PayerSuccessorKind = "user" | "agency" | "business";
export type PayerTransition = {
  id: string;
  workspaceId: string;
  successorKind: PayerSuccessorKind;
  /** Empty unless the successor is a person. */
  successorUserId: string;
  successorEmail: string;
  successorWorkspaceId: string | null;
  successorWorkspaceName: string | null;
  proposerEmail: string;
  status: PayerTransitionStatus;
  proposedAt: string;
  resolvedAt: string | null;
  acceptedAt: string | null;
  workspaceName?: string;
  /** Read-time eligibility only; the command rechecks current authority. */
  isCurrent: boolean;
  canRespond: boolean;
  canRevoke: boolean;
};
export type PayerTransitionSnapshot = {
  /** null identifies the account inbox; never a business snapshot. */
  workspaceId: string | null;
  transitions: PayerTransition[];
  current: PayerTransition | null;
  pending: PayerTransition | null;
  currentActorId: string;
  jobs?: PayerJobObligation[];
};
export type PayerTransitionReceipt = {
  kind: "payer_transition";
  action: "propose" | "accept" | "reject" | "revoke";
  id: string;
  workspaceId: string;
  status: PayerTransitionStatus;
  successorKind: PayerSuccessorKind;
};
export type PayerJobReceipt = { kind: "payer_job"; action: "accept_job"; id: string; workspaceId: string; status: string };
export type PayerCommandResult = { receipt: PayerTransitionReceipt | PayerJobReceipt };
export type PayerJobObligation = { id: string; workspaceId: string; workspaceName: string; productId: string; resourceKind: string; estimateCents: number | null; maxAuthorizedCents: number; reservedCents: number; usedCents: number; actualCents: number | null; actualKnown: boolean; status: string; createdAt: string };

export class PayerTransitionAccessError extends Error {}
export class PayerTransitionConflictError extends Error {}
export class PayerTransitionNotFoundError extends Error {}
export class PayerTransitionValidationError extends Error {}
export class PayerTransitionPersistenceError extends Error {}

const commandSchema = z.union([
  z.object({ action: z.literal("propose"), workspaceId: z.string().uuid(), successorEmail: z.string().trim().email().max(254).transform(value => value.toLowerCase()) }).strict(),
  z.object({ action: z.literal("propose"), workspaceId: z.string().uuid(), successorAgencyWorkspaceId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("propose"), workspaceId: z.string().uuid(), successorKind: z.literal("business") }).strict(),
  z.object({ action: z.enum(["accept", "reject", "revoke"]), transitionId: z.string().uuid() }).strict(),
]);

function detail(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const value = error as { message?: unknown; details?: unknown };
  return `${typeof value.message === "string" ? value.message : ""} ${typeof value.details === "string" ? value.details : ""}`.toLowerCase();
}
function databaseError(error: unknown): never {
  const value = detail(error);
  if (value.includes("payer_transition_command_invalid")) throw new PayerTransitionValidationError("Check the payer change request.");
  if (value.includes("payer_transition_not_found")) throw new PayerTransitionNotFoundError("That payer change is unavailable.");
  if (value.includes("payer_transition_owner_required")) throw new PayerTransitionAccessError("Only a business owner can propose or revoke a payer change.");
  if (value.includes("payer_transition_successor_required")) throw new PayerTransitionAccessError("Only the addressed person, an owner or admin of the addressed agency, or a business owner (for the business itself) can accept or reject this payer change.");
  if (value.includes("payer_transition_identity_denied") || value.includes("payer_transition_workspace_denied")) throw new PayerTransitionAccessError("This business is unavailable to your account.");
  if (value.includes("payer_transition_successor_unavailable")) throw new PayerTransitionConflictError("The proposed payer must be a verified account or an agency workspace.");
  if (value.includes("job_economics_payer_required") || value.includes("job_economics_workspace_denied")) throw new PayerTransitionAccessError("Only the exact payer can accept this job limit.");
  if (value.includes("job_economics_identity_denied")) throw new PayerTransitionAccessError("This financial request is unavailable to your account.");
  if (value.includes("payer_transition_not_pending")) throw new PayerTransitionConflictError("This payer change is no longer pending.");
  throw new PayerTransitionPersistenceError("The payer change could not be confirmed.");
}

function map(row: Record<string, unknown>): PayerTransition {
  const string = (name: string) => typeof row[name] === "string" ? row[name] as string : "";
  const kind = string("successor_kind");
  return {
    id: string("id"), workspaceId: string("workspace_id"),
    successorKind: kind === "agency" || kind === "business" ? kind : "user",
    successorUserId: string("successor_user_id"), successorEmail: string("successor_email"),
    successorWorkspaceId: typeof row.successor_workspace_id === "string" ? row.successor_workspace_id : null,
    successorWorkspaceName: typeof row.successor_workspace_name === "string" ? row.successor_workspace_name : null,
    proposerEmail: string("proposer_email"),
    isCurrent: row.is_current === true, canRespond: row.can_respond === true, canRevoke: row.can_revoke === true,
    status: string("status") as PayerTransitionStatus, proposedAt: string("proposed_at"),
    resolvedAt: typeof row.resolved_at === "string" ? row.resolved_at : null,
    acceptedAt: typeof row.accepted_at === "string" ? row.accepted_at : null,
    workspaceName: typeof row.workspace_name === "string" ? row.workspace_name : undefined,
  };
}

export async function readPayerTransitionInbox(actor: Actor): Promise<PayerTransitionSnapshot> {
  const client = getSupabase();
  if (!client) throw new PayerTransitionPersistenceError("Payer transition storage is not configured.");
  const rpc = (client as unknown as { rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown[] | null; error: unknown }> }).rpc.bind(client);
  const args = { p_actor_id: actor.userId, p_verified_email: actor.verifiedEmail };
  const [result, jobResult] = await Promise.all([rpc("workspace_payer_transition_inbox_v2", args), rpc("job_economics_payer_inbox", args)]);
  if (result.error) databaseError(result.error);
  if (jobResult.error) databaseError(jobResult.error);
  const transitions = ((result.data ?? []) as Record<string, unknown>[]).map(map);
  const jobs = ((jobResult.data ?? []) as Record<string, unknown>[]).map(row => ({
    id: String(row.id), workspaceId: String(row.workspace_id), workspaceName: String(row.workspace_name), productId: String(row.product_id), resourceKind: String(row.resource_kind),
    estimateCents: typeof row.estimate_cents === "number" ? row.estimate_cents : null, maxAuthorizedCents: Number(row.max_authorized_cents), reservedCents: Number(row.reserved_cents), usedCents: Number(row.used_cents),
    actualCents: typeof row.actual_cents === "number" ? row.actual_cents : null, actualKnown: row.actual_known === true, status: String(row.status), createdAt: String(row.created_at),
  }));
  return { workspaceId: null, transitions, current: null, pending: null, currentActorId: actor.userId, jobs };
}

type Actor = { userId: string; verifiedEmail: string };

export async function readPayerTransitions(actor: Actor, workspaceId: string): Promise<PayerTransitionSnapshot> {
  const parsed = z.string().uuid().safeParse(workspaceId);
  if (!parsed.success) throw new PayerTransitionValidationError("Choose a valid business workspace.");
  const client = getSupabase();
  if (!client) throw new PayerTransitionPersistenceError("Payer transition storage is not configured.");
  const result = await (client as unknown as { rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown[] | null; error: unknown }> }).rpc("workspace_payer_transition_snapshot_v2", { p_workspace_id: parsed.data, p_actor_id: actor.userId, p_verified_email: actor.verifiedEmail });
  if (result.error) databaseError(result.error);
  const transitions = ((result.data ?? []) as Record<string, unknown>[]).map(map);
  return {
    workspaceId: parsed.data,
    transitions,
    current: transitions.find(item => item.status === "accepted" && item.isCurrent) ?? null,
    pending: transitions.find(item => item.status === "pending") ?? null,
    currentActorId: actor.userId,
  };
}

export async function commandPayerTransition(actor: Actor, input: unknown): Promise<PayerCommandResult> {
  let command;
  try { command = commandSchema.parse(input); }
  catch { throw new PayerTransitionValidationError("Check the payer change request."); }
  const client = getSupabase();
  if (!client) throw new PayerTransitionPersistenceError("Payer transition storage is not configured.");
  const result = await (client as unknown as { rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown[] | null; error: unknown }> }).rpc("workspace_payer_transition_command", { p_command: command, p_actor_id: actor.userId, p_verified_email: actor.verifiedEmail });
  if (result.error) databaseError(result.error);
  const row = (result.data as Record<string, unknown>[] | null)?.[0];
  if (!row) throw new PayerTransitionPersistenceError("The payer change returned no durable record.");
  // This RPC has committed. Return its durable receipt without a second read:
  // an unavailable refresh must not turn a saved change into a retryable failure.
  const receipt = verifiedPayerReceipt({ kind: "payer_transition", action: command.action, id: row.id,
    workspaceId: row.workspace_id, status: row.status, successorKind: row.successor_kind });
  if (!receipt || ("transitionId" in command && receipt.id !== command.transitionId)
    || ("workspaceId" in command && receipt.workspaceId !== command.workspaceId)) {
    throw new PayerTransitionPersistenceError("The saved payer result could not be verified.");
  }
  return { receipt };
}

export async function acceptPayerJob(actor: Actor, input: unknown): Promise<PayerCommandResult> {
  const parsed = z.object({ action: z.literal("accept_job"), jobId: z.string().uuid() }).strict().safeParse(input);
  if (!parsed.success) throw new PayerTransitionValidationError("Choose a valid job limit.");
  const client = getSupabase();
  if (!client) throw new PayerTransitionPersistenceError("Payer transition storage is not configured.");
  const result = await (client as unknown as { rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown[] | null; error: unknown }> }).rpc("job_economics_command_with_payer_authority", {
    p_command: { action: "accept", jobId: parsed.data.jobId }, p_actor_id: actor.userId, p_verified_email: actor.verifiedEmail,
  });
  if (result.error) databaseError(result.error);
  if (!result.data?.[0]) throw new PayerTransitionPersistenceError("The job limit returned no durable record.");
  const row = result.data[0] as Record<string, unknown>;
  const receipt = verifiedPayerReceipt({ kind: "payer_job", action: "accept_job", id: row.id, workspaceId: row.workspace_id, status: row.status });
  if (!receipt || receipt.id !== parsed.data.jobId) throw new PayerTransitionPersistenceError("The saved job result could not be verified.");
  return { receipt };
}
