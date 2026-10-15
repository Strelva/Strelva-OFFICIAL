/**
 * The operator's read of which businesses have no real owner email, and why.
 * Read only: it changes nothing and sends nothing. Super admin is checked in
 * SQL (`operator_owner_reach_report`); callers add their own admission.
 */
import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { emailSendingEnabled } from "@/platform/infra/email/enabled";
import { WorkspaceAccessError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { operatorOwnerReachRowSchema, type OperatorOwnerReachRow } from "./contracts";

type ReportDb = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }> };

export async function readOperatorOwnerReachReport(actor: WorkspaceActor, db: ReportDb | null = getSupabase() as unknown as ReportDb | null): Promise<OperatorOwnerReachRow[]> {
  if (!db) throw new WorkspaceStoreError("The owner reach list could not be read. Storage is not configured.");
  const { data, error } = await db.rpc("operator_owner_reach_report", {
    p_operator_user_id: actor.userId,
    p_verified_email: actor.verifiedEmail.trim().toLowerCase(),
  });
  if (error) {
    if (error.message?.includes("workspace_release_operator_required")) throw new WorkspaceAccessError();
    throw new WorkspaceStoreError("The owner reach list could not be read.");
  }
  const parsed = z.array(operatorOwnerReachRowSchema).safeParse(data);
  if (!parsed.success) throw new WorkspaceStoreError("The owner reach list could not be read. The response was malformed.");
  return parsed.data;
}

export type OperatorOwnerProblem = "owner_in" | "invite_pending" | "staff_address" | "missing" | "proposed_waiting" | "trusted_real";

/** Why a business's owner can or cannot be told. `unreachable` is about today's reality, so a good address
 * counts as unreachable while client email is off. */
export function classifyOperatorRow(row: OperatorOwnerReachRow, emailOn: boolean = emailSendingEnabled()): { problem: OperatorOwnerProblem; unreachable: boolean } {
  if (row.ownerMember) return { problem: "owner_in", unreachable: false };
  // An invitation is never emailed, so the owner still has to be handed the link.
  if (row.invite && !row.invite.recipientStaffReason) return { problem: "invite_pending", unreachable: true };
  if (row.trusted?.staffReason) return { problem: "staff_address", unreachable: true };
  if (!row.trusted) {
    const real = row.tenantOwnerEmails.some(entry => entry.email && !entry.staffReason);
    if (!real && row.tenantOwnerEmails.length > 0) return { problem: "staff_address", unreachable: true };
    return row.proposed ? { problem: "proposed_waiting", unreachable: true } : { problem: "missing", unreachable: true };
  }
  return { problem: "trusted_real", unreachable: !emailOn };
}
