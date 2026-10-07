import { readWorkspaceInquiryLeads, prepareInquiryMessageReviewWithDependencies, inquiryReleaseEnabledForWorkspace } from "@/products/inquiries/server";
import { readWorkspaceBookings } from "@/products/bookings/server";
import { PostgresBusinessFactDraftStore } from "@/platform/ask/workspace-drafts-repository";
import { readBusinessRecord } from "@/platform/business-record/service";
import type { NeedsYouStore } from "@/platform/needs-you/repository";
import { needsYouReleaseEnabled } from "@/platform/needs-you/release";
import { releaseViewerFor } from "@/platform/release-flags/viewer";
import { businessFactDraftPatch, type AskWorkspaceDraftPort, type BusinessFactDraftStore } from "@/platform/ask/workspace-drafts";

/** No provider sends. Fact drafts sync only when the decision surface is released. */
export function createAskWorkspaceDraftPort(deps: {
  store?: BusinessFactDraftStore;
  sync(actor: import("@/platform/workspaces/types").WorkspaceActor, workspaceId: string): Promise<unknown>;
  needsYouStore: NeedsYouStore;
}): AskWorkspaceDraftPort {
  const store = deps.store ?? PostgresBusinessFactDraftStore;
  return {
    readBusiness: readBusinessRecord,
    async readInquiries(actor, workspaceId) {
      if (!await inquiryReleaseEnabledForWorkspace(workspaceId, await releaseViewerFor(actor))) throw new Error("inquiry_not_released");
      return readWorkspaceInquiryLeads(actor, workspaceId, { limit: 30 });
    },
    readBookings: (actor, workspaceId) => readWorkspaceBookings(actor, workspaceId, { view: "week" }),
    async businessFact(actor, input) {
      if (!needsYouReleaseEnabled()) throw new Error("needs_you_not_released");
      const patch = businessFactDraftPatch(input.patch);
      const saved = await store.save(actor, { ...input, systemId: null, patch });
      // A failed sync leaves the durable draft pending. It never changes the record.
      try {
        await deps.sync(actor, input.workspaceId);
        const items = await deps.needsYouStore.list(actor, input.workspaceId, false);
        const item = items.find(row => row.sourceLifecycle === "business_record_draft" && row.sourceId === saved.id && row.state === "open");
        if (!item) throw new Error("draft_decision_not_opened");
        return { draftId: saved.id, routing: { route: item.route, itemRef: item.id, decideAt: `/workspace?workspaceId=${encodeURIComponent(input.workspaceId)}` } };
      } catch {
        return { draftId: saved.id, decisionSyncPending: true, routing: { route: "owner_decides", itemRef: null, decideAt: `/workspace?workspaceId=${encodeURIComponent(input.workspaceId)}` } };
      }
    },
    async inquiryReply(actor, input) {
      if (!needsYouReleaseEnabled() || !await inquiryReleaseEnabledForWorkspace(input.workspaceId, await releaseViewerFor(actor))) throw new Error("inquiry_not_released");
      const preview = await prepareInquiryMessageReviewWithDependencies({
        tenantId: input.tenantId, businessId: input.workspaceId, inquiryId: input.inquiryId,
        action: "reply", actorId: actor.userId, authoredReply: input.replyText,
      }, {
        authorizeDraft: async (actorId, businessId) => {
          if (actorId !== actor.userId || businessId !== input.workspaceId) return false;
          const record = await readBusinessRecord(actor, businessId);
          return ["owner", "admin", "member"].includes(record.access);
        },
      });
      if (preview.eventId) return { eventIds: [preview.eventId] };
      throw new Error("inquiry_draft_receipt_missing");
    },
  };
}
