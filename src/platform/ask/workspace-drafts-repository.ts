import { z } from "zod";
import { actorArgs, callBusinessRecord } from "@/platform/business-record/repository";
import { businessFactDraftPatch, businessFactDraftSchema, type BusinessFactDraftStore } from "./workspace-drafts";

export const PostgresBusinessFactDraftStore: BusinessFactDraftStore = {
  save: (actor, input) => callBusinessRecord("save_ask_business_draft", {
    ...actorArgs(actor), p_workspace_id: input.workspaceId, p_system_id: null,
    p_expected_revision: input.expectedRevision, p_patch: businessFactDraftPatch(input.patch),
    p_asked_on_behalf: input.askedOnBehalf ?? null, p_summary: input.summary, p_idempotency_key: input.idempotencyKey,
  }, businessFactDraftSchema, "The business change draft could not be saved."),
  list: (actor, workspaceId) => callBusinessRecord("list_ask_business_drafts", { ...actorArgs(actor), p_workspace_id: workspaceId }, z.array(businessFactDraftSchema), "Business change drafts could not be read."),
  resolveOwnerLink: (actor, workspaceId, draftId, decision, session) => callBusinessRecord("resolve_ask_business_draft_by_owner_link", {
    ...actorArgs(actor), p_workspace_id: workspaceId, p_draft_id: draftId, p_decision: decision,
    p_session_id: session.sessionId, p_decision_id: session.decisionId,
    p_revision_hash: session.revisionHash, p_recipient: session.recipient,
  }, businessFactDraftSchema, "The signed business change could not be confirmed."),
  resolve: (actor, workspaceId, draftId, decision) => callBusinessRecord("resolve_ask_business_draft", {
    ...actorArgs(actor), p_workspace_id: workspaceId, p_draft_id: draftId, p_decision: decision,
  }, businessFactDraftSchema, "The business change could not be confirmed."),
};

