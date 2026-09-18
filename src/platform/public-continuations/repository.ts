import { getSupabase } from "@/lib/db/client";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces";

type ImportRow = {
  work_id: string;
  workspace_id: string;
  already_imported: boolean;
};

export async function importPublicContinuation(
  actor: WorkspaceActor,
  workspaceId: string,
  prepared: {
    continuationId: string;
    title: string;
    payload: unknown;
    input: unknown;
  },
): Promise<{ workId: string; workspaceId: string; alreadyImported: boolean }> {
  const db = getSupabase() as unknown as {
    rpc(name: string, args: Record<string, unknown>): Promise<{ data: ImportRow[] | null; error: { message?: string; code?: string } | null }>;
  } | null;
  if (!db) throw new WorkspaceStoreError("Workspace storage is not configured");
  const { data, error } = await db.rpc("import_public_continuation", {
    p_continuation_id: prepared.continuationId,
    p_user_id: actor.userId,
    p_verified_email: actor.verifiedEmail,
    p_workspace_id: workspaceId,
    p_title: prepared.title,
    p_payload: prepared.payload,
    p_input: prepared.input,
  });
  const detail = `${error?.code ?? ""} ${error?.message ?? ""}`;
  if (detail.includes("continuation_unavailable") || detail.includes("workspace_access_denied") || detail.includes("verified_identity_required")) {
    throw new WorkspaceAccessError();
  }
  if (detail.includes("continuation_destination_changed") || detail.includes("saved_work_limit_reached")) {
    throw new WorkspaceConflictError();
  }
  if (error || !data?.[0]) throw new WorkspaceStoreError("The public brief could not be imported");
  return { workId: data[0].work_id, workspaceId: data[0].workspace_id, alreadyImported: data[0].already_imported };
}

export async function readPublicContinuationImport(
  actor: WorkspaceActor,
  continuationId: string,
): Promise<{ workId: string; workspaceId: string } | null> {
  const db = getSupabase() as unknown as {
    rpc(name: string, args: Record<string, unknown>): Promise<{ data: Array<{ work_id: string; workspace_id: string }> | null; error: { message?: string; code?: string } | null }>;
  } | null;
  if (!db) throw new WorkspaceStoreError("Workspace storage is not configured");
  const { data, error } = await db.rpc("read_public_continuation_import", {
    p_continuation_id: continuationId,
    p_user_id: actor.userId,
    p_verified_email: actor.verifiedEmail,
  });
  const detail = `${error?.code ?? ""} ${error?.message ?? ""}`;
  if (detail.includes("continuation_unavailable") || detail.includes("workspace_access_denied") || detail.includes("verified_identity_required")) {
    throw new WorkspaceAccessError();
  }
  if (error) throw new WorkspaceStoreError("The imported public brief could not be read");
  return data?.[0] ? { workId: data[0].work_id, workspaceId: data[0].workspace_id } : null;
}
