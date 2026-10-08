/**
 * Who an operator decision is recorded as, and its audit row.
 *
 * An operator approval runs the same governed spine as an owner approval
 * (`resolveEventAction`), but under the operator's own actor id, so receipts
 * name the operator and never claim the owner approved. Each decision writes
 * to `audit_logs`, the super-admin action trail: one row before the effect
 * and one with its result. No attempt row means no effect.
 */
import { isSuperAdmin } from "@/platform/infra/auth";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import { logAuditEvent } from "@/lib/storage";
import { operatorActorId } from "@/lib/event-actions";

export interface VerifiedOperator {
  userId: string;
  verifiedEmail: string;
  /** `operator:<userId>`, the actor the approve path records. */
  actorId: string;
}

/**
 * The signed-in operator, read now: a verified session and an unrevoked
 * super_admins row. Call it again before each effect in a batch so a
 * revocation stops the rest.
 */
export async function verifiedOperator(): Promise<VerifiedOperator | null> {
  if (!(await isSuperAdmin())) return null;
  const actor = await workspaceHttpActor();
  if (!actor) return null;
  try {
    return { ...actor, actorId: operatorActorId(actor.userId) };
  } catch {
    return null;
  }
}

/** Still the same unrevoked operator as at the start of the batch. */
export async function operatorStillActive(operator: VerifiedOperator): Promise<boolean> {
  const current = await verifiedOperator();
  return current?.userId === operator.userId;
}

export async function auditOperatorDecision(input: {
  operator: VerifiedOperator;
  tenantId: string;
  eventId: string;
  /** e.g. `queue.draft.approve`, `portfolio.draft.approve`. */
  action: string;
  phase: "attempt" | "result";
  detail?: Record<string, unknown>;
}): Promise<void> {
  await logAuditEvent({
    tenant: input.tenantId,
    actor: { userId: input.operator.userId, email: input.operator.verifiedEmail, type: "super_admin", isSuperAdmin: true },
    action: input.action,
    targetType: "event",
    targetId: input.eventId,
    metadata: { phase: input.phase, actor: input.operator.actorId, ...input.detail },
  });
}
