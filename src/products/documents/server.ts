import { z } from "zod";
import { getSupabase } from "@/lib/db/client";
import { getWork, saveWork } from "@/platform/workspaces/repository";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { changeDocument, createDocument, documentCommandSchema, documentSchema } from "./engine";

export async function readWorkspaceDocument(actor: WorkspaceActor, workId: string) {
  const work = await getWork(actor, z.string().uuid().parse(workId));
  if (!work || work.productId !== "documents" || work.resourceKind !== "document") throw new WorkspaceAccessError();
  const document = documentSchema.safeParse(work.payload);
  if (!document.success) throw new WorkspaceStoreError("This document could not be read.");
  return { workId: work.id, workspaceId: work.workspaceId, document: document.data };
}

export async function saveWorkspaceDocument(actor: WorkspaceActor, workspaceId: string, input: unknown) {
  const document = createDocument(input, actor.userId);
  const work = await saveWork(actor, z.string().uuid().parse(workspaceId), { productId: "documents", resourceKind: "document", title: document.title, payload: document });
  return { workId: work.id, workspaceId: work.workspaceId, document: documentSchema.parse(work.payload) };
}

export async function editWorkspaceDocument(actor: WorkspaceActor, workId: string, raw: unknown) {
  const saved = await readWorkspaceDocument(actor, workId);
  const command = documentCommandSchema.parse(raw);
  const document = changeDocument(saved.document, command, actor.userId);
  const db = getSupabase();
  if (!db) throw new WorkspaceStoreError("Document storage is unavailable.");
  const rpc = db as unknown as { rpc(name: string, args: Record<string, unknown>): Promise<{ data: Array<{ payload: unknown }> | null; error: { message: string } | null }> };
  const { data, error } = await rpc.rpc("update_document_work", { p_work_id: saved.workId, p_workspace_id: saved.workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_expected_revision: command.expectedRevision, p_payload: document });
  if (error?.message.includes("workspace_access_denied")) throw new WorkspaceAccessError();
  if (error?.message.includes("document_revision_conflict")) throw new WorkspaceConflictError();
  if (error || !data?.[0]) throw new WorkspaceStoreError("The document change could not be confirmed.");
  return { ...saved, document: documentSchema.parse(data[0].payload) };
}
