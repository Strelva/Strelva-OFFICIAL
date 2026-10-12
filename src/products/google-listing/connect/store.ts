import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { GOOGLE_FOUND_FACT_KEYS, type GoogleFoundFact } from "../found-facts";

/** Thin calls over 20261024400000. SQL owns every authority check. */
export type ConnectDb = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }> };
let override: ConnectDb | null | undefined;
export function setConnectDb(db: ConnectDb | null | undefined) { override = db; }
function db(): ConnectDb {
  const client = override !== undefined ? override : getSupabase() as unknown as ConnectDb | null;
  if (!client) throw new WorkspaceStoreError("Google details are unavailable right now. Nothing changed.");
  return client;
}
const who = (actor: WorkspaceActor) => ({ p_user_id: actor.userId, p_verified_email: actor.verifiedEmail.trim().toLowerCase() });
async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await db().rpc(name, args);
  if (error) {
    const message = error.message ?? "";
    if (/denied/.test(message)) throw new WorkspaceAccessError();
    if (/listing_not_connected/.test(message)) throw new WorkspaceConflictError("That Google listing isn't connected to this business.");
    if (/not_open/.test(message)) throw new WorkspaceConflictError("That found fact was already settled.");
    throw new WorkspaceStoreError("Google details couldn't be confirmed. Nothing changed.");
  }
  return data;
}

export const storedFoundFactSchema = z.object({
  id: z.string().uuid(), source: z.literal("google_listing"), sourceRef: z.string(), key: z.enum(GOOGLE_FOUND_FACT_KEYS), value: z.unknown(), foundAt: z.string(),
}).strict();
export type StoredFoundFact = z.infer<typeof storedFoundFactSchema>;
const list = z.array(storedFoundFactSchema);

export async function readFoundFacts(actor: WorkspaceActor, workspaceId: string): Promise<StoredFoundFact[]> {
  return list.parse(await call("read_google_found_facts", { ...who(actor), p_workspace_id: workspaceId }));
}
export async function recordGoogleFoundFacts(actor: WorkspaceActor, workspaceId: string, sourceRef: string, facts: GoogleFoundFact[]): Promise<StoredFoundFact[]> {
  return list.parse(await call("record_google_found_facts", { ...who(actor), p_workspace_id: workspaceId, p_source_ref: sourceRef, p_facts: facts.map(fact => ({ key: fact.key, value: fact.value })) }));
}
export async function settleFoundFact(actor: WorkspaceActor, workspaceId: string, factId: string, outcome: "confirmed" | "dismissed"): Promise<void> {
  z.object({ id: z.string().uuid(), status: z.enum(["confirmed", "dismissed"]) }).parse(await call("settle_google_found_fact", { ...who(actor), p_workspace_id: workspaceId, p_fact_id: factId, p_outcome: outcome }));
}

export const agencyLinkSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("first_connect"), agencyWorkspaceId: z.string().uuid() }),
  z.object({ kind: z.literal("connected"), agencyWorkspaceId: z.string().uuid() }),
  z.object({ kind: z.literal("owner_unknown"), agencyWorkspaceId: z.string().uuid() }),
  z.object({ kind: z.literal("reconnect"), agencyWorkspaceId: z.string().uuid(), target: z.unknown() }),
]);
export async function readAgencyGoogleConnectLink(actor: WorkspaceActor, businessId: string) {
  return agencyLinkSchema.parse(await call("agency_google_connect_link", { ...who(actor), p_business_id: businessId }));
}

export const readGrantSchema = z.object({
  status: z.enum(["connected", "revoked"]), googleEmail: z.string(), scopes: z.array(z.string()),
  gscProperty: z.string().nullable(), ga4Property: z.string().nullable(), updatedAt: z.string(),
  refreshTokenCiphertext: z.string().nullable().optional(), accessTokenCiphertext: z.string().nullable().optional(), tokenExpiresAt: z.string().nullable().optional(),
});
export type ReadGrant = z.infer<typeof readGrantSchema>;
export async function googleReadGrant(actor: WorkspaceActor, workspaceId: string, action: "read" | "secrets" | "save" | "select" | "token", input: Record<string, unknown> = {}): Promise<ReadGrant | null> {
  return readGrantSchema.nullable().parse(await call("google_read_grant", { ...who(actor), p_workspace_id: workspaceId, p_action: action, p_input: input }));
}
export async function revokeGoogleReadGrant(actor: WorkspaceActor, workspaceId: string): Promise<string | null> {
  const result = z.object({ status: z.literal("revoked"), revocationTokenCiphertext: z.string().nullable() }).nullable()
    .parse(await call("google_read_grant", { ...who(actor), p_workspace_id: workspaceId, p_action: "revoke", p_input: {} }));
  return result?.revocationTokenCiphertext ?? null;
}
