import { z } from "zod";
import { getSupabase } from "@/lib/db/client";
import {
  WorkspaceAccessError,
  WorkspaceConflictError,
  WorkspaceStoreError,
  type WorkspaceActor,
} from "@/platform/workspaces/types";

/** Thin RPC layer. Every call goes through a service-role security-definer
 * function that rechecks the actor; this file only shapes arguments and maps
 * database errors onto the shared workspace error classes. */

export type DbError = { message?: string; code?: string } | null;
export type BusinessRecordDb = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: DbError }>;
};

let override: BusinessRecordDb | null = null;

/** Tests and the conversion script may supply their own client. */
export function setBusinessRecordDb(client: BusinessRecordDb | null): void {
  override = client;
}

export function businessRecordDb(): BusinessRecordDb {
  if (override) return override;
  const client = getSupabase();
  if (!client) throw new WorkspaceStoreError("Business record storage is unavailable.");
  return client as unknown as BusinessRecordDb;
}

/** A conflict the caller can act on: reread and retry, or stop. */
export class BusinessRecordConflictError extends WorkspaceConflictError {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "BusinessRecordConflictError";
  }
}

export class BusinessRecordValidationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "BusinessRecordValidationError";
  }
}

const CONFLICTS: Record<string, string> = {
  business_record_revision_conflict: "The business record changed since it was read. Reload and try again.",
  business_record_idempotency_conflict: "This command id was already used for a different change.",
  business_record_undo_conflict: "Something changed after that revision, so it can't be undone cleanly.",
  business_record_undo_already_applied: "That revision has already been undone.",
  business_record_conflict: "Another record already holds that value.",
  business_record_entity_not_found: "That item is no longer in the business record.",
  business_record_revision_not_found: "That revision does not exist.",
  business_record_limit_reached: "The business record is at its size limit.",
  workspace_exit_future_work_blocked: "New work is stopped for this workspace.",
  tenant_conversion_idempotency_conflict: "This conversion command was already used with a different plan.",
  tenant_conversion_identity_mismatch: "The tenant changed identity since the plan was made. Plan again.",
  tenant_conversion_target_invalid: "The target business is not a converted business this operator runs.",
  tenant_unlink_idempotency_conflict: "This unlink command was already used for a different unlink.",
  tenant_unlink_workspace_mismatch: "The site is linked to a different business than the one previewed. Preview again.",
  tenant_unlink_not_linked: "That site is not linked to a business.",
  tenant_unlink_conflict: "The business record changed during the unlink. Preview again.",
};

const VALIDATION: Record<string, string> = {
  business_record_patch_invalid: "The change is not a valid business record change.",
  business_record_source_invalid: "That source cannot make this change.",
  business_record_command_invalid: "The command id or digest is missing.",
  tenant_conversion_invalid: "The conversion plan is malformed.",
  tenant_unlink_invalid: "The unlink command is malformed.",
};

const ACCESS = [
  "business_record_access_denied",
  "tenant_conversion_operator_required",
  "tenant_conversion_tenant_not_found",
  "tenant_unlink_access_denied",
];

export function mapBusinessRecordError(error: DbError, fallback: string): never {
  const detail = `${error?.code ?? ""} ${error?.message ?? ""}`;
  if (ACCESS.some((code) => detail.includes(code))) throw new WorkspaceAccessError();
  for (const [code, message] of Object.entries(CONFLICTS)) {
    if (detail.includes(code)) throw new BusinessRecordConflictError(code, message);
  }
  for (const [code, message] of Object.entries(VALIDATION)) {
    if (detail.includes(code)) throw new BusinessRecordValidationError(code, message);
  }
  throw new WorkspaceStoreError(fallback);
}

export function actorArgs(actor: WorkspaceActor) {
  return {
    p_user_id: z.string().uuid().parse(actor.userId),
    p_verified_email: z.string().email().parse(actor.verifiedEmail.trim().toLowerCase()),
  };
}

export async function callBusinessRecord<T>(
  name: string,
  args: Record<string, unknown>,
  schema: z.ZodType<T>,
  fallback: string,
): Promise<T> {
  const { data, error } = await businessRecordDb().rpc(name, args);
  if (error) mapBusinessRecordError(error, fallback);
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new WorkspaceStoreError(`${fallback} The response was malformed.`);
  return parsed.data;
}
