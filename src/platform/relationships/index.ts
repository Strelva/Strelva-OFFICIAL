/**
 * The platform relationship model.
 *
 * A person's display status is a projection of independent facts.  It is not
 * an authorization check, a tenant lifecycle state, or a billing gate.  Keep
 * this module browser-safe: callers provide facts, and this module only
 * resolves the result. Tenant membership and product permissions remain in
 * the existing auth/access boundary; they are deliberately not duplicated in
 * this status API.
 */

export type RelationshipStatus = "user" | "paid_user" | "client" | "enterprise";

/** A service commitment, independent of who can access its workspace. */
export type ServiceRelationship = "none" | "managed_client" | "enterprise";

/** Billing standing, independent of whether the person is receiving service. */
export type PaidStanding =
  | "none"
  | "active"
  | "trialing"
  | "past_due"
  | "cancelled"
  | "comped";

export type RelationshipContext =
  | { kind: "personal" }
  | { kind: "tenant"; tenantId: string }
  | { kind: "account"; accountId: string };

export interface RelationshipFacts {
  context?: RelationshipContext;
  serviceRelationship?: ServiceRelationship;
  paidStanding?: PaidStanding;
}

export type RelationshipSource =
  | "default_user"
  | "paid_standing"
  | "managed_client"
  | "enterprise_service";

export interface RelationshipSnapshot {
  status: RelationshipStatus;
  context: RelationshipContext;
  serviceRelationship: ServiceRelationship;
  paidStanding: PaidStanding;
  source: RelationshipSource;
}

export const RELATIONSHIP_STATUS_LABELS: Record<RelationshipStatus, string> = {
  user: "User",
  paid_user: "Paid User",
  client: "Client",
  enterprise: "Enterprise",
};

/**
 * The default policy only treats active standing as paid. A trial is an
 * explicit standing but not a purchased relationship yet. `past_due`,
 * `cancelled`, and `comped` remain explicit facts so a future grace-period or
 * contract policy can change the projection without changing identity or
 * permissions.
 */
export function countsAsPaid(standing: PaidStanding): boolean {
  return standing === "active";
}

/** Resolve the display status without granting or revoking any access. */
export function resolveRelationship(facts: RelationshipFacts = {}): RelationshipSnapshot {
  const serviceRelationship = facts.serviceRelationship ?? "none";
  const paidStanding = facts.paidStanding ?? "none";
  const status: RelationshipStatus =
    serviceRelationship === "enterprise"
      ? "enterprise"
      : serviceRelationship === "managed_client"
        ? "client"
        : countsAsPaid(paidStanding)
          ? "paid_user"
          : "user";

  const source: RelationshipSource =
    serviceRelationship === "enterprise"
      ? "enterprise_service"
      : serviceRelationship === "managed_client"
        ? "managed_client"
        : countsAsPaid(paidStanding)
          ? "paid_standing"
          : "default_user";

  return {
    status,
    context: facts.context ?? { kind: "personal" },
    serviceRelationship,
    paidStanding,
    source,
  };
}

/** Convenience for callers that only need the display status. */
export function resolveRelationshipStatus(facts: RelationshipFacts = {}): RelationshipStatus {
  return resolveRelationship(facts).status;
}
