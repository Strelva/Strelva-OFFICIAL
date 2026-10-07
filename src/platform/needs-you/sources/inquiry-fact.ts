import type { SourceAdapter } from "../adapters";
import { readInquiryFactProposals, inquiryFactRevision, confirmInquiryFact, type InquiryFactProposal } from "@/platform/infra/inquiry-fact-proposals";
import { itemTitle, proposeAsMember, unchangedOutcome, workspaceHref } from "./shared";

export interface InquiryFactPorts {
  list(workspaceId: string, actorId: string): Promise<InquiryFactProposal[]>;
  decide(workspaceId: string, proposalId: string, itemId: string, revision: string): Promise<unknown>;
  revision?(workspaceId: string, proposalId: string): Promise<string | null>;
}
const defaults: InquiryFactPorts = { list: readInquiryFactProposals,
  revision: inquiryFactRevision, decide: confirmInquiryFact };

/** The owner approves the exact suggestion. The SQL resolver checks the
 * recorded owner decision, including signed links without an account. */
export function inquiryFactAdapter(ports: InquiryFactPorts = defaults): SourceAdapter {
  return {
    lifecycle: "inquiry_fact", needsMemberActor: false,
    propose: ctx => proposeAsMember(ctx, async actor => (await ports.list(ctx.workspaceId, actor.userId)).map(fact => ({
      kind: "fact.inferred", route: "owner_decides", title: itemTitle(`Use this ${fact.key === "display_name" ? "business name" : "website address"}?`),
      detail: `${typeof fact.value === "string" ? fact.value : JSON.stringify(fact.value)} · Found at ${fact.provenance}`.slice(0, 1000),
      approveEffect: "Strelva saves this confirmed detail in your business record.", notYetEffect: "Your business details stay as they are.",
      sourceLifecycle: "inquiry_fact", sourceId: fact.id, revisionHash: fact.revisionHash, urgent: false, adminMayDecide: false,
      openHref: workspaceHref(ctx.workspaceId, { view: "profile" }),
    }))),
    async currentRevision(ctx, sourceId) {
      if (ports.revision) return ports.revision(ctx.workspaceId, sourceId);
      if (!ctx.actor) return null;
      return (await ports.list(ctx.workspaceId, ctx.actor.userId)).find(fact => fact.id === sourceId)?.revisionHash ?? null;
    },
    async resolve(ctx, item, decision, by) {
      const unchanged = unchangedOutcome(decision, by);
      if (unchanged) return unchanged;
      try {
        await ports.decide(ctx.workspaceId, item.sourceId, item.id, item.revisionHash);
        return { outcome: "done", receiptRef: `business_fact:${item.sourceId}` };
      } catch { return { outcome: "failed", reason: "The detail changed or the business record couldn't be saved." }; }
    },
  };
}
