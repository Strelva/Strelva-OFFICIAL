/** Resolve current ordinary tenant authority separately from platform support. */
import { getAuthUserId, isSuperAdmin } from "./auth";
import { getSessionUser } from "./db/server-client";
import { getMembershipRole, getTenantAgencySeat } from "./db/repositories";
import { operatorActorId, agencyStaffActorId } from "./tenant-actor";

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

export type TenantDecider =
  | { kind: "member"; actorId: string }
  | { kind: "operator"; operator: VerifiedOperator }
  | { kind: "agency_staff"; staff: AgencyStaff };

/** Someone deciding for the business who is not its owner. */
export function isDelegateDecider(decider: TenantDecider): boolean {
  return decider.kind !== "member";
}

/** Resolve ordinary owner/agency authority first. A platform role only grants support inspection when neither exists; failed permission reads never grant ownership. */
export async function sessionTenantDecider(tenantId: string): Promise<TenantDecider | null> {
  const operator = await verifiedOperator();
  const userId = operator?.userId ?? await getAuthUserId();
  if (!userId) return null;
  const role = await getMembershipRole(userId, tenantId);
  if (role === "owner") return { kind: "member", actorId: userId };
  // A platform role grants no agency seat. Re-read an actual seat before an
  // operator can act through the same ordinary agency permissions as anyone else.
  const user = await getSessionUser();
  const staff = await agencyStaffOn(tenantId, userId, user?.id === userId ? user.email ?? null : null);
  if (staff) return { kind: "agency_staff", staff };
  if (operator) return { kind: "operator", operator };
  return { kind: "member", actorId: userId };
}

