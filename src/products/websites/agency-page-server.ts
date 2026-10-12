import { createHash } from "node:crypto";
import { getSupabase } from "@/platform/infra/db/client";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { websiteRebuildSchema } from "./rebuild-contracts";
import { siteDocumentCanonicalJson, siteDocumentHash, siteDocumentSchema, type SiteDocument } from "./site-document";
import { prepareSitePatch } from "./site-operations";
import { agencyPageChoicesSchema, agencyPageInputSchema, agencyPageReceiptSchema, type AgencyPageInput } from "./agency-page-contracts";

type Db = { rpc(name: string, input: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }> };
function database(): Db { const db = getSupabase(); if (!db) throw new WorkspaceStoreError("Agency page storage is unavailable."); return db as unknown as Db; }
async function call(db: Db, name: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(name, args);
  if (error) {
    if (/access_denied|agency_page_scope_required/.test(error.message ?? "")) throw new WorkspaceAccessError("Your agency needs current website and form or booking access for this business.");
    if (/conflict|stale|invalid|unavailable|blocked/.test(error.message ?? "")) throw new WorkspaceConflictError("This website or its connection changed. Refresh before preparing another page.");
    throw new WorkspaceStoreError("The page could not be confirmed. Retry the same request.");
  }
  return data;
}
function identity(actor: WorkspaceActor, agencyWorkspaceId: string, workspaceId: string) {
  return { p_agency_workspace_id: agencyWorkspaceId, p_workspace_id: workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail };
}
export async function readAgencyPageChoices(actor: WorkspaceActor, agencyWorkspaceId: string, workspaceId: string, db = database()) {
  return agencyPageChoicesSchema.parse(await call(db, "read_agency_native_page_choices", identity(actor, agencyWorkspaceId, workspaceId)));
}

export async function composeAgencyNativePage(document: SiteDocument, input: Pick<AgencyPageInput, "kind" | "path" | "title" | "description">) {
  if (!document.capabilities?.inquiry || input.kind === "booking" && !document.capabilities.booking) throw new WorkspaceConflictError("This website needs its own published form or booking connection first.");
  if (document.pages.some(page => page.path === input.path) || document.pages.length >= 12) throw new WorkspaceConflictError("Choose a new page address within the website's page limit.");
  const key = `agency_page_${createHash("sha256").update(input.path).digest("hex").slice(0, 12)}`;
  const heading = `${key}_heading`; const form = `${key}_form`;
  if ([key, heading, form].some(id => document.nodes[id])) throw new WorkspaceConflictError("This page already has a draft.");
  const prepared = await prepareSitePatch({ document, forceReview: true, ops: [
    { op: "add", path: `/nodes/${heading}`, value: { id: heading, type: "PageHeader", variant: "standard", props: { title: input.title, body: input.description }, children: [], factIds: [] } },
    { op: "add", path: `/nodes/${form}`, value: { id: form, type: input.kind === "form" ? "InquiryForm" : "Booking", variant: "inline", props: { title: input.title }, children: [], factIds: [] } },
    { op: "add", path: `/nodes/${key}`, value: { id: key, type: "Section", variant: "container", props: {}, children: [heading, form], factIds: [] } },
    { op: "add", path: "/pages/-", value: { path: input.path, title: input.title, description: input.description, root: key } },
  ] });
  if (prepared.governance.action === "block") throw new WorkspaceConflictError(prepared.governance.reason);
  for (const [id, fact] of Object.entries(prepared.document.facts)) if (!document.facts[id]) fact.verification = { supported: false, confidence: 0 };
  return siteDocumentSchema.parse(prepared.document);
}

/** Native candidate persistence, scope recheck and command receipt share one
 * transaction. A lost reply retries that command before consulting new state. */
export async function sendAgencyNativePage(actor: WorkspaceActor, agencyWorkspaceId: string, raw: unknown, db = database()) {
  const input = agencyPageInputSchema.parse(raw);
  const base = { ...identity(actor, agencyWorkspaceId, input.workspaceId), p_input: input };
  const existing = await call(db, "read_agency_native_page_command", base);
  if (existing) {
    const receipt = agencyPageReceiptSchema.parse(existing);
    if (receipt.workspaceId !== input.workspaceId || receipt.workId !== input.workId || receipt.commandId !== input.commandId || receipt.candidateRevision !== input.candidateRevision + 1) throw new WorkspaceStoreError("The page receipt could not be confirmed. Retry the same request.");
    return receipt;
  }
  const work = await call(db, "read_agency_native_page_work", { ...base, p_work_id: input.workId });
  const rebuild = websiteRebuildSchema.parse(work);
  const candidate = rebuild.candidate;
  if (!candidate || rebuild.status !== "published" || rebuild.revision !== input.expectedRevision || candidate.revision !== input.candidateRevision || candidate.contentHash !== input.candidateContentHash) throw new WorkspaceConflictError("Finish the current website draft or refresh its unchanged live release first.");
  const document = await composeAgencyNativePage(candidate.document, input);
  const contentHash = siteDocumentHash(document); const revision = candidate.revision + 1;
  const previewHref = `/api/websites/${input.workId}/preview?revision=${revision}&contentHash=${contentHash}`;
  const payload = websiteRebuildSchema.parse({ ...rebuild, revision: rebuild.revision + 1, status: "review_ready", approvedCandidateRevision: null, checkpoint: null, lastError: null, audit: null,
    candidate: { revision, contentHash, document, previewHref },
    history: [...rebuild.history, { revision: rebuild.revision + 1, kind: "agency_document_draft", actorId: actor.userId, at: new Date().toISOString() }],
  });
  const receipt = agencyPageReceiptSchema.parse(await call(db, "submit_agency_native_page", { ...base, p_document: document, p_payload: payload, p_content_hash: contentHash, p_canonical_document: siteDocumentCanonicalJson(document) }));
  if (receipt.workspaceId !== input.workspaceId || receipt.workId !== input.workId || receipt.commandId !== input.commandId || receipt.candidateRevision !== revision || receipt.contentHash !== contentHash) throw new WorkspaceStoreError("The page receipt could not be confirmed. Retry the same request.");
  return receipt;
}
