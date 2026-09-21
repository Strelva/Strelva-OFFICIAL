import { getSupabase } from "@/lib/db/client";
import {
  ServiceRequestAccessError, ServiceRequestConflictError, ServiceRequestNotFoundError,
  ServiceRequestStoreError, serviceRequestSchema, type ServiceRequest, type ServiceRequestActor,
} from "./types";
import { WORKSPACE_EXIT_STOPPED_MESSAGE } from "@/platform/workspaces/types";
import type { ServiceRequestListQuery, ServiceRequestStore } from "./service";
import type { DeliveryCommitmentMutation } from "./delivery-commitment-service";

type Failure = { code?: string; message?: string } | null;
type RpcClient = { rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: Failure }> };
function client(): RpcClient {
  const value = getSupabase();
  if (!value) throw new ServiceRequestStoreError();
  return value as unknown as RpcClient;
}
function identity(actor: ServiceRequestActor) { return { p_user_id: actor.userId, p_verified_email: actor.verifiedEmail.trim().toLowerCase() }; }
function failure(error: Failure): never | void {
  if (!error) return;
  const detail = `${error.code ?? ""} ${error.message ?? ""}`;
  if (detail.includes("service_request_not_found")) throw new ServiceRequestNotFoundError();
  if (detail.includes("service_request_access_denied") || detail.includes("service_request_provider_ineligible")) throw new ServiceRequestAccessError();
  if (detail.includes("workspace_exit_future_work_blocked")) throw new ServiceRequestConflictError(WORKSPACE_EXIT_STOPPED_MESSAGE);
  if (detail.includes("service_request_") || error.code === "23505" || error.code === "23503" || error.code === "23514") {
    throw new ServiceRequestConflictError("The service request could not be confirmed. Reload before continuing.");
  }
  throw new ServiceRequestStoreError();
}
function row(value: unknown): Record<string, unknown> {
  const item = Array.isArray(value) ? value[0] : value;
  if (!item || typeof item !== "object" || Array.isArray(item)) throw new ServiceRequestStoreError("The service request was not returned.");
  return item as Record<string, unknown>;
}
function map(value: unknown): ServiceRequest {
  const item = row(value);
  const provider = item.provider_kind === "strelva" ? { kind: "strelva" as const }
    : { kind: "agency" as const, agencyWorkspaceId: String(item.provider_agency_workspace_id ?? "") };
  try {
    return serviceRequestSchema.parse({
      id: item.id, businessId: item.business_workspace_id, status: item.status,
      request: item.request_text, outcome: item.outcome, context: item.context, scope: item.scope, provider,
      providerAcceptance: { status: item.provider_acceptance, actorId: item.accepted_by ?? null, acceptedAt: item.accepted_at ?? null, note: item.acceptance_note ?? null },
      installationId: item.installation_id ?? null, deliveryId: item.delivery_id ?? null,
      ...(item.delivery_commitment !== undefined ? { deliveryCommitment: item.delivery_commitment } : {}),
      revision: item.revision, createdBy: item.created_by, createdAt: item.created_at, updatedAt: item.updated_at,
    });
  } catch { throw new ServiceRequestStoreError("The service request could not be read."); }
}
async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const result = await client().rpc(name, args); failure(result.error); return result.data;
}
function listRows(value: unknown): ServiceRequest[] {
  if (!Array.isArray(value)) throw new ServiceRequestStoreError("The service request list could not be read.");
  return value.map(map);
}
export async function mutateServiceRequestCommitment(actor: ServiceRequestActor, input: DeliveryCommitmentMutation): Promise<ServiceRequest> {
  return map(await rpc("change_service_delivery_commitment", { ...identity(actor), p_request_id: input.requestId,
    p_expected_revision: input.expectedRevision, p_change: input.change,
    p_idempotency_key: input.idempotencyKey, p_command_digest: input.commandDigest }));
}
export async function readServiceDeliveryWork(actor: ServiceRequestActor, providerWorkspaceId?: string): Promise<ServiceRequest[]> {
  return listRows(await rpc("read_service_delivery_work", { ...identity(actor),
    p_provider_kind: providerWorkspaceId ? "agency" : "strelva", p_agency_workspace_id: providerWorkspaceId ?? null }));
}
export async function readServiceDeliveryPermissions(actor: ServiceRequestActor, requestId: string): Promise<unknown> {
  return rpc("read_service_delivery_permissions", { ...identity(actor), p_request_id: requestId });
}
export const PostgresServiceRequestStore: ServiceRequestStore = {
  async list(actor, query: ServiceRequestListQuery) {
    if ("businessId" in query) return listRows(await rpc("read_service_requests_for_business", { ...identity(actor), p_business_id: query.businessId }));
    if ("providerWorkspaceId" in query) return listRows(await rpc("read_service_requests_for_agency", { ...identity(actor), p_agency_workspace_id: query.providerWorkspaceId }));
    return listRows(await rpc("read_service_requests_for_strelva", identity(actor)));
  },
  async read(actor, requestId) { return map(await rpc("read_service_request", { ...identity(actor), p_request_id: requestId })); },
  async save(actor, input) {
    return map(await rpc("save_service_request", { ...identity(actor), p_business_id: input.businessId,
      p_request_id: input.requestId ?? null, p_expected_revision: input.expectedRevision ?? null, p_status: input.status,
      p_request_text: input.request, p_outcome: input.outcome, p_context: input.context, p_scope: input.scope,
      p_provider: input.provider, p_idempotency_key: input.idempotencyKey, p_command_digest: input.commandDigest }));
  },
  async respond(actor, input) {
    return map(await rpc("respond_service_request", { ...identity(actor), p_request_id: input.requestId,
      p_decision: input.decision, p_expected_revision: input.expectedRevision, p_note: input.note ?? null,
      p_idempotency_key: input.idempotencyKey, p_command_digest: input.commandDigest }));
  },
  async linkDelivery(actor, input) {
    return map(await rpc("link_service_request_delivery", { ...identity(actor), p_business_id: input.businessId,
      p_request_id: input.requestId, p_installation_id: input.installationId, p_delivery_id: input.deliveryId,
      p_expected_revision: input.expectedRevision, p_idempotency_key: input.idempotencyKey, p_command_digest: input.commandDigest }));
  },
  async withdraw(actor, input) {
    return map(await rpc("withdraw_service_request", { ...identity(actor), p_business_id: input.businessId,
      p_request_id: input.requestId, p_expected_revision: input.expectedRevision,
      p_idempotency_key: input.idempotencyKey, p_command_digest: input.commandDigest }));
  },
};
