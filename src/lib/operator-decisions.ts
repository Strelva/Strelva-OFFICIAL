/** Tenant decision authority. Owners and authorized agency staff decide content; platform support only triages requests or marks a quote as required. */
import { getTenantAgencySeat } from "@/platform/infra/db/repositories";
import { getEventRaw } from "./events";
import { resolveEventAction, type EventWorkflowAction } from "./event-actions";
import { logAuditEvent, type AuditLogEntry } from "./storage";
import type { UnifiedEvent } from "./types";
import { operatorStillActive, type VerifiedOperator, type AgencyStaff, type TenantDecider } from "@/platform/infra/tenant-decisions";
export { verifiedOperator, operatorStillActive, sessionTenantDecider, isDelegateDecider, type VerifiedOperator, type AgencyStaff, type TenantDecider } from "@/platform/infra/tenant-decisions";

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
 * Platform support only triages requests or marks a quote as required.
 * Content and acceptance decisions are refused before effects.
 */
export async function decideTenantEventAsOperator(operator: VerifiedOperator, input: DelegateDecisionInput): Promise<DecisionResult> {
  // Platform support may triage a request or mark it quote-required; it never
  // accepts client work, authors content or decides whether content goes live.
  if (input.action === "triaged" || input.action === "quoted") {
    return decideAsDelegate(operatorDelegate(operator), { ...input, accept: event => event.type === "change_request" && (!input.accept || input.accept(event)) });
  }
  if (!await operatorStillActive(operator)) return { changed: false, reason: "operator_access_changed" };
  const event = await getEventRaw(input.eventId);
  if (!event) return { changed: false, reason: "not_found" };
  if (event.tenantId !== input.tenantId) return { changed: false, reason: "wrong_tenant" };
  return { changed: false, reason: "platform_content_authority_retired" };
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
  if (reason === "platform_content_authority_retired") return { status: 403, error: "Platform support cannot decide client content or accept client work. Open the business workspace with ordinary agency or owner access." };
  if (reason === "owner_decides") return { status: 403, error: "The owner decides this one. Nothing changed." };
  if (reason === "not_operator_decidable") return { status: 403, error: "This item can't be decided here. Nothing changed." };
  if (reason === "operator_access_changed") return { status: 403, error: "Your operator access changed. Nothing changed." };
  if (reason === "agency_access_changed") return { status: 403, error: "Your agency's access to this business changed. Nothing changed." };
  if (reason === "audit_unavailable") return { status: 503, error: "The audit log is unavailable. Nothing changed." };
  return null;
}
