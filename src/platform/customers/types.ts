/**
 * IMP-05 / AUTH-03 / MOD-07
 *
 * The Customers module is an explicit relationship projection.  These types
 * intentionally do not model payer, service, buyer, or provider payloads.
 * Those facts stay with their owning product and are not inferred from a
 * customer mapping.
 */

export const CUSTOMER_RESOURCE_KINDS = [
  "website",
  "assessment",
  "home_finder_installation",
] as const;

export type CustomerResourceKind = (typeof CUSTOMER_RESOURCE_KINDS)[number];

export const CUSTOMER_READ_OPERATIONS = [
  "customer:read",
  "resource:read",
  "installation:read",
] as const;

export type CustomerReadOperation = (typeof CUSTOMER_READ_OPERATIONS)[number];

export const CUSTOMER_RELATIONSHIP_KINDS = ["person", "organization"] as const;
export type CustomerRelationshipKind = (typeof CUSTOMER_RELATIONSHIP_KINDS)[number];

export const CUSTOMER_MAPPING_PROVENANCE = [
  "operator_reviewed",
  "reconciled",
  "direct_mapping",
] as const;

export type CustomerMappingProvenance = (typeof CUSTOMER_MAPPING_PROVENANCE)[number];

export type CustomerMappingStatus = "active" | "revoked";

/** Browser-safe source state.  It is not a provider or delivery state. */
export type CustomerResourceAvailability =
  | "available"
  | "unavailable"
  | "not_configured"
  | "revoked";

export interface CustomerActor {
  userId: string;
  verifiedEmail: string;
}

export interface CustomerRelationshipRecord {
  id: string;
  organizationId: string;
  customerWorkspaceId?: string;
  displayName: string;
  kind: CustomerRelationshipKind;
  domain?: string;
  status: CustomerMappingStatus;
  provenance: CustomerMappingProvenance;
  evidenceReference?: string;
  recordedBy: string;
  updatedBy: string;
  revokedBy?: string;
  revokedAt?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CustomerResourceRecord {
  id: string;
  relationshipId: string;
  kind: CustomerResourceKind;
  /** Exact provider/tenant identity.  Server-only; never returned by the API. */
  resourceReference: string;
  label?: string;
  status: CustomerMappingStatus;
  provenance: CustomerMappingProvenance;
  evidenceReference?: string;
  recordedBy: string;
  updatedBy: string;
  revokedBy?: string;
  revokedAt?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CustomerAssignmentRecord {
  id: string;
  organizationId: string;
  userId: string;
  relationshipId: string;
  /** Null is a customer-only read assignment; resource reads require an ID. */
  resourceId?: string;
  allowedOperations: readonly CustomerReadOperation[];
  status: CustomerMappingStatus;
  grantSource: CustomerMappingProvenance;
  grantedBy: string;
  updatedBy: string;
  revokedBy?: string;
  revokedAt?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CustomerOrganizationMembership {
  organizationId: string;
  /** Workspace role is informational only.  It never grants customer access. */
  role: string;
  workspaceKind: "personal" | "agency" | "customer";
}

export interface CustomerListOptions {
  query?: string;
  cursor?: string;
  limit?: number;
}

export interface CustomerProvenanceView {
  source: CustomerMappingProvenance;
  observedAt: string;
}

export interface CustomerSummary {
  id: string;
  displayName: string;
  kind: CustomerRelationshipKind;
  domain?: string;
  observedAt: string;
  provenance: CustomerProvenanceView;
}

export interface CustomerResourceView {
  id: string;
  kind: CustomerResourceKind;
  label?: string;
  availability: CustomerResourceAvailability;
  observedAt: string;
  /** A server-generated link only; external provider references stay private. */
  href?: string;
}

/** Server-only authority marker for links returned by a native reader. */
export type CustomerResourceHrefTrust = "native" | "internal";

export interface CustomerCollection {
  organizationId: string;
  customers: CustomerSummary[];
  nextCursor?: string;
}

export interface CustomerDetail {
  organizationId: string;
  customer: CustomerSummary;
  resources: CustomerResourceView[];
}

export type CustomerResourceReadResult = {
  availability: Exclude<CustomerResourceAvailability, "revoked">;
  observedAt?: string;
  label?: string;
  href?: string;
  /** Never projected to the browser; controls the server-side href allowlist. */
  hrefTrust?: CustomerResourceHrefTrust;
};

export type CustomerResourceReader = (input: {
  actor: CustomerActor;
  resource: CustomerResourceRecord;
  /** Authorized scope used for stable same-app resource links. */
  organizationId: string;
  customerId: string;
}) => Promise<CustomerResourceReadResult>;

export type CustomerResourceReaders = Partial<
  Record<CustomerResourceKind, CustomerResourceReader>
>;
