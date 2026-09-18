import { z } from "zod";
import { getSupabase } from "@/lib/db/client";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces";
import { workspaceExportSchema, type WorkspaceExportSnapshot } from "./contracts";

const workspaceIdSchema = z.string().uuid();

export async function exportWorkspace(actor: WorkspaceActor, workspaceId: string): Promise<WorkspaceExportSnapshot> {
  const id = workspaceIdSchema.parse(workspaceId);
  const db = getSupabase() as unknown as { rpc(name: string,args: Record<string,unknown>): Promise<{data:unknown;error:{message?:string}|null}> } | null;
  if (!db) throw new WorkspaceStoreError("Workspace export storage is unavailable");
  const { data, error } = await db.rpc("export_workspace_snapshot", { p_workspace_id: id, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail });
  if (error?.message?.includes("workspace_export_denied")) throw new WorkspaceAccessError();
  if (error?.message?.includes("workspace_export_too_large")) throw new WorkspaceConflictError("This workspace is too large for the current JSON export. No partial export was created.");
  if (error) throw new WorkspaceStoreError("Workspace export is unavailable");
  const parsed = workspaceExportSchema.safeParse(data);
  if (!parsed.success) throw new WorkspaceStoreError("Workspace export did not match its versioned schema");
  return parsed.data;
}
