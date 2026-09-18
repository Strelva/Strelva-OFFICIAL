import { getSupabase } from "@/lib/db/client";
import { OfferingAccessError, OfferingConflictError, OfferingNotFoundError, OfferingStoreError, type OfferingActor } from "./types";
import { providerDeliverySchema, type ProviderDelivery, type ProviderDeliveryStore } from "./provider-delivery";

type Failure = { message?: string; code?: string } | null;
type Client = { rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: Failure }> };

function client(): Client {
  const value = getSupabase();
  if (!value) throw new OfferingStoreError("Provider delivery storage is unavailable.");
  return value as unknown as Client;
}

function identity(actor: OfferingActor) {
  return { p_user_id: actor.userId, p_verified_email: actor.verifiedEmail.trim().toLowerCase() };
}

function fail(error: Failure): void {
  if (!error) return;
  const message = `${error.code ?? ""} ${error.message ?? ""}`;
  if (message.includes("provider_delivery_denied")) throw new OfferingAccessError();
  if (message.includes("provider_delivery_not_found")) throw new OfferingNotFoundError("The provider delivery request was not found.");
  if (message.includes("provider_delivery_") || error.code === "23505") throw new OfferingConflictError("The provider delivery request changed. Reload before continuing.");
  throw new OfferingStoreError("The provider delivery change could not be confirmed.");
}

function map(raw: unknown): ProviderDelivery {
  const row = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | undefined;
  if (!row) throw new OfferingStoreError("The provider delivery request was not returned.");
  return providerDeliverySchema.parse({
    id: row.id, businessId: row.business_workspace_id, installationId: row.installation_id,
    assignmentId: row.assignment_id, status: row.status, customerDecision: row.customer_decision,
    revision: row.revision, scope: row.scope, requestedBy: row.requested_by, requestedAt: row.requested_at,
    expiresAt: row.expires_at, acceptedBy: row.accepted_by ?? null, acceptedAt: row.accepted_at ?? null,
    revokedBy: row.revoked_by ?? null, revokedAt: row.revoked_at ?? null, revocationReason: row.revocation_reason ?? null,
    decidedBy: row.decided_by ?? null, decidedAt: row.decided_at ?? null, decisionNote: row.decision_note ?? null,
    history: row.history,
  });
}

async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await client().rpc(name, args);
  fail(error);
  return data;
}

export const postgresProviderDeliveries: ProviderDeliveryStore = {
  async list(actor, businessId) {
    const raw = await rpc("read_provider_deliveries", { ...identity(actor), p_business_id: businessId, p_delivery_id: null });
    return Array.isArray(raw) ? raw.map(map) : [];
  },
  async read(actor, deliveryId) {
    return map(await rpc("read_provider_delivery", { ...identity(actor), p_delivery_id: deliveryId }));
  },
  async request(actor, input) {
    return map(await rpc("request_provider_delivery", { ...identity(actor), p_business_id: input.businessId,
      p_installation_id: input.installationId, p_assignment_id: input.assignmentId,
      p_idempotency_key: input.idempotencyKey, p_command_digest: input.commandDigest }));
  },
  async accept(actor, deliveryId) {
    return map(await rpc("accept_provider_delivery", { ...identity(actor), p_delivery_id: deliveryId }));
  },
  async revoke(actor, deliveryId, expectedRevision, reason) {
    return map(await rpc("revoke_provider_delivery", { ...identity(actor), p_delivery_id: deliveryId,
      p_expected_revision: expectedRevision, p_reason: reason }));
  },
  async decide(actor, deliveryId, expectedRevision, decision, note) {
    return map(await rpc("decide_provider_delivery", { ...identity(actor), p_delivery_id: deliveryId,
      p_expected_revision: expectedRevision, p_decision: decision, p_note: note }));
  },
};
