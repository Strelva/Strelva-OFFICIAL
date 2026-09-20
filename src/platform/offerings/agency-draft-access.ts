import { z } from "zod";
import { getSupabase } from "@/lib/db/client";
import {
  WorkspaceAccessError,
  WorkspaceConflictError,
  WorkspaceStoreError,
  type WorkspaceActor,
} from "@/platform/workspaces/types";

const uuid = z.string().uuid();
const email = z.string().trim().toLowerCase().email().max(254);
const dateTime = z.string().datetime({ offset: true });

export const agencyApplicationDraftGrantSchema = z.object({
  id: uuid,
  applicationWorkId: uuid,
  businessWorkspaceId: uuid,
  installationId: uuid,
  deliveryId: uuid,
  assignmentId: uuid,
  agencyWorkspaceId: uuid,
  operatorUserId: uuid,
  grantedBy: uuid,
  status: z.enum(["active", "revoked"]),
  expiresAt: dateTime,
  createdAt: dateTime,
  updatedAt: dateTime,
  revokedAt: dateTime.nullable(),
  revokedBy: uuid.nullable(),
}).strict();
export type AgencyApplicationDraftGrant = z.infer<typeof agencyApplicationDraftGrantSchema>;

export const agencyApplicationDraftWorkSchema = z.object({
  applicationWorkId: uuid,
  customerWorkspaceId: uuid,
  customerWorkspaceName: z.string().trim().min(1),
  applicationTitle: z.string().trim().min(1),
  assignmentId: uuid,
  deliveryId: uuid,
  assignmentExpiresAt: dateTime,
  draftGrantStatus: z.enum(["active", "revoked"]).nullable(),
  draftGrantExpiresAt: dateTime.nullable(),
}).strict();
export type AgencyApplicationDraftWork = z.infer<typeof agencyApplicationDraftWorkSchema>;

interface RpcClient {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
}

function db(): RpcClient {
  const client = getSupabase();
  if (!client) throw new WorkspaceStoreError("Agency draft access is unavailable right now.");
  return client as unknown as RpcClient;
}

function identity(actor: WorkspaceActor) {
  return {
    p_user_id: uuid.parse(actor.userId),
    p_verified_email: email.parse(actor.verifiedEmail),
  };
}

function rows(data: unknown): unknown[] {
  if (!Array.isArray(data)) throw new WorkspaceStoreError("Agency draft access is unreadable.");
  return data;
}

function row(data: unknown): Record<string, unknown> {
  const value = Array.isArray(data) ? data[0] : data;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new WorkspaceStoreError("Agency draft access is unreadable.");
  return value as Record<string, unknown>;
}

function parseGrant(value: unknown): AgencyApplicationDraftGrant {
  const input = value as Record<string, unknown>;
  return agencyApplicationDraftGrantSchema.parse({
    id: input.id,
    applicationWorkId: input.application_work_id ?? input.applicationWorkId,
    businessWorkspaceId: input.business_workspace_id ?? input.businessWorkspaceId,
    installationId: input.installation_id ?? input.installationId,
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

function parseWork(value: unknown): AgencyApplicationDraftWork {
  const input = value as Record<string, unknown>;
  return agencyApplicationDraftWorkSchema.parse({
    applicationWorkId: input.application_work_id ?? input.applicationWorkId,
    customerWorkspaceId: input.customer_workspace_id ?? input.customerWorkspaceId,
    customerWorkspaceName: input.customer_workspace_name ?? input.customerWorkspaceName,
    applicationTitle: input.application_title ?? input.applicationTitle,
    assignmentId: input.assignment_id ?? input.assignmentId,
    deliveryId: input.delivery_id ?? input.deliveryId,
    assignmentExpiresAt: input.assignment_expires_at ?? input.assignmentExpiresAt,
    draftGrantStatus: input.draft_grant_status ?? input.draftGrantStatus ?? null,
    draftGrantExpiresAt: input.draft_grant_expires_at ?? input.draftGrantExpiresAt ?? null,
  });
}

function failure(error: { message?: string; code?: string } | null): never | void {
  if (!error) return;
  const detail = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  if (detail.includes("agency_application_draft_edit_denied") || detail.includes("verified_identity_required")) {
    throw new WorkspaceAccessError("This application draft is unavailable to your account.");
  }
  if (detail.includes("agency_application_draft_edit_conflict") || detail.includes("revision_conflict")) {
    throw new WorkspaceConflictError("This application draft changed. Reload it before trying again.");
  }
  if (detail.includes("42p01") || detail.includes("pgrst202") || detail.includes("does not exist")) {
    throw new WorkspaceStoreError("Agency draft access is not available in this environment.");
  }
  throw new WorkspaceStoreError("Agency draft access could not be confirmed.");
}

export interface AgencyApplicationDraftAccessService {
  read(actor: WorkspaceActor, workId: string): Promise<AgencyApplicationDraftGrant | null>;
  grant(actor: WorkspaceActor, deliveryId: string, workId: string): Promise<AgencyApplicationDraftGrant>;
  revoke(actor: WorkspaceActor, grantId: string): Promise<AgencyApplicationDraftGrant>;
  list(actor: WorkspaceActor, agencyWorkspaceId: string): Promise<AgencyApplicationDraftWork[]>;
}

export const postgresAgencyApplicationDraftAccess: AgencyApplicationDraftAccessService = {
  async read(actor, workId) {
    const { data, error } = await db().rpc("read_agency_application_draft_edit", {
      ...identity(actor),
      p_work_id: uuid.parse(workId),
    });
    failure(error);
    const values = rows(data);
    return values[0] ? parseGrant(values[0]) : null;
  },
  async grant(actor, deliveryId, workId) {
    const { data, error } = await db().rpc("grant_agency_application_draft_edit", {
      ...identity(actor),
      p_delivery_id: uuid.parse(deliveryId),
      p_work_id: uuid.parse(workId),
    });
    failure(error);
    return parseGrant(row(data));
  },
  async revoke(actor, grantId) {
    const { data, error } = await db().rpc("revoke_agency_application_draft_edit", {
      ...identity(actor),
      p_grant_id: uuid.parse(grantId),
    });
    failure(error);
    return parseGrant(row(data));
  },
  async list(actor, agencyWorkspaceId) {
    const { data, error } = await db().rpc("list_agency_application_draft_work", {
      ...identity(actor),
      p_agency_workspace_id: uuid.parse(agencyWorkspaceId),
    });
    failure(error);
    return rows(data).map(parseWork);
  },
};

export function createAgencyApplicationDraftAccessService(
  service: AgencyApplicationDraftAccessService = postgresAgencyApplicationDraftAccess,
) {
  return {
    read(actor: WorkspaceActor, workId: string) {
      return service.read(actor, uuid.parse(workId));
    },
    grant(actor: WorkspaceActor, deliveryId: string, workId: string) {
      return service.grant(actor, uuid.parse(deliveryId), uuid.parse(workId));
    },
    revoke(actor: WorkspaceActor, grantId: string) {
      return service.revoke(actor, uuid.parse(grantId));
    },
    list(actor: WorkspaceActor, agencyWorkspaceId: string) {
      return service.list(actor, uuid.parse(agencyWorkspaceId));
    },
  };
}

