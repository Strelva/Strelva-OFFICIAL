import { z } from "zod";
import { operatorQueueReleaseEnabled } from "./release";
import { getSupabase } from "@/platform/infra/db/client";
import {
  OperatorQueueAccessError, OperatorQueueConflictError, OperatorQueueUnavailableError, OperatorQueueValidationError,
  outsideWriteReceiptSchema, queueContextSchema, queueMarkSchema,
  type MarkAction, type OutsideWriteReceipt, type QueueActor, type QueueContext, type QueueMark, type QueuePriority,
} from "./contracts";

type Failure = { code?: string; message?: string } | null;
type RpcClient = { rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: Failure }> };

let override: RpcClient | null = null;
/** Tests only. */
export function setOperatorQueueDb(client: RpcClient | null): void { override = client; }

function client(): RpcClient {
  if (override) return override;
  const value = getSupabase();
  if (!value) throw new OperatorQueueUnavailableError();
  return value as unknown as RpcClient;
}

function identity(actor: QueueActor) {
  return { p_user_id: actor.userId, p_verified_email: actor.verifiedEmail.trim().toLowerCase() };
}

/** Named SQL failures map to typed errors; anything else is unavailable storage, never empty data. */
export function operatorQueueFailure(error: Failure): void {
  if (!error) return;
  const detail = `${error.code ?? ""} ${error.message ?? ""}`;
  if (detail.includes("operator_queue_access_denied") || detail.includes("platform_operator_read_access_denied")) throw new OperatorQueueAccessError();
  if (detail.includes("operator_queue_snooze_refused")) throw new OperatorQueueValidationError("Harm-now items can't be snoozed.");
  if (detail.includes("operator_queue_assignee_invalid")) throw new OperatorQueueValidationError("Hand items only to an active Strelva operator.");
  if (detail.includes("operator_queue_receipt_not_found")) throw new OperatorQueueValidationError("That receipt was not found.");
  if (detail.includes("operator_queue_invalid") || detail.includes("outside_write_receipt_invalid")) throw new OperatorQueueValidationError();
  if (detail.includes("operator_queue_conflict") || detail.includes("outside_write_receipt_conflict")) throw new OperatorQueueConflictError();
  if (detail.includes("outside_write_receipt_immutable")) throw new OperatorQueueConflictError("That receipt's read-back is already recorded. It is never re-sent.");
  throw new OperatorQueueUnavailableError();
}

async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  let result: { data: unknown; error: Failure };
  try {
    result = await client().rpc(name, args);
  } catch (error) {
    if (error instanceof OperatorQueueUnavailableError) throw error;
    throw new OperatorQueueUnavailableError();
  }
  operatorQueueFailure(result.error);
  return result.data;
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new OperatorQueueUnavailableError("Queue records could not be read.");
  return parsed.data;
}

export async function readQueueContext(actor: QueueActor): Promise<QueueContext> {
  return parse(queueContextSchema, await rpc(operatorQueueReleaseEnabled() ? "read_audited_platform_operator_source" : "read_audited_platform_operator_detail", { ...identity(actor), p_reader_name: operatorQueueReleaseEnabled() ? "read_operator_queue_context_v2" : "read_operator_queue_context" }));
}

export interface MarkCommand {
  commandId: string;
  kind: string;
  sourceRef: string;
  action: MarkAction;
  payload?: Record<string, unknown>;
  /** The priority the server just computed for this item. P1 refuses snooze. */
  priority: QueuePriority;
}

export async function writeQueueMark(actor: QueueActor, command: MarkCommand): Promise<QueueMark> {
  return parse(queueMarkSchema, await rpc("write_operator_queue_mark", {
    ...identity(actor), p_command_id: command.commandId, p_source: command.kind, p_source_ref: command.sourceRef,
    p_action: command.action, p_payload: command.payload ?? {}, p_priority: command.priority,
  }));
}

export async function readReceipts(actor: QueueActor, filter: { tenantId?: string; workspaceId?: string; limit?: number }): Promise<OutsideWriteReceipt[]> {
  return parse(z.array(outsideWriteReceiptSchema), await rpc("read_audited_platform_operator_detail", {
    p_reader_name: "read_outside_write_receipts",
    ...identity(actor), p_tenant_id: filter.tenantId ?? null, p_workspace_id: filter.workspaceId ?? null, p_limit: filter.limit ?? 50,
  }));
}

/** Server-side: record an outside write once the provider has answered. */
export async function insertReceipt(receipt: Record<string, unknown>): Promise<OutsideWriteReceipt> {
  return parse(outsideWriteReceiptSchema, await rpc("record_outside_write_receipt", { p_receipt: receipt }));
}

const googleAttemptSchema = z.object({
  claimed: z.boolean(), attemptId: z.string().uuid(), acceptance: z.enum(["pending", "accepted", "rejected", "unknown"]),
  receipt: outsideWriteReceiptSchema.nullable(),
});

/** Reserve before provider dispatch. Uncertain or accepted attempts never dispatch again. */
export async function beginGoogleWrite(input: { commandKey: string; tenantId: string; writeKind: string; request: Record<string, unknown> }) {
  return parse(googleAttemptSchema, await rpc("begin_operator_google_write", { p_command: input }));
}

/** Receipt and attempt settlement share one transaction. */
export async function completeGoogleWrite(attemptId: string, receipt: Record<string, unknown>): Promise<OutsideWriteReceipt> {
  return parse(outsideWriteReceiptSchema, await rpc("complete_operator_google_write", { p_attempt_id: attemptId, p_receipt: receipt }));
}

export async function readGoogleWriteUncertainty(actor: QueueActor) {
  return parse(z.array(z.object({
    id: z.string().uuid(), tenantId: z.string(), writeKind: z.string(), acceptance: z.string(),
    startedAt: z.string(), receiptId: z.string().uuid().nullable(), readback: z.string().nullable(),
  })), await rpc("read_audited_platform_operator_source", { ...identity(actor), p_reader_name: "read_operator_google_uncertainty" }));
}

/** Server-side: the read-back, recorded once. Never re-sends the write. */
export async function insertReadback(receiptId: string, readback: "matched" | "differs" | "failed" | "not_possible", detail: string | null): Promise<OutsideWriteReceipt> {
  return parse(outsideWriteReceiptSchema, await rpc("record_outside_write_readback", {
    p_receipt_id: receiptId, p_readback: readback, p_detail: detail,
  }));
}

/** A Google listing write Google took but didn't show back (google_listing_receipts). */
export const listingReadbackFailureSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  workspaceName: z.string(),
  tenantId: z.string().nullable(),
  action: z.string(),
  targetRef: z.string().nullable(),
  status: z.literal("posted_unverified"),
  readback: z.enum(["failed", "differs"]),
  error: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
}).strict();
export type ListingReadbackFailure = z.infer<typeof listingReadbackFailureSchema>;

/** Operator only: listing writes Google accepted whose read-back failed. Read only. */
export async function readListingReadbackFailures(actor: QueueActor, limit = 200): Promise<ListingReadbackFailure[]> {
  return parse(z.array(listingReadbackFailureSchema), await rpc("read_audited_platform_operator_detail", {
    p_reader_name: operatorQueueReleaseEnabled() ? "read_google_listing_readback_failures_v2" : "read_google_listing_readback_failures", ...identity(actor), ...(operatorQueueReleaseEnabled() ? {} : { p_limit: limit }) }));
}
