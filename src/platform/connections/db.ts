import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";

export type ConnectionsDb = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }> };
let override: ConnectionsDb | null = null;
export function setConnectionsDb(db: ConnectionsDb | null): void { override = db; }
export function connectionsDb(): ConnectionsDb {
  const db = override ?? getSupabase();
  if (!db) throw new WorkspaceStoreError("Connections are unavailable.");
  return db as unknown as ConnectionsDb;
}
export function connectionActorArgs(actor: WorkspaceActor) {
  return { p_user_id: z.string().uuid().parse(actor.userId), p_verified_email: z.string().email().parse(actor.verifiedEmail.trim().toLowerCase()) };
}
export async function connectionRpc<T>(name: string, args: Record<string, unknown>, schema: z.ZodType<T>, db?: ConnectionsDb): Promise<T> {
  const { data, error } = await (db ?? connectionsDb()).rpc(name, args);
  if (error) {
    if (error.message?.includes("connection_access_denied")) throw new WorkspaceAccessError();
    if (error.message?.includes("connection_command_conflict")) throw new WorkspaceConflictError("That connection command was already used for different account details.");
    throw new WorkspaceStoreError("Connections could not be loaded or recorded.");
  }
  const result = schema.safeParse(data);
  if (!result.success) throw new WorkspaceStoreError("The Connections response was malformed.");
  return result.data;
}
