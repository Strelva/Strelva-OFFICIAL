import { z } from "zod";
import { listMemberAgencies } from "@/platform/workspaces/agency-onboarding";
import { strelvaAgencyWorkspaceId } from "@/platform/workspaces/strelva-agency";
import { WorkspaceAccessError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { getRedis } from "@/platform/infra/redis";
import { getDeliveryLeadByToken, getDeliveryLeads, mirrorDeliveryLead } from "@/platform/infra/access-request-delivery";
import { getLeadWorkflow } from "@/platform/infra/lead-workflow";
import type { DeliveryLead } from "@/platform/infra/delivery-contracts";
import { leadCommandFingerprint, persistAgencyLeadCommand } from "@/platform/infra/agency-leads";
import { agencyAddClientReleaseEnabled } from "@/products/agency-clients";
import { resolveOwnerBrand } from "@/platform/agency-brand/server";

const uuid = z.string().uuid();
const tokenSchema = z.string().regex(/^[a-f0-9]{36}$/);
export class AgencyLeadError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) { super(message); this.name = "AgencyLeadError"; }
}

/** Configuration selects an ordinary agency; it never supplies membership. */
export async function leadAgency(actor: WorkspaceActor, agencyWorkspaceId: string) {
  if (!uuid.safeParse(agencyWorkspaceId).success || agencyWorkspaceId !== strelvaAgencyWorkspaceId()) throw new WorkspaceAccessError();
  const agency = (await listMemberAgencies(actor)).find(item => item.id === agencyWorkspaceId);
  if (!agency || !["owner", "admin"].includes(agency.role)) throw new WorkspaceAccessError();
  return agency;
}

function belongsToAgency(lead: DeliveryLead, id: string) {
  return (lead.agencyWorkspaceId == null || lead.agencyWorkspaceId === id)
    && (lead.requestType === undefined || lead.requestType === "agency_service");
}
export async function readAgencyLeads(actor: WorkspaceActor, agencyWorkspaceId: string) {
  const agency = await leadAgency(actor, agencyWorkspaceId);
  if (!getRedis()) throw new WorkspaceStoreError("Lead storage is unavailable.");
  const [candidates, brand] = await Promise.all([getDeliveryLeads(), resolveOwnerBrand(agency.id)]);
  const rows = await Promise.all(candidates.filter(lead => belongsToAgency(lead, agency.id)).map(async candidate => {
    const lead = await getDeliveryLeadByToken(candidate.statusToken);
    if (!lead || !belongsToAgency(lead, agency.id)) return null;
    return { lead, workflow: await getLeadWorkflow(lead.statusToken), legacyOwnership: lead.agencyWorkspaceId == null };
  }));
  return { agency: { ...agency, name: brand.agencyId === agency.id ? brand.name : "Agency identity unavailable" }, currentActorId: actor.userId,
    leads: rows.filter(row => row !== null), conversionAvailable: agencyAddClientReleaseEnabled() };
}
export async function readAgencyLead(actor: WorkspaceActor, agencyWorkspaceId: string, token: string) {
  const agency = await leadAgency(actor, agencyWorkspaceId);
  tokenSchema.parse(token);
  if (!getRedis()) throw new WorkspaceStoreError("Lead storage is unavailable.");
  const lead = await getDeliveryLeadByToken(token);
  if (!lead || !belongsToAgency(lead, agency.id)) throw new WorkspaceAccessError();
  return { lead, workflow: await getLeadWorkflow(token), legacyOwnership: lead.agencyWorkspaceId == null };
}

const commandBase = { agencyWorkspaceId: uuid, token: tokenSchema, idempotencyKey: uuid, expectedActorId: uuid };
export const agencyLeadCommandSchema = z.discriminatedUnion("action", [
  z.object({ ...commandBase, action: z.literal("status"), status: z.enum(["new", "contacted", "dismissed"]) }).strict(),
  z.object({ ...commandBase, action: z.literal("note"), note: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ ...commandBase, action: z.literal("convert") }).strict(),
]);

async function persist(actor: WorkspaceActor, agencyWorkspaceId: string, token: string, idempotencyKey: string,
  action: "status" | "note" | "convert" | "begin" | "complete", value: string, fingerprint: string) {
  const { lead } = await readAgencyLead(actor, agencyWorkspaceId, token);
  // SQL authority and Redis writes are separate transactions. Recheck immediately
  // before the atomic Redis command, and recheck ownership inside that command.
  await leadAgency(actor, agencyWorkspaceId);
  const result = await persistAgencyLeadCommand({ agencyWorkspaceId, actorId: actor.userId, token, email: lead.email, idempotencyKey, action, value, fingerprint });
  if ("error" in result) {
    if (result.error === "corrupt") throw new WorkspaceStoreError("The saved lead history could not be confirmed.");
    if (result.error === "access" || result.error === "missing") throw new WorkspaceAccessError();
    throw new AgencyLeadError(result.error === "conversion_locked" ? "This lead already has a client creation request. Resume its original request." : result.error === "converted" ? "This lead is already converted." : result.error === "notes_full" ? "This lead has reached its saved note limit." : "This request key already belongs to different terms.", 409, result.error);
  }
  if (result.lead?.statusToken !== token || result.workflow?.token !== token || result.idempotencyKey !== idempotencyKey) throw new WorkspaceStoreError("The lead command could not be confirmed.");
  // Mirror the current canonical status, never an older retry receipt. A failed
  // shadow read/write cannot undo a provider-accepted command.
  const current = await getDeliveryLeadByToken(token).catch(() => null);
  if (current) await mirrorDeliveryLead(current).catch(() => undefined);
  return result;
}

export async function commandAgencyLead(actor: WorkspaceActor, raw: unknown) {
  const input = agencyLeadCommandSchema.parse(raw);
  if (input.expectedActorId !== actor.userId) throw new WorkspaceAccessError();
  if (input.action === "convert" && !agencyAddClientReleaseEnabled()) throw new AgencyLeadError("Adding clients is not available yet. Nothing changed.", 503, "conversion_unavailable");
  const stages = { new: "received", contacted: "reviewing", dismissed: "paused" };
  const value = input.action === "note" ? input.note : input.action === "status" ? stages[input.status] : "";
  const result = await persist(actor, input.agencyWorkspaceId, input.token, input.idempotencyKey, input.action, value, leadCommandFingerprint(input));
  return { ...result, ...(input.action === "convert" ? { href: `/workspace/agency/clients/new?${new URLSearchParams({ workspaceId: input.agencyWorkspaceId, leadToken: input.token })}` } : {}) };
}

export async function beginAgencyLeadConversion(actor: WorkspaceActor, agencyWorkspaceId: string, token: string, idempotencyKey: string, clientInput: Record<string, unknown>) {
  uuid.parse(idempotencyKey);
  return persist(actor, agencyWorkspaceId, token, idempotencyKey, "begin", JSON.stringify(clientInput), leadCommandFingerprint(clientInput));
}
/** Only the ordinary add-client route calls this after a validated creation. */
export async function completeAgencyLeadConversion(actor: WorkspaceActor, agencyWorkspaceId: string, token: string, idempotencyKey: string, businessWorkspaceId: string) {
  uuid.parse(idempotencyKey); uuid.parse(businessWorkspaceId);
  return persist(actor, agencyWorkspaceId, token, idempotencyKey, "complete", businessWorkspaceId, leadCommandFingerprint({ token, businessWorkspaceId }));
}
