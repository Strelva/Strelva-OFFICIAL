import { getSupabase } from "@/lib/db/client";
import { CustomerStoreError } from "./errors";
import {
  CUSTOMER_MAPPING_PROVENANCE,
  CUSTOMER_READ_OPERATIONS,
  CUSTOMER_RELATIONSHIP_KINDS,
  CUSTOMER_RESOURCE_KINDS,
  type CustomerActor,
  type CustomerAssignmentRecord,
  type CustomerMappingProvenance,
  type CustomerOrganizationMembership,
  type CustomerReadOperation,
  type CustomerRelationshipKind,
  type CustomerRelationshipRecord,
  type CustomerResourceKind,
  type CustomerResourceRecord,
  type CustomerMappingStatus,
} from "./types";
import type { CustomerDb } from "./schema";

type DbRow = Record<string, unknown>;
type DbFailure = { code?: string; message?: string } | null;

const RELATIONSHIP_FIELDS = [
  "id",
  "organization_workspace_id",
  "customer_workspace_id",
  "display_name",
  "customer_kind",
  "display_domain",
  "status",
  "provenance_source",
  "evidence_reference",
  "recorded_by",
  "updated_by",
  "revoked_by",
  "revoked_at",
  "created_at",
  "updated_at",
  "version",
].join(",");

const RESOURCE_FIELDS = [
  "id",
  "customer_relationship_id",
  "resource_kind",
  "resource_reference",
  "display_label",
  "status",
  "provenance_source",
  "evidence_reference",
  "recorded_by",
  "updated_by",
  "revoked_by",
  "revoked_at",
  "created_at",
  "updated_at",
  "version",
].join(",");

const ASSIGNMENT_FIELDS = [
  "id",
  "organization_workspace_id",
  "user_id",
  "customer_relationship_id",
  "customer_resource_id",
  "allowed_operations",
  "status",
  "grant_source",
  "granted_by",
  "updated_by",
  "revoked_by",
  "revoked_at",
  "created_at",
  "updated_at",
  "version",
].join(",");

function db(): CustomerDb {
  const client = getSupabase();
  if (!client) throw new CustomerStoreError();
  return client as unknown as CustomerDb;
}

function fail(error: DbFailure): never {
  // Do not include provider/database details in a user-facing error.  The
  // route maps this to a bounded source-unavailable response.
  void error;
  throw new CustomerStoreError();
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalString(value: unknown): string | undefined {
  const text = stringValue(value).trim();
  return text ? text : undefined;
}

function safeStatus(value: unknown): CustomerMappingStatus {
  if (value === "active" || value === "revoked") return value;
  throw new CustomerStoreError();
}

function safeProvenance(value: unknown): CustomerMappingProvenance {
  if (CUSTOMER_MAPPING_PROVENANCE.includes(value as CustomerMappingProvenance)) {
    return value as CustomerMappingProvenance;
  }
  throw new CustomerStoreError();
}

function safeRelationshipKind(value: unknown): CustomerRelationshipKind {
  if (CUSTOMER_RELATIONSHIP_KINDS.includes(value as CustomerRelationshipKind)) {
    return value as CustomerRelationshipKind;
  }
  throw new CustomerStoreError();
}

function safeResourceKind(value: unknown): CustomerResourceKind {
  if (CUSTOMER_RESOURCE_KINDS.includes(value as CustomerResourceKind)) {
    return value as CustomerResourceKind;
  }
  throw new CustomerStoreError();
}

function safeOperations(value: unknown): readonly CustomerReadOperation[] {
  if (!Array.isArray(value) || value.length === 0) throw new CustomerStoreError();
  const operations = value.filter((candidate): candidate is CustomerReadOperation =>
    typeof candidate === "string" && CUSTOMER_READ_OPERATIONS.includes(candidate as CustomerReadOperation),
  );
  if (operations.length !== value.length || new Set(operations).size !== operations.length) {
    throw new CustomerStoreError();
  }
  return operations;
}

function safeVersion(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  throw new CustomerStoreError();
}

function mapRelationship(row: DbRow): CustomerRelationshipRecord {
  const id = stringValue(row.id);
  const organizationId = stringValue(row.organization_workspace_id);
  const displayName = stringValue(row.display_name).trim();
  const recordedBy = stringValue(row.recorded_by);
  const updatedBy = stringValue(row.updated_by);
  const createdAt = stringValue(row.created_at);
  const updatedAt = stringValue(row.updated_at);
  if (!id || !organizationId || !displayName || !recordedBy || !updatedBy || !createdAt || !updatedAt) {
    throw new CustomerStoreError();
  }
  return {
    id,
    organizationId,
    ...(optionalString(row.customer_workspace_id)
      ? { customerWorkspaceId: optionalString(row.customer_workspace_id) }
      : {}),
    displayName,
    kind: safeRelationshipKind(row.customer_kind),
    ...(optionalString(row.display_domain) ? { domain: optionalString(row.display_domain) } : {}),
    status: safeStatus(row.status),
    provenance: safeProvenance(row.provenance_source),
    ...(optionalString(row.evidence_reference)
      ? { evidenceReference: optionalString(row.evidence_reference) }
      : {}),
    recordedBy,
    updatedBy,
    ...(optionalString(row.revoked_by) ? { revokedBy: optionalString(row.revoked_by) } : {}),
    ...(optionalString(row.revoked_at) ? { revokedAt: optionalString(row.revoked_at) } : {}),
    createdAt,
    updatedAt,
    version: safeVersion(row.version),
  };
}

function mapResource(row: DbRow): CustomerResourceRecord {
  const id = stringValue(row.id);
  const relationshipId = stringValue(row.customer_relationship_id);
  const resourceReference = stringValue(row.resource_reference).trim();
  const recordedBy = stringValue(row.recorded_by);
  const updatedBy = stringValue(row.updated_by);
  const createdAt = stringValue(row.created_at);
  const updatedAt = stringValue(row.updated_at);
  if (!id || !relationshipId || !resourceReference || !recordedBy || !updatedBy || !createdAt || !updatedAt) {
    throw new CustomerStoreError();
  }
  return {
    id,
    relationshipId,
    kind: safeResourceKind(row.resource_kind),
    resourceReference,
    ...(optionalString(row.display_label) ? { label: optionalString(row.display_label) } : {}),
    status: safeStatus(row.status),
    provenance: safeProvenance(row.provenance_source),
    ...(optionalString(row.evidence_reference)
      ? { evidenceReference: optionalString(row.evidence_reference) }
      : {}),
    recordedBy,
    updatedBy,
    ...(optionalString(row.revoked_by) ? { revokedBy: optionalString(row.revoked_by) } : {}),
    ...(optionalString(row.revoked_at) ? { revokedAt: optionalString(row.revoked_at) } : {}),
    createdAt,
    updatedAt,
    version: safeVersion(row.version),
  };
}

function mapAssignment(row: DbRow): CustomerAssignmentRecord {
  const id = stringValue(row.id);
  const organizationId = stringValue(row.organization_workspace_id);
  const userId = stringValue(row.user_id);
  const relationshipId = stringValue(row.customer_relationship_id);
  const grantedBy = stringValue(row.granted_by);
  const updatedBy = stringValue(row.updated_by);
  const createdAt = stringValue(row.created_at);
  const updatedAt = stringValue(row.updated_at);
  if (!id || !organizationId || !userId || !relationshipId || !grantedBy || !updatedBy || !createdAt || !updatedAt) {
    throw new CustomerStoreError();
  }
  return {
    id,
    organizationId,
    userId,
    relationshipId,
    ...(optionalString(row.customer_resource_id)
      ? { resourceId: optionalString(row.customer_resource_id) }
      : {}),
    allowedOperations: safeOperations(row.allowed_operations),
    status: safeStatus(row.status),
    grantSource: safeProvenance(row.grant_source),
    grantedBy,
    updatedBy,
    ...(optionalString(row.revoked_by) ? { revokedBy: optionalString(row.revoked_by) } : {}),
    ...(optionalString(row.revoked_at) ? { revokedAt: optionalString(row.revoked_at) } : {}),
    createdAt,
    updatedAt,
    version: safeVersion(row.version),
  };
}

/**
 * The service-role client bypasses RLS.  This store only exposes narrow reads;
 * the service layer must call these in the order documented by AUTH-02.
 */
export interface CustomerMappingStore {
  verifyActor(actor: CustomerActor): Promise<boolean>;
  getOrganizationMembership(
    userId: string,
    organizationId: string,
  ): Promise<CustomerOrganizationMembership | null>;
  listAssignments(userId: string, organizationId: string): Promise<CustomerAssignmentRecord[]>;
  listRelationships(organizationId: string, ids: string[]): Promise<CustomerRelationshipRecord[]>;
  getRelationship(organizationId: string, id: string): Promise<CustomerRelationshipRecord | null>;
  listResources(
    organizationId: string,
    relationshipId: string,
    ids: string[],
  ): Promise<CustomerResourceRecord[]>;
}

export class PostgresCustomerMappingStore implements CustomerMappingStore {
  async verifyActor(actor: CustomerActor): Promise<boolean> {
    const { data, error } = await db()
      .from("users")
      .select("id,email,verified_at")
      .eq("id", actor.userId)
      .maybeSingle();
    if (error) fail(error);
    const row = (data ?? null) as unknown as DbRow | null;
    return Boolean(
      row &&
        stringValue(row.id) === actor.userId &&
        stringValue(row.email).trim().toLowerCase() === actor.verifiedEmail &&
        stringValue(row.verified_at),
    );
  }

  async getOrganizationMembership(
    userId: string,
    organizationId: string,
  ): Promise<CustomerOrganizationMembership | null> {
    // Membership is checked before the workspace kind and before any mapping
    // query.  The role is deliberately not converted into a grant.
    const { data: membership, error: membershipError } = await db()
      .from("workspace_memberships")
      .select("workspace_id,user_id,role")
      .eq("workspace_id", organizationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (membershipError) fail(membershipError);
    if (!membership) return null;

    const { data: workspace, error: workspaceError } = await db()
      .from("workspaces")
      .select("id,kind")
      .eq("id", organizationId)
      .maybeSingle();
    if (workspaceError) fail(workspaceError);
    if (!workspace) return null;
    const workspaceRow = workspace as unknown as DbRow;
    const membershipRow = membership as unknown as DbRow;
    const kind = stringValue(workspaceRow.kind) as CustomerOrganizationMembership["workspaceKind"];
    if (!kind) return null;
    return {
      organizationId,
      role: stringValue(membershipRow.role),
      workspaceKind: kind,
    };
  }

  async listAssignments(userId: string, organizationId: string): Promise<CustomerAssignmentRecord[]> {
    const { data, error } = await db()
      .from("customer_assignments")
      .select(ASSIGNMENT_FIELDS)
      .eq("organization_workspace_id", organizationId)
      .eq("user_id", userId)
      .eq("status", "active")
      .order("customer_relationship_id", { ascending: true })
      .order("customer_resource_id", { ascending: true, nullsFirst: true })
      .limit(2001);
    if (error) fail(error);
    return (data ?? []).map((row) => mapAssignment(row as unknown as DbRow));
  }

  async listRelationships(organizationId: string, ids: string[]): Promise<CustomerRelationshipRecord[]> {
    if (!ids.length) return [];
    const { data, error } = await db()
      .from("customer_relationships")
      .select(RELATIONSHIP_FIELDS)
      .eq("organization_workspace_id", organizationId)
      .eq("status", "active")
      .in("id", ids)
      .order("display_name", { ascending: true })
      .order("id", { ascending: true })
      .limit(2001);
    if (error) fail(error);
    return (data ?? []).map((row) => mapRelationship(row as unknown as DbRow));
  }

  async getRelationship(organizationId: string, id: string): Promise<CustomerRelationshipRecord | null> {
    const { data, error } = await db()
      .from("customer_relationships")
      .select(RELATIONSHIP_FIELDS)
      .eq("organization_workspace_id", organizationId)
      .eq("id", id)
      .maybeSingle();
    if (error) fail(error);
    return data ? mapRelationship(data as unknown as DbRow) : null;
  }

  async listResources(
    organizationId: string,
    relationshipId: string,
    ids: string[],
  ): Promise<CustomerResourceRecord[]> {
    if (!ids.length) return [];
    // The relationship/org predicates are both intentional.  The org value is
    // not inferred from a resource or from an installation reference.
    const { data, error } = await db()
      .from("customer_resources")
      .select(RESOURCE_FIELDS)
      .eq("organization_workspace_id", organizationId)
      .eq("customer_relationship_id", relationshipId)
      .in("id", ids)
      .in("status", ["active", "revoked"])
      .order("id", { ascending: true })
      .limit(2001);
    if (error) fail(error);
    return (data ?? []).map((row) => mapResource(row as unknown as DbRow));
  }
}
