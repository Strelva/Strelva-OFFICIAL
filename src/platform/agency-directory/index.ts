import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";

/**
 * Bring in an agency (ADR 0015). Agencies opt into a directory; a business's
 * owner proposes one with scopes at a level, and the agency accepts before
 * anything changes. SQL owns every authority check (20261023142000); this
 * module only shapes calls and results.
 */
export * from "./contract";
import { AGENCY_LEVELS, AGENCY_SCOPES, agencyConsentText, type AgencyProposal } from "./contract";

const uuid = z.string().uuid();
const directorySchema = z.array(z.object({ agencyWorkspaceId: uuid, name: z.string().min(1), summary: z.string() }).strict());
const businessAgenciesSchema = z.array(z.object({
  agencyWorkspaceId: uuid, name: z.string().min(1), seat: z.boolean(), ofRecord: z.boolean(),
  scopes: z.array(z.object({ scope: z.enum(AGENCY_SCOPES), level: z.enum(AGENCY_LEVELS), status: z.enum(["proposed", "active"]) }).strict()),
}).strict());
const proposalsSchema = z.array(z.object({
  proposalId: z.string().regex(/^[a-f0-9]{64}$/),
  businessWorkspaceId: uuid, businessName: z.string().min(1), consent: z.string(), proposedAt: z.string(),
  scopes: z.array(z.object({ scope: z.enum(AGENCY_SCOPES), level: z.enum(AGENCY_LEVELS) }).strict()),
}).strict());
export type DirectoryAgency = z.infer<typeof directorySchema>[number];
export type BusinessAgency = z.infer<typeof businessAgenciesSchema>[number];

export const bringInAgencyInputSchema = z.object({
  agencyWorkspaceId: uuid,
  scopes: z.array(z.object({ scope: z.enum(AGENCY_SCOPES), level: z.enum(AGENCY_LEVELS) }).strict()).min(1).max(AGENCY_SCOPES.length)
    .refine(items => new Set(items.map(item => item.scope)).size === items.length, "Choose each area once."),
}).strict();

type Rpc = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }> };
async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
  const db = getSupabase();
  if (!db) throw new WorkspaceStoreError("Agency access is unavailable right now. Nothing changed.");
  const { data, error } = await (db as unknown as Rpc).rpc(name, args);
  if (error) {
    const message = error.message || "";
    if (/agency_scope_taken/.test(message)) throw new WorkspaceConflictError("Another agency already has full control of one of those areas. Choose Prepare, or end their access first.");
    if (/agency_not_listed/.test(message)) throw new WorkspaceConflictError("That agency isn't listed. Choose one from the list.");
    if (/agency_proposal_not_found/.test(message)) throw new WorkspaceConflictError("There's nothing waiting from this business. It may have been withdrawn.");
    if (/agency_proposal_stale|agency_proposal_identity_required/.test(message)) throw new WorkspaceConflictError("This request changed. Refresh requests and review the current access before responding.");
    if (/agency_proposal_owner_required/.test(message)) throw new WorkspaceConflictError("The owner who requested this access no longer has authority. Ask the current owner to send a new request.");
    if (/agency_scopes_invalid|agency_consent_required|agency_directory_summary_invalid/.test(message)) throw new WorkspaceConflictError("Check the areas and try again. Nothing changed.");
    if (/workspace_exit_future_work_blocked/.test(message)) throw new WorkspaceConflictError("This business has left Strelva. Nothing changed.");
    if (/denied|owner_required|permission/.test(message)) throw new WorkspaceAccessError();
    throw new WorkspaceStoreError("Agency access couldn't be confirmed. Nothing changed.");
  }
  return data;
}
const who = (actor: WorkspaceActor) => ({ p_user_id: actor.userId, p_verified_email: actor.verifiedEmail.trim().toLowerCase() });
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new WorkspaceStoreError("Agency access returned an unconfirmed result. Nothing changed.");
  return parsed.data;
}

export async function readAgencyDirectory(actor: WorkspaceActor): Promise<DirectoryAgency[]> {
  return parse(directorySchema, await call("read_agency_directory", who(actor)));
}
export async function readBusinessAgencies(actor: WorkspaceActor, businessId: string): Promise<BusinessAgency[]> {
  return parse(businessAgenciesSchema, await call("read_business_agencies", { ...who(actor), p_business_id: uuid.parse(businessId) }));
}
export async function bringInAgency(actor: WorkspaceActor, businessId: string, raw: unknown): Promise<BusinessAgency[]> {
  const input = bringInAgencyInputSchema.parse(raw);
  const listed = (await readAgencyDirectory(actor)).find(agency => agency.agencyWorkspaceId === input.agencyWorkspaceId);
  const current = listed ? null : (await readBusinessAgencies(actor, businessId)).find(agency => agency.agencyWorkspaceId === input.agencyWorkspaceId);
  const name = listed?.name ?? current?.name;
  if (!name) throw new WorkspaceConflictError("That agency isn't listed. Choose one from the list.");
  return parse(businessAgenciesSchema, await call("bring_in_agency", { ...who(actor), p_business_id: uuid.parse(businessId),
    p_agency_id: input.agencyWorkspaceId, p_scopes: input.scopes, p_consent: agencyConsentText(name, input.scopes) }));
}
export async function endAgencyForBusiness(actor: WorkspaceActor, businessId: string, agencyId: string): Promise<BusinessAgency[]> {
  return parse(businessAgenciesSchema, await call("end_agency_for_business", { ...who(actor), p_business_id: uuid.parse(businessId), p_agency_id: uuid.parse(agencyId), p_reason: null }));
}
export async function readAgencyProposals(actor: WorkspaceActor, agencyId: string): Promise<AgencyProposal[]> {
  return parse(proposalsSchema, await call("read_agency_proposals", { ...who(actor), p_agency_id: uuid.parse(agencyId) }));
}
export async function respondToAgencyProposal(actor: WorkspaceActor, agencyId: string, businessId: string, accept: boolean, proposalId: string): Promise<"accepted" | "declined"> {
  const result = parse(z.object({ status: z.enum(["accepted", "declined"]) }).strict(), await call("respond_to_agency_proposal", {
    ...who(actor), p_agency_id: uuid.parse(agencyId), p_business_id: uuid.parse(businessId), p_accept: accept,
    p_proposal_id: z.string().regex(/^[a-f0-9]{64}$/).parse(proposalId) }));
  return result.status;
}
export async function setAgencyDirectoryListing(actor: WorkspaceActor, agencyId: string, raw: unknown): Promise<{ listed: boolean }> {
  const input = z.object({ listed: z.boolean(), summary: z.string().trim().min(1).max(280).nullable() }).strict().parse(raw);
  if (input.listed && !input.summary) throw new WorkspaceConflictError("Add one line about what your agency does.");
  const result = parse(z.object({ agencyWorkspaceId: uuid, listed: z.boolean() }).strict(), await call("set_agency_directory_listing", {
    ...who(actor), p_agency_id: uuid.parse(agencyId), p_summary: input.summary, p_listed: input.listed }));
  return { listed: result.listed };
}
