import { createHash } from "node:crypto";
import { getSupabase } from "@/lib/db/client";
import { businessEntryInputSchema, businessEntryResultSchema } from "./business-entry-contract";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "./types";

/** One transaction creates ownership and, when requested, saves the service brief. */
export async function enterCustomerBusiness(actor: WorkspaceActor, raw: unknown) {
  const input = businessEntryInputSchema.parse(raw);
  const db = getSupabase();
  if (!db) throw new WorkspaceStoreError("Business storage is unavailable.");
  const name = input.destination.kind === "new" ? input.destination.name : null;
  const workspaceId = input.destination.kind === "existing" ? input.destination.workspaceId : null;
  const digest = createHash("sha256").update(JSON.stringify([actor.userId, name, workspaceId, input.initialRequest])).digest("hex");
  const client = db as unknown as { rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message?: string } | null }> };
  const result = await client.rpc("enter_customer_business", {
    p_user_id: actor.userId, p_verified_email: actor.verifiedEmail.trim().toLowerCase(),
    p_name: name, p_business_id: workspaceId, p_request_text: input.initialRequest,
    p_command_id: input.idempotencyKey, p_command_digest: digest,
  });
  if (result.error) {
    const message = result.error.message || "";
    if (/verified_identity_required|access_denied/.test(message)) throw new WorkspaceAccessError();
    if (/workspace_limit_reached/.test(message)) throw new WorkspaceConflictError("The workspace limit was reached. Choose an existing business.");
    if (/idempotency_conflict|workspace_exit_future_work_blocked/.test(message)) throw new WorkspaceConflictError("This request conflicts with its saved state. Retry the original request or select an active business.");
    throw new WorkspaceStoreError("Business setup could not be confirmed. Retry the same request before starting another.");
  }
  const parsed = businessEntryResultSchema.safeParse(result.data);
  if (!parsed.success) throw new WorkspaceStoreError("Business setup returned an unconfirmed result. Retry the same request.");
  return parsed.data;
}
