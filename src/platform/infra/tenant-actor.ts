/** Stable legacy actor IDs; request authority is checked by tenant-decisions. */
const OPERATOR_ACTOR = /^operator:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The actor a Strelva operator approves with: their verified user id, marked
 * so no receipt, version or trust streak can read it as the owner's approval.
 * Built only by /admin server actions after the operator check. */
export function operatorActorId(userId: string): string {
  const actorId = `operator:${userId}`;
  if (!OPERATOR_ACTOR.test(actorId)) throw new Error("operator_actor_invalid");
  return actorId;
}

export function isOperatorActor(actorId: string): boolean {
  return OPERATOR_ACTOR.test(actorId);
}

const AGENCY_STAFF_ACTOR = /^agency-staff:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The actor agency staff approve with on a client's site: the agency whose
 * provider seat they work through and their own user id. Like an operator,
 * never the owner's approval. Built only after the staffing check in
 * src/platform/infra/tenant-decisions.ts. */
export function agencyStaffActorId(agencyWorkspaceId: string, userId: string): string {
  const actorId = `agency-staff:${agencyWorkspaceId}:${userId}`;
  if (!AGENCY_STAFF_ACTOR.test(actorId)) throw new Error("agency_staff_actor_invalid");
  return actorId;
}

/** Someone deciding for the business who is not its owner: a Strelva
 * operator or agency staff. Their approval is an instruction, never the
 * owner's approval, and never counts toward the owner's trust streak. */
export function isDelegateActor(actorId: string): boolean {
  return OPERATOR_ACTOR.test(actorId) || AGENCY_STAFF_ACTOR.test(actorId);
}

