import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { getWork, saveWork } from "@/platform/workspaces/repository";
import { WORKSPACE_EXIT_STOPPED_MESSAGE, WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { changeDocument, createDocument, documentCommandSchema, documentReceiptSchema, documentSchema, type DocumentHistoryPage } from "./engine";

/** Full-history retrieval is opt-in; existing document envelopes stay unchanged. */
export function documentHistoryEnabled(): boolean {
  return process.env.STRELVA_DOCUMENT_HISTORY_RELEASE === "1";
}

type LoadedWorkspaceDocument = {
  workId: string;
  workspaceId: string;
  document: z.infer<typeof documentSchema>;
  input: unknown;
};

async function loadWorkspaceDocument(actor: WorkspaceActor, workId: string): Promise<LoadedWorkspaceDocument> {
  const work = await getWork(actor, z.string().uuid().parse(workId));
  if (!work || work.productId !== "documents" || work.resourceKind !== "document") throw new WorkspaceAccessError();
  const document = documentSchema.safeParse(work.payload);
  if (!document.success) throw new WorkspaceStoreError("This document could not be read.");
  return { workId: work.id, workspaceId: work.workspaceId, document: document.data, input: work.input };
}

export async function readWorkspaceDocument(actor: WorkspaceActor, workId: string) {
  const { input: _input, ...saved } = await loadWorkspaceDocument(actor, workId);
  return saved;
}

/** Reuse the document's exact read grant, including shared and assigned work. */
export async function readWorkspaceDocumentHistory(actor: WorkspaceActor, workId: string, beforeRevision?: number): Promise<DocumentHistoryPage> {
  if (!documentHistoryEnabled()) throw new WorkspaceStoreError("Document history is not enabled.");
  const before = z.number().int().positive().max(2147483647).optional().parse(beforeRevision);
  const saved = await loadWorkspaceDocument(actor, workId);
  const db = getSupabase();
  if (!db) throw new WorkspaceStoreError("Document history is unavailable.");
  // Keyset pagination stays bounded even after thousands of edits. Bind both
  // identities, and pin this read to the revision just authorized by getWork.
  const { data, error } = await db.from("document_revisions").select("revision, receipt")
    .eq("work_id", saved.workId).eq("workspace_id", saved.workspaceId)
    .lt("revision", Math.min(before ?? saved.document.revision + 1, saved.document.revision + 1))
    .order("revision", { ascending: false }).limit(21);
  if (error || !data) throw new WorkspaceStoreError("Document history could not be read.");
  const rows = z.array(z.object({ revision: z.number().int().positive(), receipt: documentReceiptSchema })).max(21).safeParse(data);
  if (!rows.success || rows.data.some(row => row.revision !== row.receipt.revision)) {
    throw new WorkspaceStoreError("Document history could not be read.");
  }
  const receipts = rows.data.slice(0, 20).map(row => row.receipt);
  return {
    workId: saved.workId, workspaceId: saved.workspaceId, receipts,
    nextBeforeRevision: rows.data.length > 20 ? receipts.at(-1)!.revision : null,
  };
}

export async function saveWorkspaceDocument(actor: WorkspaceActor, workspaceId: string, input: unknown) {
  const document = createDocument(input, actor.userId);
  const work = await saveWork(actor, z.string().uuid().parse(workspaceId), { productId: "documents", resourceKind: "document", title: document.title, payload: document });
  return { workId: work.id, workspaceId: work.workspaceId, document: documentSchema.parse(work.payload) };
}

export async function editWorkspaceDocument(actor: WorkspaceActor, workId: string, raw: unknown) {
  const saved = await loadWorkspaceDocument(actor, workId);
  if (saved.input && typeof saved.input === "object" && !Array.isArray(saved.input)
    && (saved.input as Record<string, unknown>).source === "onboarding_upload") {
    throw new WorkspaceConflictError("Private onboarding attachments are immutable. Supply a replacement from the onboarding case.");
  }
  const command = documentCommandSchema.parse(raw);
  const document = changeDocument(saved.document, command, actor.userId);
  const db = getSupabase();
  if (!db) throw new WorkspaceStoreError("Document storage is unavailable.");
  const rpc = db as unknown as { rpc(name: string, args: Record<string, unknown>): Promise<{ data: Array<{ payload: unknown }> | null; error: { message: string } | null }> };
  const { data, error } = await rpc.rpc("update_document_work", { p_work_id: saved.workId, p_workspace_id: saved.workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_expected_revision: command.expectedRevision, p_payload: document });
  if (error?.message.includes("workspace_access_denied")) throw new WorkspaceAccessError();
  if (error?.message.includes("workspace_exit_future_work_blocked")) throw new WorkspaceConflictError(WORKSPACE_EXIT_STOPPED_MESSAGE);
  if (error?.message.includes("document_revision_conflict")) throw new WorkspaceConflictError();
  if (error || !data?.[0]) throw new WorkspaceStoreError("The document change could not be confirmed.");
  return { ...saved, document: documentSchema.parse(data[0].payload) };
}
