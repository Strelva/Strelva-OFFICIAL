import { getSupabase } from "@/lib/db/client";
import type { OfferingDb } from "./schema";
import { WORKSPACE_EXIT_STOPPED_MESSAGE } from "@/platform/workspaces/types";
import {
  OFFERING_NATIVE_RESOURCE_KINDS,
  OfferingAccessError,
  OfferingConflictError,
  OfferingNotFoundError,
  OfferingStoreError,
  type OfferingActor,
  type OfferingInstallationRecord,
  type OfferingNativeResource,
  type OfferingResponsibility,
  type OfferingWebsiteBindingRecord,
  type OfferingWorkspaceRole,
} from "./types";

type DbRow = Record<string, unknown>;
type DbFailure = { code?: string; message?: string } | null;

export interface OfferingAccess {
  role: OfferingWorkspaceRole;
  canManage: boolean;
}

export interface OfferingInspection {
  access: OfferingAccess;
  installations: OfferingInstallationRecord[];
  websiteBindings: OfferingWebsiteBindingRecord[];
}

export interface OfferingInstallWrite {
  businessId: string;
  definitionId: string;
  definitionVersion: string;
  idempotencyKey: string;
  commandDigest: string;
  configuration: Record<string, unknown>;
  nativeResources: readonly OfferingNativeResource[];
  responsibility: OfferingResponsibility;
  acceptedScope: readonly string[];
  surfaceIds: readonly string[];
}

export interface OfferingStore {
  inspect(actor: OfferingActor, businessId: string, installationId?: string): Promise<OfferingInspection>;
  install(actor: OfferingActor, input: OfferingInstallWrite): Promise<OfferingInstallationRecord>;
  activate(actor: OfferingActor, input: {
    businessId: string;
    installationId: string;
    expectedRevision: number;
  }): Promise<OfferingInstallationRecord>;
  updateConfiguration(actor: OfferingActor, input: {
    businessId: string;
    installationId: string;
    expectedRevision: number;
    configuration: Record<string, unknown>;
  }): Promise<OfferingInstallationRecord>;
  retire(actor: OfferingActor, input: {
    businessId: string;
    installationId: string;
    expectedRevision: number;
    reason: string;
  }): Promise<OfferingInstallationRecord>;
  bindWebsite(actor: OfferingActor, input: { businessId: string; tenantId: string; idempotencyKey: string; commandDigest: string }): Promise<OfferingWebsiteBindingRecord>;
  revokeWebsiteBinding(actor: OfferingActor, input: { businessId: string; bindingId: string; expectedRevision: number; reason: string }): Promise<OfferingWebsiteBindingRecord>;
}

function db(): OfferingDb {
  const client = getSupabase();
  if (!client) throw new OfferingStoreError();
  return client as unknown as OfferingDb;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalText(value: unknown): string | undefined {
  const result = text(value).trim();
  return result || undefined;
}

function revision(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  throw new OfferingStoreError();
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new OfferingStoreError();
  return value as string[];
}

function mapResources(value: unknown): OfferingNativeResource[] {
  if (!Array.isArray(value)) throw new OfferingStoreError();
  return value.map((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new OfferingStoreError();
    const row = candidate as DbRow;
    const kind = text(row.kind) as OfferingNativeResource["kind"];
    const id = text(row.id);
    if (!OFFERING_NATIVE_RESOURCE_KINDS.includes(kind) || !id) throw new OfferingStoreError();
    return { kind, id };
  });
}

function mapResponsibility(value: unknown): OfferingResponsibility {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new OfferingStoreError();
  const row = value as DbRow;
  if (row.kind === "customer_operated" && text(row.providerName)) {
    return { kind: "customer_operated", providerName: text(row.providerName) };
  }
  if (row.kind === "provider_requested"
    && (row.providerKind === "strelva" || row.providerKind === "agency" || row.providerKind === "named_third_party")
    && text(row.providerName)) {
    const agencyWorkspaceId = optionalText(row.agencyWorkspaceId);
    if (row.providerKind === "agency" && !agencyWorkspaceId) throw new OfferingStoreError();
    return {
      kind: "provider_requested",
      providerKind: row.providerKind,
      providerName: text(row.providerName),
      ...(row.providerKind === "agency" ? { agencyWorkspaceId } : {}),
      ...(optionalText(row.requestNote) ? { requestNote: optionalText(row.requestNote) } : {}),
    };
  }
  throw new OfferingStoreError();
}

function mapInstallation(row: DbRow): OfferingInstallationRecord {
  const status = row.status;
  const configuration = row.configuration;
  if ((status !== "draft" && status !== "active" && status !== "retired") || !configuration || typeof configuration !== "object" || Array.isArray(configuration)) {
    throw new OfferingStoreError();
  }
  const result: OfferingInstallationRecord = {
    id: text(row.id),
    businessId: text(row.business_workspace_id),
    definitionId: text(row.definition_id),
    definitionVersion: text(row.definition_version),
    status,
    revision: revision(row.revision),
    configuration: configuration as Record<string, unknown>,
    nativeResources: mapResources(row.native_resources),
    responsibility: mapResponsibility(row.responsibility),
    acceptedScope: stringArray(row.accepted_scope),
    surfaceIds: stringArray(row.surface_ids),
    installedBy: text(row.installed_by),
    installedAt: text(row.installed_at),
    updatedBy: text(row.updated_by),
    updatedAt: text(row.updated_at),
    ...(optionalText(row.retired_by) ? { retiredBy: optionalText(row.retired_by) } : {}),
    ...(optionalText(row.retired_at) ? { retiredAt: optionalText(row.retired_at) } : {}),
    ...(optionalText(row.retirement_reason) ? { retirementReason: optionalText(row.retirement_reason) } : {}),
  };
  if (!result.id || !result.businessId || !result.definitionId || !result.definitionVersion || !result.installedBy || !result.installedAt || !result.updatedBy || !result.updatedAt) {
    throw new OfferingStoreError();
  }
  return result;
}

function mapWebsiteBinding(row: DbRow): OfferingWebsiteBindingRecord {
  const status = row.status;
  if (status !== "active" && status !== "revoked") throw new OfferingStoreError();
  const result: OfferingWebsiteBindingRecord = {
    id: text(row.id),
    businessId: text(row.business_workspace_id),
    status,
    revision: revision(row.revision),
    tenantId: text(row.tenant_id),
    siteName: text(row.site_name),
    tenantActive: row.tenant_active === true,
    actorHasTenantAccess: row.actor_has_tenant_access === true,
    createdBy: text(row.created_by),
    createdAt: text(row.created_at),
    updatedBy: text(row.updated_by),
    updatedAt: text(row.updated_at),
    ...(optionalText(row.revoked_by) ? { revokedBy: optionalText(row.revoked_by) } : {}),
    ...(optionalText(row.revoked_at) ? { revokedAt: optionalText(row.revoked_at) } : {}),
    ...(optionalText(row.revocation_reason) ? { revocationReason: optionalText(row.revocation_reason) } : {}),
  };
  if (!result.id || !result.businessId || !result.tenantId || !result.siteName || !result.createdBy || !result.createdAt || !result.updatedBy || !result.updatedAt) throw new OfferingStoreError();
  return result;
}

function failure(error: DbFailure): never {
  const detail = `${error?.code ?? ""} ${error?.message ?? ""}`;
  if (/offering_(actor|membership|business|manage|tenant_owner)_/.test(detail)) throw new OfferingAccessError();
  if (detail.includes("workspace_exit_future_work_blocked")) throw new OfferingConflictError(WORKSPACE_EXIT_STOPPED_MESSAGE);
  if (detail.includes("offering_installation_not_found") || detail.includes("offering_website_binding_not_found")) throw new OfferingNotFoundError();
  if (detail.includes("offering_") || error?.code === "23505") throw new OfferingConflictError();
  throw new OfferingStoreError();
}

async function oneRpc(
  operation: PromiseLike<{ data: DbRow[] | null; error: DbFailure }>,
): Promise<OfferingInstallationRecord> {
  const { data, error } = await operation;
  if (error) failure(error);
  const row = data?.[0];
  if (!row) throw new OfferingStoreError();
  return mapInstallation(row);
}

async function oneWebsiteRpc(operation: PromiseLike<{ data: DbRow[] | null; error: DbFailure }>): Promise<OfferingWebsiteBindingRecord> {
  const { data, error } = await operation;
  if (error) failure(error);
  const row = data?.[0];
  if (!row) throw new OfferingStoreError();
  return mapWebsiteBinding(row);
}

export class PostgresOfferingStore implements OfferingStore {
  async inspect(actor: OfferingActor, businessId: string, installationId?: string): Promise<OfferingInspection> {
    const { data, error } = await db().rpc("read_offering_business_snapshot", {
      p_business_id: businessId,
      p_user_id: actor.userId,
      p_verified_email: actor.verifiedEmail,
      p_installation_id: installationId ?? null,
    });
    if (error) failure(error);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new OfferingStoreError();
    const snapshot = data as DbRow;
    const role = text(snapshot.workspaceRole) as OfferingWorkspaceRole;
    if (!(["owner", "admin", "member"] as const).includes(role)) throw new OfferingStoreError();
    return {
      access: { role, canManage: role === "owner" || role === "admin" },
      installations: Array.isArray(snapshot.installations) ? snapshot.installations.map((entry) => mapInstallation(entry as DbRow)) : [],
      websiteBindings: Array.isArray(snapshot.websiteBindings) ? snapshot.websiteBindings.map((entry) => mapWebsiteBinding(entry as DbRow)) : [],
    };
  }

  install(actor: OfferingActor, input: OfferingInstallWrite): Promise<OfferingInstallationRecord> {
    if (input.nativeResources.length === 0 && input.definitionId === "private_staff_requests") {
      return oneRpc(db().rpc("prepare_staff_request_offering", {
        p_business_id: input.businessId,
        p_user_id: actor.userId,
        p_verified_email: actor.verifiedEmail,
        p_idempotency_key: input.idempotencyKey,
        p_command_digest: input.commandDigest,
        p_configuration: input.configuration,
        p_responsibility: input.responsibility,
        p_accepted_scope: [...input.acceptedScope],
        p_surface_ids: [...input.surfaceIds],
      }));
    }
    return oneRpc(db().rpc("install_offering", {
      p_business_id: input.businessId,
      p_user_id: actor.userId,
      p_verified_email: actor.verifiedEmail,
      p_definition_id: input.definitionId,
      p_definition_version: input.definitionVersion,
      p_idempotency_key: input.idempotencyKey,
      p_command_digest: input.commandDigest,
      p_configuration: input.configuration,
      p_native_resources: input.nativeResources,
      p_responsibility: input.responsibility,
      p_accepted_scope: [...input.acceptedScope],
      p_surface_ids: [...input.surfaceIds],
    }));
  }

  activate(actor: OfferingActor, input: { businessId: string; installationId: string; expectedRevision: number }): Promise<OfferingInstallationRecord> {
    return oneRpc(db().rpc("activate_offering", {
      p_business_id: input.businessId,
      p_installation_id: input.installationId,
      p_user_id: actor.userId,
      p_verified_email: actor.verifiedEmail,
      p_expected_revision: input.expectedRevision,
    }));
  }

  updateConfiguration(actor: OfferingActor, input: { businessId: string; installationId: string; expectedRevision: number; configuration: Record<string, unknown> }): Promise<OfferingInstallationRecord> {
    return oneRpc(db().rpc("update_offering_configuration", {
      p_business_id: input.businessId,
      p_installation_id: input.installationId,
      p_user_id: actor.userId,
      p_verified_email: actor.verifiedEmail,
      p_expected_revision: input.expectedRevision,
      p_configuration: input.configuration,
    }));
  }

  retire(actor: OfferingActor, input: { businessId: string; installationId: string; expectedRevision: number; reason: string }): Promise<OfferingInstallationRecord> {
    return oneRpc(db().rpc("retire_offering", {
      p_business_id: input.businessId,
      p_installation_id: input.installationId,
      p_user_id: actor.userId,
      p_verified_email: actor.verifiedEmail,
      p_expected_revision: input.expectedRevision,
      p_reason: input.reason,
    }));
  }

  bindWebsite(actor: OfferingActor, input: { businessId: string; tenantId: string; idempotencyKey: string; commandDigest: string }): Promise<OfferingWebsiteBindingRecord> {
    return oneWebsiteRpc(db().rpc("bind_offering_website", {
      p_business_id: input.businessId,
      p_user_id: actor.userId,
      p_verified_email: actor.verifiedEmail,
      p_tenant_id: input.tenantId,
      p_idempotency_key: input.idempotencyKey,
      p_command_digest: input.commandDigest,
    }));
  }

  revokeWebsiteBinding(actor: OfferingActor, input: { businessId: string; bindingId: string; expectedRevision: number; reason: string }): Promise<OfferingWebsiteBindingRecord> {
    return oneWebsiteRpc(db().rpc("revoke_offering_website_binding", {
      p_business_id: input.businessId,
      p_binding_id: input.bindingId,
      p_user_id: actor.userId,
      p_verified_email: actor.verifiedEmail,
      p_expected_revision: input.expectedRevision,
      p_reason: input.reason,
    }));
  }
}
