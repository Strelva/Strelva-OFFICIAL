/**
 * Who decides a tenant event, and how a delegate's decision is recorded.
 *
 * Every signed-in approval of a tenant event goes through here: the dashboard
 * queue, the event route, review replies, and the /admin queue and portfolio.
 * Two kinds of people decide for a business without being its owner:
 *
 * - A Strelva operator: an active super admin who is not an owner member of
 *   the tenant. Decides as `operator:<user id>`.
 * - Agency staff: a member of an agency holding an active provider seat on the
 *   business the tenant is linked to (ADR 0012), who is not its owner member.
 *   Decides as `agency-staff:<agency id>:<user id>`.
 *
 * A delegate runs the same governed spine as the owner (`resolveEventAction`)
 * under that actor, so receipts name them, Google sees an operator
 * instruction, and the owner's auto-publish streak never moves. A delegate
 * never decides an item routed to the owner, and their access is re-read
 * before each effect.
 *
 * Each delegate decision writes to `audit_logs`: one row before the effect
 * and one with its result. No attempt row means no effect.
 */
import { getAuthUserId, isSuperAdmin } from "@/platform/infra/auth";
import { getSessionUser } from "@/platform/infra/db/server-client";
import { getMembershipRole, getTenantAgencySeat } from "@/platform/infra/db/repositories";
import { getEventRaw } from "./events";
import { agencyStaffActorId, operatorActorId, resolveEventAction, type EventWorkflowAction } from "./event-actions";
import { logAuditEvent, type AuditLogEntry } from "./storage";
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

export interface AgencyStaff {
  userId: string;
  /** The session's email, for the audit row. */
  email: string | null;
  agencyWorkspaceId: string;
  /** `agency-staff:<agency id>:<user id>`, the actor the approve path records. */
  actorId: string;
}

/** The agency staff member deciding on this tenant, read now, or null. */
async function agencyStaffOn(tenantId: string, userId: string, email: string | null): Promise<AgencyStaff | null> {
  const agencyWorkspaceId = await getTenantAgencySeat(userId, tenantId);
  if (!agencyWorkspaceId) return null;
  return { userId, email, agencyWorkspaceId, actorId: agencyStaffActorId(agencyWorkspaceId, userId) };
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
  | { kind: "operator"; operator: VerifiedOperator }
  | { kind: "agency_staff"; staff: AgencyStaff };

/** Someone deciding for the business who is not its owner. */
export function isDelegateDecider(decider: TenantDecider): boolean {
  return decider.kind !== "member";
}

/**
 * Who the signed-in session decides as on this tenant. An active super admin
 * is an operator unless they are an owner member of the tenant; a failed
 * membership read counts as not an owner. Anyone else who isn't an owner
 * member is agency staff when an agency they belong to holds the business's
 * provider seat; if that can't be read this throws, so nothing is decided as
 * the owner. Call after the route's tenant permission check, which still
 * decides whether they may act at all.
 */
export async function sessionTenantDecider(tenantId: string): Promise<TenantDecider | null> {
  const operator = await verifiedOperator();
  if (operator && (await getMembershipRole(operator.userId, tenantId).catch(() => null)) !== "owner") {
    return { kind: "operator", operator };
  }
  const userId = await getAuthUserId();
  if (!userId) return null;
  if ((await getMembershipRole(userId, tenantId)) !== "owner") {
    const user = await getSessionUser();
    const staff = await agencyStaffOn(tenantId, userId, user?.id === userId ? user.email ?? null : null);
    if (staff) return { kind: "agency_staff", staff };
  }
  return { kind: "member", actorId: userId };
}

export type DecisionResult = { changed: boolean; reason?: string };

type DelegateDecisionInput = {
  tenantId: string;
  eventId: string;
  action: EventWorkflowAction;
  /** The audit action, e.g. `dashboard.event.approved`. */
  auditAction: string;
  detail?: Record<string, unknown>;
  accept?: (event: UnifiedEvent) => boolean;
};

/** What differs between an operator and agency staff deciding. */
interface Delegate {
  actorId: string;
  /** Re-read before the effect: null when still active, else the refusal. */
  revoked(tenantId: string): Promise<string | null>;
  audit(input: { tenantId: string; eventId: string; action: string; phase: "attempt" | "result"; detail: Record<string, unknown> }): Promise<void>;
}

function operatorDelegate(operator: VerifiedOperator): Delegate {
  return {
    actorId: operator.actorId,
    revoked: async () => ((await operatorStillActive(operator)) ? null : "operator_access_changed"),
    audit: (input) => auditOperatorDecision({ operator, ...input }),
  };
}

function agencyStaffDelegate(staff: AgencyStaff): Delegate {
  const actor: AuditLogEntry["actor"] = { userId: staff.userId, email: staff.email, type: "user", isSuperAdmin: false };
  return {
    actorId: staff.actorId,
    // Still a member of the same agency, still holding the business's seat.
    revoked: async (tenantId) => ((await getTenantAgencySeat(staff.userId, tenantId)) === staff.agencyWorkspaceId ? null : "agency_access_changed"),
    audit: async ({ tenantId, eventId, action, phase, detail }) => {
      await logAuditEvent({
        tenant: tenantId,
        actor,
        action,
        targetType: "event",
        targetId: eventId,
        metadata: { phase, actor: staff.actorId, agencyWorkspaceId: staff.agencyWorkspaceId, ...detail },
      });
    },
  };
}

/**
 * An operator's decision on one tenant event. Refuses an owner-routed item
 * and anything `accept` rejects, writes the attempt row, runs the governed
 * spine as the operator, then writes the result row.
 */
export async function decideTenantEventAsOperator(operator: VerifiedOperator, input: DelegateDecisionInput): Promise<DecisionResult> {
  return decideAsDelegate(operatorDelegate(operator), input);
}

/** Agency staff's decision on one tenant event, the same way as an operator's. */
export async function decideTenantEventAsAgencyStaff(staff: AgencyStaff, input: DelegateDecisionInput): Promise<DecisionResult> {
  return decideAsDelegate(agencyStaffDelegate(staff), input);
}

async function decideAsDelegate(delegate: Delegate, input: DelegateDecisionInput): Promise<DecisionResult> {
  const { tenantId, eventId, action, auditAction } = input;
  const revoked = await delegate.revoked(tenantId);
  if (revoked) return { changed: false, reason: revoked };
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
  const audit = { tenantId, eventId, action: auditAction };
  try {
    await delegate.audit({ ...audit, phase: "attempt", detail });
  } catch {
    return { changed: false, reason: "audit_unavailable" };
  }
  let result: DecisionResult;
  try {
    result = await resolveEventAction(tenantId, eventId, action, delegate.actorId);
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 200) : "error";
    await delegate.audit({ ...audit, phase: "result", detail: { ...detail, changed: false, reason } })
      .catch(() => console.error(`[operator-decisions] audit result row failed for ${eventId}; its attempt row stands.`));
    throw error;
  }
  await delegate.audit({ ...audit, phase: "result", detail: { ...detail, changed: result.changed, reason: result.reason ?? null } })
    .catch(() => console.error(`[operator-decisions] audit result row failed for ${eventId}; its attempt row stands.`));
  return result;
}

/** A signed-in decision on one tenant event, as whoever the session is. */
export async function decideTenantEvent(
  decider: TenantDecider,
  input: { tenantId: string; eventId: string; action: EventWorkflowAction; auditAction: string },
): Promise<DecisionResult> {
  if (decider.kind === "operator") return decideTenantEventAsOperator(decider.operator, input);
  if (decider.kind === "agency_staff") return decideTenantEventAsAgencyStaff(decider.staff, input);
  return resolveEventAction(input.tenantId, input.eventId, input.action, decider.actorId);
}

/** HTTP status and message for a refused delegate decision, or null. */
export function operatorRefusal(reason: string | undefined): { status: number; error: string } | null {
  if (reason === "owner_decides") return { status: 403, error: "The owner decides this one. Nothing changed." };
  if (reason === "not_operator_decidable") return { status: 403, error: "This item can't be decided here. Nothing changed." };
  if (reason === "operator_access_changed") return { status: 403, error: "Your operator access changed. Nothing changed." };
  if (reason === "agency_access_changed") return { status: 403, error: "Your agency's access to this business changed. Nothing changed." };
  if (reason === "audit_unavailable") return { status: 503, error: "The audit log is unavailable. Nothing changed." };
  return null;
}
