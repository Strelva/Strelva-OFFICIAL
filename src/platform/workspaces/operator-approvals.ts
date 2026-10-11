import { z } from "zod";
import { RELEASE_FLAGS, type ReleaseFlag } from "@/platform/release-flags/resolve";
import { getSupabase } from "@/platform/infra/db/client";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "./types";

type DbError = { message?: string; code?: string } | null;
type ApprovalDb = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: DbError }> };
let override: ApprovalDb | null = null;

/** Test seam for the service-role RPC that records an operator approval. */
export function setOperatorApprovalsDb(db: ApprovalDb | null): void {
  override = db;
}

function db(): ApprovalDb {
  if (override) return override;
  const client = getSupabase();
  if (!client) throw new WorkspaceStoreError("Operator approval storage is unavailable.");
  return client as unknown as ApprovalDb;
}

const uuid = z.string().uuid();
const ownerTarget = z.object({
  kind: z.literal("owner_invitation.issue"),
  recipientEmail: z.string().trim().toLowerCase().email().max(254),
  sendEmail: z.literal(false),
});
const releaseFlagTarget = z.object({
  kind: z.literal("workspace_release_flag.on"),
  flag: z.enum(RELEASE_FLAGS),
  state: z.literal("on"),
  reason: z.string().trim().min(3).max(500),
});
export const operatorApprovalRequestSchema = z.discriminatedUnion("kind", [ownerTarget, releaseFlagTarget]);
export type OperatorApprovalRequest = z.infer<typeof operatorApprovalRequestSchema>;

const approvalSchema = z.object({
  approvalId: uuid,
  workspaceId: uuid,
  actionKind: z.enum(["owner_invitation.issue", "workspace_release_flag.on"]),
  target: z.record(z.string(), z.unknown()),
  approvedBy: uuid,
  approvedEmail: z.string().email(),
  approvedAt: z.string(),
  expiresAt: z.string(),
});
export type OperatorActionApproval = z.infer<typeof approvalSchema>;

export const operatorAuditContextSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("web") }).strict(),
  z.object({ source: z.literal("cli"), osUser: z.string().trim().min(1).max(120), machine: z.string().trim().min(1).max(200) }).strict(),
]);
export type OperatorAuditContext = z.infer<typeof operatorAuditContextSchema>;

/** Records the authenticated operator and exact action in the database. */
export async function recordOperatorActionApproval(
  actor: WorkspaceActor,
  workspaceId: string,
  input: OperatorApprovalRequest,
  auditContext: OperatorAuditContext = { source: "web" },
): Promise<OperatorActionApproval> {
  const request = operatorApprovalRequestSchema.parse(input);
  const context = operatorAuditContextSchema.parse(auditContext);
  const target = request.kind === "owner_invitation.issue"
    ? { recipientEmail: request.recipientEmail, sendEmail: request.sendEmail }
    : { flag: request.flag as ReleaseFlag, state: request.state, reason: request.reason.trim() };
  const { data, error } = await db().rpc("create_operator_action_approval", {
    p_approver_user_id: z.string().uuid().parse(actor.userId),
    p_workspace_id: uuid.parse(workspaceId),
    p_action_kind: request.kind,
    p_target: target,
    p_audit_context: context,
  });
  if (error) {
    const detail = `${error.code ?? ""} ${error.message ?? ""}`;
    if (detail.includes("workspace_release_operator_required") || detail.includes("operator_owner_invitation_operator_required")) {
      throw new WorkspaceAccessError();
    }
    if (detail.includes("operator_action_approval_invalid") || detail.includes("workspace_release_workspace_invalid")) {
      throw new WorkspaceConflictError("The approval details do not match an available action.");
    }
    throw new WorkspaceStoreError("The operator approval could not be recorded.");
  }
  const parsed = approvalSchema.safeParse(data);
  if (!parsed.success) throw new WorkspaceStoreError("The operator approval response was malformed.");
  return parsed.data;
}
