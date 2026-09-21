import { z } from "zod";
import { getSupabase } from "@/lib/db/client";
import { getEffectiveSubscriptionStatus, isWithinPastDueGrace } from "@/lib/subscription";
import { getTemplateManifestForTenant } from "@/lib/template-manifests";
import { sectionSchemas } from "@/lib/schemas";
import {
  WorkspaceAccessError,
  WorkspaceConflictError,
  WorkspaceStoreError,
  type WorkspaceActor,
} from "@/platform/workspaces/types";
import {
  agencyManagedWebsiteDraftGrantSchema,
  agencyManagedWebsiteDraftPreparationSchema,
  agencyManagedWebsiteDraftRevisionSchema,
  agencyManagedWebsiteDraftWorkSchema,
  agencyWebsiteDraftStateSchema,
  type AgencyManagedWebsiteDraftGrant,
  type AgencyManagedWebsiteDraftPreparation,
  type AgencyManagedWebsiteDraftRevision,
  type AgencyManagedWebsiteDraftWork,
  type AgencyWebsiteDraftState,
} from "./agency-website-draft-contracts";

const uuid = z.string().uuid();
const email = z.string().trim().toLowerCase().email().max(254);
const section = z.string().trim().min(1).max(80);
const hash = z.string().regex(/^[0-9a-f]{32}$/);

interface RpcClient {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
}

function db(): RpcClient {
  const value = getSupabase();
  if (!value) throw new WorkspaceStoreError("Managed website draft storage is unavailable right now.");
  return value as unknown as RpcClient;
}

function identity(actor: WorkspaceActor) {
  return { p_user_id: uuid.parse(actor.userId), p_verified_email: email.parse(actor.verifiedEmail) };
}

function rows(data: unknown): unknown[] {
  if (!Array.isArray(data)) throw new WorkspaceStoreError("Managed website draft access is unreadable.");
  return data;
}

function row(data: unknown): Record<string, unknown> {
  const value = Array.isArray(data) ? data[0] : data;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new WorkspaceStoreError("Managed website draft access is unreadable.");
  return value as Record<string, unknown>;
}

function parseGrant(value: unknown): AgencyManagedWebsiteDraftGrant {
  const input = value as Record<string, unknown>;
  return agencyManagedWebsiteDraftGrantSchema.parse({
    id: input.id,
    managedWebsiteBindingId: input.managed_website_binding_id ?? input.managedWebsiteBindingId,
    businessWorkspaceId: input.business_workspace_id ?? input.businessWorkspaceId,
    tenantId: input.tenant_id ?? input.tenantId,
    deliveryId: input.delivery_id ?? input.deliveryId,
    assignmentId: input.assignment_id ?? input.assignmentId,
    agencyWorkspaceId: input.agency_workspace_id ?? input.agencyWorkspaceId,
    operatorUserId: input.operator_user_id ?? input.operatorUserId,
    grantedBy: input.granted_by ?? input.grantedBy,
    status: input.status,
    expiresAt: input.expires_at ?? input.expiresAt,
    createdAt: input.created_at ?? input.createdAt,
    updatedAt: input.updated_at ?? input.updatedAt,
    revokedAt: input.revoked_at ?? input.revokedAt ?? null,
    revokedBy: input.revoked_by ?? input.revokedBy ?? null,
  });
}

function parseWork(value: unknown): AgencyManagedWebsiteDraftWork {
  const input = value as Record<string, unknown>;
  return agencyManagedWebsiteDraftWorkSchema.parse({
    managedWebsiteBindingId: input.managed_website_binding_id ?? input.managedWebsiteBindingId,
    customerWorkspaceId: input.customer_workspace_id ?? input.customerWorkspaceId,
    customerWorkspaceName: input.customer_workspace_name ?? input.customerWorkspaceName,
    siteName: input.site_name ?? input.siteName,
    tenantId: input.tenant_id ?? input.tenantId,
    assignmentId: input.assignment_id ?? input.assignmentId,
    deliveryId: input.delivery_id ?? input.deliveryId,
    assignmentExpiresAt: input.assignment_expires_at ?? input.assignmentExpiresAt,
    draftGrantStatus: input.draft_grant_status ?? input.draftGrantStatus ?? null,
    draftGrantExpiresAt: input.draft_grant_expires_at ?? input.draftGrantExpiresAt ?? null,
  });
}

function parseState(value: unknown): AgencyWebsiteDraftState {
  const input = value as Record<string, unknown>;
  return agencyWebsiteDraftStateSchema.parse({
    tenantId: input.tenant_id ?? input.tenantId,
    section: input.section,
    revision: Number(input.revision),
    data: input.data,
    dataHash: input.data_hash ?? input.dataHash,
  });
}

function parsePreparation(value: unknown): AgencyManagedWebsiteDraftPreparation {
  const input = value as Record<string, unknown>;
  return agencyManagedWebsiteDraftPreparationSchema.parse({
    id: input.id,
    bindingId: input.managed_website_binding_id ?? input.binding_id ?? input.bindingId,
    businessWorkspaceId: input.business_workspace_id ?? input.businessWorkspaceId,
    tenantId: input.tenant_id ?? input.tenantId,
    deliveryId: input.delivery_id ?? input.deliveryId,
    assignmentId: input.assignment_id ?? input.assignmentId,
    agencyWorkspaceId: input.agency_workspace_id ?? input.agencyWorkspaceId,
    operatorUserId: input.operator_user_id ?? input.operatorUserId,
    section: input.section,
    data: input.data,
    expectedRevision: Number(input.expected_revision ?? input.expectedRevision),
    expectedHash: input.expected_hash ?? input.expectedHash,
    status: input.status,
    createdAt: input.created_at ?? input.createdAt,
    consumedAt: input.consumed_at ?? input.consumedAt ?? null,
    revisionId: input.revision_id ?? input.revisionId ?? null,
  });
}

function parseRevision(value: unknown): AgencyManagedWebsiteDraftRevision {
  const input = value as Record<string, unknown>;
  return agencyManagedWebsiteDraftRevisionSchema.parse({
    tenantId: input.tenant_id ?? input.tenantId,
    section: input.section,
    revision: Number(input.revision),
    data: input.data,
    dataHash: input.data_hash ?? input.dataHash,
    revisionId: input.revision_id ?? input.revisionId,
    preparationId: input.preparation_id ?? input.preparationId,
    assignmentId: input.assignment_id ?? input.assignmentId,
    bindingId: input.managed_website_binding_id ?? input.binding_id ?? input.bindingId,
  });
}

function failure(error: { message?: string; code?: string } | null): void {
  if (!error) return;
  const detail = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  if (detail.includes("agency_managed_website_draft_denied") || detail.includes("verified_identity_required")) {
    throw new WorkspaceAccessError("This managed website draft is unavailable to your account.");
  }
  if (detail.includes("agency_managed_website_draft_revision_conflict") || detail.includes("revision_conflict")) {
    throw new WorkspaceConflictError("This website draft changed. Reload before trying again.");
  }
  if (detail.includes("agency_managed_website_draft_conflict")) {
    throw new WorkspaceConflictError("The website delivery changed. Reload before trying again.");
  }
  if (detail.includes("agency_managed_website_draft_invalid")) {
    throw new WorkspaceConflictError("The website draft section is invalid.");
  }
  if (detail.includes("42p01") || detail.includes("pgrst202") || detail.includes("does not exist")) {
    throw new WorkspaceStoreError("Managed website draft authority is not available in this environment.");
  }
  throw new WorkspaceStoreError("Managed website draft access could not be confirmed.");
}

async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const result = await db().rpc(name, args);
  failure(result.error);
  return result.data;
}

async function websiteTenant(actor: WorkspaceActor, bindingId: string): Promise<string> {
  const values = rows(await rpc("read_agency_managed_website_draft_tenant", {
    ...identity(actor), p_binding_id: uuid.parse(bindingId),
  }));
  const tenant = row(values);
  return z.string().trim().min(1).max(120).parse(tenant.id);
}

/**
 * Keep the write path aligned with the native content gate, including billing
 * disabled, grandfathered, comped, and past-due grace behavior. The result is
 * passed only to a service_role-only SQL wrapper, never accepted from a client.
 */
async function assertWebsiteSubscription(tenantId: string): Promise<boolean> {
  const status = await getEffectiveSubscriptionStatus(tenantId);
  if (status === "active" || status === "trialing") return true;
  if (status === "past_due" && await isWithinPastDueGrace(tenantId)) return true;
  throw new WorkspaceAccessError("The managed website subscription does not permit a new draft right now.");
}

async function validateSection(tenantId: string, value: string, data?: unknown): Promise<string> {
  const name = section.parse(value);
  const template = await getTemplateManifestForTenant(tenantId);
  if (!new Set<string>(template.contentSections).has(name)) throw new WorkspaceConflictError("This website section is not available for the assigned template.");
  if (data !== undefined) {
    const schema = sectionSchemas[name as keyof typeof sectionSchemas];
    if (!schema || !schema.safeParse(data).success) throw new WorkspaceConflictError("The website draft section does not match its native content schema.");
  }
  return name;
}

export interface AgencyManagedWebsiteDraftAccessService {
  read(actor: WorkspaceActor, bindingId: string): Promise<AgencyManagedWebsiteDraftGrant | null>;
  grant(actor: WorkspaceActor, deliveryId: string, bindingId: string): Promise<AgencyManagedWebsiteDraftGrant>;
  revoke(actor: WorkspaceActor, grantId: string): Promise<AgencyManagedWebsiteDraftGrant>;
  list(actor: WorkspaceActor, agencyWorkspaceId: string): Promise<AgencyManagedWebsiteDraftWork[]>;
  state(actor: WorkspaceActor, bindingId: string, sectionName: string): Promise<AgencyWebsiteDraftState>;
  prepare(actor: WorkspaceActor, assignmentId: string, bindingId: string, sectionName: string, data: unknown, expectedRevision: number, expectedHash: string): Promise<AgencyManagedWebsiteDraftPreparation>;
  pending(actor: WorkspaceActor, responsibilityId: string, bindingId: string, sectionName: string): Promise<AgencyManagedWebsiteDraftPreparation>;
  execute(actor: WorkspaceActor, responsibilityId: string, bindingId: string, sectionName: string): Promise<AgencyManagedWebsiteDraftRevision>;
}

export const postgresAgencyManagedWebsiteDraftAccess: AgencyManagedWebsiteDraftAccessService = {
  async read(actor, bindingId) {
    const values = rows(await rpc("read_agency_managed_website_draft_edit", { ...identity(actor), p_binding_id: uuid.parse(bindingId) }));
    return values[0] ? parseGrant(values[0]) : null;
  },
  async grant(actor, deliveryId, bindingId) {
    const tenantId = await websiteTenant(actor, bindingId);
    const subscriptionExemption = await assertWebsiteSubscription(tenantId);
    return parseGrant(row(await rpc("grant_agency_managed_website_draft_edit_server", {
      ...identity(actor), p_delivery_id: uuid.parse(deliveryId), p_binding_id: uuid.parse(bindingId),
      p_subscription_exemption: subscriptionExemption,
    })));
  },
  async revoke(actor, grantId) {
    return parseGrant(row(await rpc("revoke_agency_managed_website_draft_edit", { ...identity(actor), p_grant_id: uuid.parse(grantId) })));
  },
  async list(actor, agencyWorkspaceId) {
    return rows(await rpc("list_agency_managed_website_draft_work", { ...identity(actor), p_agency_workspace_id: uuid.parse(agencyWorkspaceId) })).map(parseWork);
  },
  async state(actor, bindingId, sectionName) {
    const grant = await this.read(actor, bindingId);
    if (!grant) throw new WorkspaceAccessError("This managed website draft is unavailable to your account.");
    const name = await validateSection(grant.tenantId, sectionName);
    return parseState(row(await rpc("read_agency_managed_website_draft_state", { ...identity(actor), p_binding_id: uuid.parse(bindingId), p_section: name })));
  },
  async prepare(actor, assignmentId, bindingId, sectionName, data, expectedRevision, expectedHash) {
    const grant = await this.read(actor, bindingId);
    if (!grant || grant.status !== "active" || grant.assignmentId !== uuid.parse(assignmentId)) throw new WorkspaceAccessError("This managed website draft is unavailable to your account.");
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) throw new WorkspaceConflictError("Reload the website draft before preparing it.");
    const name = await validateSection(grant.tenantId, sectionName, data);
    const subscriptionExemption = await assertWebsiteSubscription(grant.tenantId);
    return parsePreparation(row(await rpc("prepare_agency_managed_website_draft_server", {
      ...identity(actor), p_assignment_id: uuid.parse(assignmentId), p_binding_id: uuid.parse(bindingId), p_section: name,
      p_data: data, p_expected_revision: expectedRevision, p_expected_hash: hash.parse(expectedHash),
      p_subscription_exemption: subscriptionExemption,
    })));
  },
  async pending(actor, responsibilityId, bindingId, sectionName) {
    const name = section.parse(sectionName);
    const tenantId = await websiteTenant(actor, bindingId);
    const subscriptionExemption = await assertWebsiteSubscription(tenantId);
    return parsePreparation(row(await rpc("read_agency_managed_website_draft_preparation_server", {
      ...identity(actor), p_work_id: uuid.parse(responsibilityId), p_binding_id: uuid.parse(bindingId), p_section: name,
      p_subscription_exemption: subscriptionExemption,
    })));
  },
  async execute(actor, responsibilityId, bindingId, sectionName) {
    const name = section.parse(sectionName);
    const tenantId = await websiteTenant(actor, bindingId);
    const subscriptionExemption = await assertWebsiteSubscription(tenantId);
    return parseRevision(row(await rpc("execute_agency_managed_website_draft_server", {
      ...identity(actor), p_work_id: uuid.parse(responsibilityId), p_binding_id: uuid.parse(bindingId), p_section: name,
      p_subscription_exemption: subscriptionExemption,
    })));
  },
};

export function createAgencyManagedWebsiteDraftAccessService(
  service: AgencyManagedWebsiteDraftAccessService = postgresAgencyManagedWebsiteDraftAccess,
) {
  return {
    read(actor: WorkspaceActor, bindingId: string) { return service.read(actor, uuid.parse(bindingId)); },
    grant(actor: WorkspaceActor, deliveryId: string, bindingId: string) { return service.grant(actor, uuid.parse(deliveryId), uuid.parse(bindingId)); },
    revoke(actor: WorkspaceActor, grantId: string) { return service.revoke(actor, uuid.parse(grantId)); },
    list(actor: WorkspaceActor, agencyWorkspaceId: string) { return service.list(actor, uuid.parse(agencyWorkspaceId)); },
    state(actor: WorkspaceActor, bindingId: string, sectionName: string) { return service.state(actor, uuid.parse(bindingId), section.parse(sectionName)); },
    prepare(actor: WorkspaceActor, assignmentId: string, bindingId: string, sectionName: string, data: unknown, expectedRevision: number, expectedHash: string) {
      return service.prepare(actor, uuid.parse(assignmentId), uuid.parse(bindingId), section.parse(sectionName), data, expectedRevision, hash.parse(expectedHash));
    },
    pending(actor: WorkspaceActor, responsibilityId: string, bindingId: string, sectionName: string) {
      return service.pending(actor, uuid.parse(responsibilityId), uuid.parse(bindingId), section.parse(sectionName));
    },
    execute(actor: WorkspaceActor, responsibilityId: string, bindingId: string, sectionName: string) {
      return service.execute(actor, uuid.parse(responsibilityId), uuid.parse(bindingId), section.parse(sectionName));
    },
  };
}
