/**
 * Who decides a tenant event, and how an operator's decision is recorded.
 *
 * Every signed-in approval of a tenant event goes through here: the dashboard
 * queue, the event route, review replies, and the /admin queue and portfolio.
 * A Strelva operator (an active super admin who is not an owner member of the
 * tenant) runs the same governed spine as the owner (`resolveEventAction`), but
 * under `operator:<user id>`, so receipts name the operator, Google sees an
 * operator instruction, and the owner's auto-publish streak never moves.
 * An operator never decides an item routed to the owner.
 *
 * Each operator decision writes to `audit_logs`, the super-admin action trail:
 * one row before the effect and one with its result. No attempt row means no
 * effect.
 */
import { getAuthUserId, isSuperAdmin } from "@/platform/infra/auth";
import { getSessionUser } from "@/platform/infra/db/server-client";
import { getMembershipRole } from "@/platform/infra/db/repositories";
import { getEventRaw } from "./events";
import { operatorActorId, resolveEventAction, type EventWorkflowAction } from "./event-actions";
import { logAuditEvent } from "./storage";
import type { UnifiedEvent } from "./types";

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
  const user = await getSessionUser();
  if (!user?.email || !user.email_confirmed_at) return null;
  try {
    return { userId: user.id, verifiedEmail: user.email.trim().toLowerCase(), actorId: operatorActorId(user.id) };
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

/** The owner is this item's reviewer: an operator escalated it, or it was
 * drafted for the owner's decision. Only the owner decides it. */
export function isOwnerDecision(event: UnifiedEvent): boolean {
  return event.metadata?.reviewAudience === "owner";
}

export type TenantDecider =
  | { kind: "member"; actorId: string }
  | { kind: "operator"; operator: VerifiedOperator };

/**
 * Who the signed-in session decides as on this tenant. An active super admin
 * is an operator unless they are an owner member of the tenant; a failed
 * membership read counts as not an owner. Call after the route's tenant
 * permission check, which still decides whether they may act at all.
 */
export async function sessionTenantDecider(tenantId: string): Promise<TenantDecider | null> {
  const operator = await verifiedOperator();
  if (operator && (await getMembershipRole(operator.userId, tenantId).catch(() => null)) !== "owner") {
    return { kind: "operator", operator };
  }
  const userId = await getAuthUserId();
  return userId ? { kind: "member", actorId: userId } : null;
}

export type DecisionResult = { changed: boolean; reason?: string };

/**
 * An operator's decision on one tenant event. Refuses an owner-routed item
 * and anything `accept` rejects, writes the attempt row, runs the governed
 * spine as the operator, then writes the result row.
 */
export async function decideTenantEventAsOperator(
  operator: VerifiedOperator,
  input: {
    tenantId: string;
    eventId: string;
    action: EventWorkflowAction;
    /** The audit action, e.g. `dashboard.event.approved`. */
    auditAction: string;
    detail?: Record<string, unknown>;
    accept?: (event: UnifiedEvent) => boolean;
  },
): Promise<DecisionResult> {
  const { tenantId, eventId, action, auditAction } = input;
  if (!(await operatorStillActive(operator))) return { changed: false, reason: "operator_access_changed" };
  const event = await getEventRaw(eventId);
  if (!event) return { changed: false, reason: "not_found" };
  if (event.tenantId !== tenantId) return { changed: false, reason: "wrong_tenant" };
  if (isOwnerDecision(event)) return { changed: false, reason: "owner_decides" };
  if (input.accept && !input.accept(event)) return { changed: false, reason: "not_operator_decidable" };
  const detail = {
    ...input.detail,
    decision: action,
    eventType: event.type,
    eventKind: typeof event.metadata?.kind === "string" ? event.metadata.kind : null,
  };
  const audit = { operator, tenantId, eventId, action: auditAction };
  try {
    await auditOperatorDecision({ ...audit, phase: "attempt", detail });
  } catch {
    return { changed: false, reason: "audit_unavailable" };
  }
  let result: DecisionResult;
  try {
    result = await resolveEventAction(tenantId, eventId, action, operator.actorId);
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 200) : "error";
    await auditOperatorDecision({ ...audit, phase: "result", detail: { ...detail, changed: false, reason } })
      .catch(() => console.error(`[operator-decisions] audit result row failed for ${eventId}; its attempt row stands.`));
    throw error;
  }
  await auditOperatorDecision({ ...audit, phase: "result", detail: { ...detail, changed: result.changed, reason: result.reason ?? null } })
    .catch(() => console.error(`[operator-decisions] audit result row failed for ${eventId}; its attempt row stands.`));
  return result;
}

/** A signed-in decision on one tenant event, as whoever the session is. */
export async function decideTenantEvent(
  decider: TenantDecider,
  input: { tenantId: string; eventId: string; action: EventWorkflowAction; auditAction: string },
): Promise<DecisionResult> {
  if (decider.kind === "operator") return decideTenantEventAsOperator(decider.operator, input);
  return resolveEventAction(input.tenantId, input.eventId, input.action, decider.actorId);
}

/** HTTP status and message for a refused operator decision, or null. */
export function operatorRefusal(reason: string | undefined): { status: number; error: string } | null {
  if (reason === "owner_decides") return { status: 403, error: "The owner decides this one. Nothing changed." };
  if (reason === "not_operator_decidable") return { status: 403, error: "This item can't be decided here. Nothing changed." };
  if (reason === "operator_access_changed") return { status: 403, error: "Your operator access changed. Nothing changed." };
  if (reason === "audit_unavailable") return { status: 503, error: "The audit log is unavailable. Nothing changed." };
  return null;
}
