import { z } from "zod";
import { canonicalJson, sha256 } from "@/platform/business-record/tenant-import";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { connectionProviderSchema, credentialHolderSchema, type ConnectionProvider, type CredentialHolder } from "./contracts";
import { connectionActorArgs, connectionRpc, type ConnectionsDb } from "./db";

export type ConnectionHolders = { accountHolder: CredentialHolder; accessThrough: CredentialHolder };
export const UNKNOWN_CONNECTION_HOLDERS: ConnectionHolders = { accountHolder: { kind: "unknown" }, accessThrough: { kind: "unknown" } };
const holderRecord = z.object({ ref: z.string(), accountHolder: credentialHolderSchema, accessThrough: credentialHolderSchema }).strict();
export async function recordConnectionHolder(input: {
  ref: string; provider: ConnectionProvider; workspaceId: string; accountHolder: CredentialHolder;
  accessThrough: CredentialHolder; actor: WorkspaceActor; commandId: string;
}): Promise<void> {
  const body = z.object({ ref: z.string().min(3).max(200), provider: connectionProviderSchema, workspaceId: z.string().uuid(),
    accountHolder: credentialHolderSchema, accessThrough: credentialHolderSchema }).strict().parse({
      ref: input.ref, provider: input.provider, workspaceId: input.workspaceId, accountHolder: input.accountHolder, accessThrough: input.accessThrough,
    });
  await connectionRpc("record_connection_holder", { ...connectionActorArgs(input.actor), p_workspace_id: body.workspaceId,
    p_ref: body.ref, p_provider: body.provider, p_account_holder: body.accountHolder, p_access_through: body.accessThrough,
    p_command_id: z.string().uuid().parse(input.commandId), p_command_digest: sha256(canonicalJson(body)),
  }, z.null());
}
/** Trusted server read. Authorize the actor before calling this service-role-only RPC. Missing refs are unknown. */
export async function readConnectionHolders(workspaceId: string, db?: ConnectionsDb): Promise<Map<string, ConnectionHolders>> {
  const rows = await connectionRpc("read_connection_holders", { p_workspace_id: z.string().uuid().parse(workspaceId) }, z.array(holderRecord), db);
  return new Map(rows.map(({ ref, ...holders }) => [ref, holders]));
}
