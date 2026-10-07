import type { BusinessFactDraft, BusinessFactDraftStore } from "@/platform/ask/workspace-drafts";
import type { SourceAdapter } from "../adapters";
import type { ProposedItem } from "../contracts";
import { memberActor, proposeAsMember, revisionOf } from "./shared";

export function businessFactDraftRevision(draft: BusinessFactDraft): string {
  return revisionOf("business_record_draft", draft.workspaceId, draft.id, draft.expectedRevision, draft.patch);
}

export function businessFactDraftItem(draft: BusinessFactDraft): ProposedItem | null {
  if (draft.status !== "pending") return null;
  return {
    kind: "fact.inferred", route: "owner_decides", systemId: draft.systemId,
    title: draft.summary, detail: JSON.stringify(draft.patch),
    approveEffect: "Strelva saves this exact change to your business record. Website and Google publishing are separate decisions.",
    notYetEffect: "The draft is declined. Your business record stays as it is.",
    sourceLifecycle: "business_record_draft", sourceId: draft.id, revisionHash: businessFactDraftRevision(draft),
    urgent: false, adminMayDecide: true,
    openHref: `/workspace/business-drafts/${draft.id}?workspaceId=${encodeURIComponent(draft.workspaceId)}`,
  };
}

export function businessRecordDraftAdapter(store: BusinessFactDraftStore): SourceAdapter {
  return {
    lifecycle: "business_record_draft", needsMemberActor: true, ownerLinkWithoutAccount: true,
    propose: ctx => proposeAsMember(ctx, async actor => (await store.list(actor, ctx.workspaceId))
      .filter(row => row.workspaceId === ctx.workspaceId).flatMap(row => businessFactDraftItem(row) ?? [])),
    async currentRevision(ctx, sourceId) {
      if (!ctx.actor) throw new Error("draft_actor_required");
      const draft = (await store.list(ctx.actor, ctx.workspaceId)).find(row => row.id === sourceId && row.workspaceId === ctx.workspaceId);
      return draft?.status === "pending" ? businessFactDraftRevision(draft) : null;
    },
    async resolve(ctx, item, decision, by) {
      if (item.workspaceId !== ctx.workspaceId) return { outcome: "failed", reason: "workspace_mismatch" };
      if (by.kind === "expiry") return { outcome: "done", reason: "Expired, nothing changed" };
      const actor = memberActor(by);
      if (!actor) return { outcome: "failed", reason: "owner_not_member" };
      try {
        const draft = (await store.list(actor, ctx.workspaceId)).find(row => row.id === item.sourceId && row.workspaceId === ctx.workspaceId);
        if (!draft || draft.status !== "pending") return { outcome: "done", reason: "already_resolved" };
        if (businessFactDraftRevision(draft) !== item.revisionHash) return { outcome: "failed", reason: "source_changed" };
        const session = by.kind === "owner_link" ? by.serviceSession : undefined;
        if (session?.purpose === "owner_decision_link" && !store.resolveOwnerLink) return { outcome: "failed", reason: "signed_draft_writer_unavailable" };
        const saved = session?.purpose === "owner_decision_link"
          ? await store.resolveOwnerLink!(actor, ctx.workspaceId, draft.id, decision, session)
          : await store.resolve(actor, ctx.workspaceId, draft.id, decision);
        if (decision === "not_yet") return saved.status === "declined" ? { outcome: "done", reason: "Not yet" } : { outcome: "failed", reason: "draft_not_declined" };
        if (saved.status !== "approved" || !saved.receipt) return { outcome: "failed", reason: "draft_not_applied" };
        return { outcome: "done", receiptRef: `business_record:${ctx.workspaceId}:${saved.receipt.sequence}` };
      } catch { return { outcome: "failed", reason: "business_record_changed_or_unavailable" }; }
    },
  };
}
