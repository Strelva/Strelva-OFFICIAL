/**
 * Website v2 documents (hosted rebuilds) as Needs you items.
 *
 * Each stage resolves through the rebuild service's own command:
 * - `fact.<id>`: one unresolved fact, confirmed against the exact preview.
 *   Owner-only, including by signed email link; nothing is published.
 * - `copy.<id>`: one flagged node's complete copy, after its linked facts
 *   are resolved. The exact node stays draft after confirmation.
 * - `approve`: a review-ready candidate with every flagged fact resolved.
 *   Approve runs `approve_website_document` through `approveWebsiteRebuild`.
 *   Admins may decide it unless it would be the site's first launch.
 * - `launch`: an approved candidate not yet published. Approve runs
 *   `launchWebsiteRebuild` (publish_website_document); launch is owner only
 *   in SQL (`website_document_assert_launch_owner`). A failed public
 *   read-back after publication is `done_unverified` and never retried.
 *
 * A candidate with unresolved facts proposes those facts first. Large node
 * props that cannot fit in one complete decision stay on the website screen;
 * a truncated preview never grants confirmation. Not yet and expiry change nothing.
 */
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { WebsiteRebuildRecord } from "@/products/websites/rebuild-contracts";
import { siteIdSchema, unresolvedSiteFacts } from "@/products/websites/site-document-schema";
import { OWNER_ONLY_KINDS, type ChangeKind, type ProposedItem } from "../contracts";
import type { SourceAdapter } from "../adapters";
import type { ServiceSession } from "../service-actor";
import { itemTitle, memberActor, proposeAsMember, revisionOf, splitSource, unchangedOutcome, workspaceHref } from "./shared";

export interface WebsiteSelection { expectedRevision: number; candidateRevision: number; candidateContentHash: string }

export interface WebsiteDocumentPorts {
  list(actor: WorkspaceActor, workspaceId: string): Promise<WebsiteRebuildRecord[]>;
  approve(actor: WorkspaceActor, workId: string, selection: WebsiteSelection): Promise<WebsiteRebuildRecord>;
  launch(actor: WorkspaceActor, workId: string, selection: WebsiteSelection): Promise<WebsiteRebuildRecord>;
  confirmFact?(actor: WorkspaceActor, workId: string, factId: string, selection: WebsiteSelection): Promise<WebsiteRebuildRecord>;
  confirmCopy?(actor: WorkspaceActor, workId: string, nodeId: string, selection: WebsiteSelection): Promise<WebsiteRebuildRecord>;
  launchByOwnerLink?(actor: WorkspaceActor, workId: string, selection: WebsiteSelection, session: ServiceSession): Promise<WebsiteRebuildRecord>;
}

type Stage = "approve" | "launch" | `fact.${string}` | `copy.${string}`;

export function websiteStage(record: WebsiteRebuildRecord): Stage | null {
  const { rebuild } = record;
  const candidate = rebuild.candidate;
  if (!candidate) return null;
  if (rebuild.status === "review_ready") {
    const flagged = unresolvedSiteFacts(candidate.document).length > 0
      || Object.values(candidate.document.nodes).some(node => node.verification?.needsReview);
    return flagged ? null : "approve";
  }
  if (rebuild.status === "approved" && rebuild.approvedCandidateRevision === candidate.revision) return "launch";
  return null;
}

function selection(record: WebsiteRebuildRecord): WebsiteSelection {
  const candidate = record.rebuild.candidate!;
  return { expectedRevision: record.rebuild.revision, candidateRevision: candidate.revision, candidateContentHash: candidate.contentHash };
}

function websiteRevision(record: WebsiteRebuildRecord, stage: Stage): string {
  const candidate = record.rebuild.candidate;
  return revisionOf("website_document", record.workId, stage, record.rebuild.revision, candidate?.revision ?? null, candidate?.contentHash ?? null);
}

export function websiteDocumentItem(record: WebsiteRebuildRecord): ProposedItem | null {
  const stage = websiteStage(record);
  if (!stage) return null;
  const firstLaunch = !record.rebuild.tenantId && !record.rebuild.launch.receipt;
  const kind: ChangeKind = firstLaunch ? "system.go_live" : "system.change_live";
  const name = record.rebuild.candidate!.document.siteName || record.rebuild.title;
  return {
    kind,
    route: "owner_decides",
    title: itemTitle(stage === "approve" ? `Approve the website preview: ${name}` : firstLaunch ? `Put ${name} live` : `Publish the approved changes to ${name}`),
    detail: null,
    approveEffect: stage === "approve"
      ? "Strelva records your approval of this exact preview. Nothing is published yet."
      : "Strelva publishes this exact approved preview and checks the public site.",
    notYetEffect: stage === "approve" ? "The preview stays a draft." : "Nothing goes live.",
    sourceLifecycle: "website_document",
    sourceId: `${record.workId}:${stage}`,
    revisionHash: websiteRevision(record, stage),
    urgent: false,
    // Launch is owner only in SQL; a first launch is owner only by policy.
    adminMayDecide: stage === "approve" && !OWNER_ONLY_KINDS.has(kind),
    openHref: workspaceHref(record.workspaceId, { view: "websites", work: record.workId }),
  };
}

/** One owner decision per exact fact; confirming one revises the whole preview. */
export function websiteDocumentFactItems(record: WebsiteRebuildRecord): ProposedItem[] {
  if (record.rebuild.status !== "review_ready" || !record.rebuild.candidate) return [];
  const document = record.rebuild.candidate.document;
  return unresolvedSiteFacts(document).map(factId => ({
    kind: "fact.inferred", route: "owner_decides", title: itemTitle(`Confirm this website fact: ${factId}`),
    detail: document.facts[factId]!.text,
    approveEffect: "Strelva marks this exact fact confirmed in the website preview. Nothing is published.",
    notYetEffect: "The fact stays unconfirmed. Nothing is published.",
    sourceLifecycle: "website_document", sourceId: `${record.workId}:fact.${factId}`,
    revisionHash: websiteRevision(record, `fact.${factId}`), urgent: false, adminMayDecide: false,
    openHref: workspaceHref(record.workspaceId, { view: "websites", work: record.workId }),
  }));
}

/** Show complete props in the decision; never approve copy hidden by truncation. */
export function websiteDocumentCopyItems(record: WebsiteRebuildRecord): ProposedItem[] {
  if (record.rebuild.status !== "review_ready" || !record.rebuild.candidate) return [];
  const document = record.rebuild.candidate.document;
  const unresolved = new Set(unresolvedSiteFacts(document));
  return Object.entries(document.nodes).flatMap(([nodeId, node]) => {
    if (!node.verification?.needsReview || node.factIds.some(factId => unresolved.has(factId))) return [];
    const detail = JSON.stringify(node.props);
    if (detail.length > 1000) return [];
    return [{
      kind: "fact.inferred" as const, route: "owner_decides" as const, title: itemTitle(`Confirm this website copy: ${nodeId}`), detail,
      approveEffect: "Strelva confirms this exact copy in the website preview. Nothing is published.",
      notYetEffect: "The copy stays unconfirmed. Nothing is published.",
      sourceLifecycle: "website_document" as const, sourceId: `${record.workId}:copy.${nodeId}`,
      revisionHash: websiteRevision(record, `copy.${nodeId}`), urgent: false, adminMayDecide: false,
      openHref: workspaceHref(record.workspaceId, { view: "websites", work: record.workId }),
    }];
  });
}

export function websiteDocumentAdapter(ports: WebsiteDocumentPorts): SourceAdapter {
  async function find(actor: WorkspaceActor, workspaceId: string, sourceId: string) {
    const source = splitSource(sourceId);
    if (!source) return null;
    const record = (await ports.list(actor, workspaceId)).find(row => row.workId === source.id && row.workspaceId === workspaceId);
    if (record && source.stage.startsWith("fact.") && ports.confirmFact) {
      const factId = source.stage.slice(5);
      if (siteIdSchema.safeParse(factId).success && websiteDocumentFactItems(record).some(item => item.sourceId === sourceId)) {
        return { record, stage: source.stage as Stage, factId };
      }
      return null;
    }
    if (record && source.stage.startsWith("copy.") && ports.confirmCopy) {
      const nodeId = source.stage.slice(5);
      if (siteIdSchema.safeParse(nodeId).success && websiteDocumentCopyItems(record).some(item => item.sourceId === sourceId)) {
        return { record, stage: source.stage as Stage, nodeId };
      }
      return null;
    }
    return record && websiteStage(record) === source.stage ? { record, stage: source.stage as Stage } : null;
  }
  return {
    lifecycle: "website_document",
    needsMemberActor: true,
    ownerLinkWithoutAccount: true,
    propose: (ctx) => proposeAsMember(ctx, async actor =>
      (await ports.list(actor, ctx.workspaceId)).filter(row => row.workspaceId === ctx.workspaceId)
        .flatMap(row => {
          const item = websiteDocumentItem(row);
          return [...(ports.confirmFact ? websiteDocumentFactItems(row) : []), ...(ports.confirmCopy ? websiteDocumentCopyItems(row) : []), ...(item ? [item] : [])];
        })),
    async currentRevision(ctx, sourceId) {
      if (!ctx.actor) return null;
      const found = await find(ctx.actor, ctx.workspaceId, sourceId);
      return found ? websiteRevision(found.record, found.stage) : null;
    },
    async resolve(ctx, item, decision, by) {
      const unchanged = unchangedOutcome(decision, by);
      if (unchanged) return unchanged;
      const actor = memberActor(by);
      if (!actor) return { outcome: "failed", reason: "owner_not_member" };
      try {
        const found = await find(actor, ctx.workspaceId, item.sourceId);
        if (!found) return { outcome: "done", reason: "already_resolved" };
        if (websiteRevision(found.record, found.stage) !== item.revisionHash) return { outcome: "failed", reason: "source_changed" };
        if (found.factId) {
          if (!ports.confirmFact) return { outcome: "failed", reason: "fact_confirmation_unavailable" };
          const saved = await ports.confirmFact(actor, found.record.workId, found.factId, selection(found.record));
          if (saved.workspaceId !== ctx.workspaceId || saved.workId !== found.record.workId
            || saved.rebuild.candidate?.document.facts[found.factId]?.origin !== "owner_confirmed") {
            return { outcome: "failed", reason: "fact_not_confirmed" };
          }
          return { outcome: "done", receiptRef: `website_document:${saved.workId}:fact:${found.factId}:${saved.rebuild.candidate.revision}` };
        }
        if (found.nodeId) {
          if (!ports.confirmCopy) return { outcome: "failed", reason: "copy_confirmation_unavailable" };
          const saved = await ports.confirmCopy(actor, found.record.workId, found.nodeId, selection(found.record));
          if (saved.workspaceId !== ctx.workspaceId || saved.workId !== found.record.workId
            || saved.rebuild.candidate?.document.nodes[found.nodeId]?.verification?.needsReview !== false) {
            return { outcome: "failed", reason: "copy_not_confirmed" };
          }
          return { outcome: "done", receiptRef: `website_document:${saved.workId}:copy:${found.nodeId}:${saved.rebuild.candidate.revision}` };
        }
        if (found.stage === "approve") {
          const saved = await ports.approve(actor, found.record.workId, selection(found.record));
          return { outcome: "done", receiptRef: `website_document:${saved.workId}:approved:${saved.rebuild.approvedCandidateRevision ?? ""}` };
        }
        const service = by.kind === "owner_link" ? by.service : null;
        const launched = service?.purpose === "owner_decision_link"
          ? await (async () => {
            if (!ports.launchByOwnerLink) throw new Error("owner_link_launch_unavailable");
            return ports.launchByOwnerLink(actor, found.record.workId, selection(found.record), service);
          })()
          : await ports.launch(actor, found.record.workId, selection(found.record));
        const receipt = launched.rebuild.launch.receipt;
        const receiptRef = receipt ? `website_document:${launched.workId}:${receipt.receiptId}` : `website_document:${launched.workId}`;
        if (launched.rebuild.status !== "published" || !receipt) return { outcome: "failed", reason: "not_published" };
        // Publication is accepted; a read-back that hasn't confirmed is recorded, never retried.
        return launched.rebuild.launch.readBack?.status === "verified"
          ? { outcome: "done", receiptRef }
          : { outcome: "done_unverified", reason: (launched.rebuild.launch.readBack?.message ?? "read_back_pending").slice(0, 500), receiptRef };
      } catch {
        return { outcome: "failed", reason: "resolver_failed" };
      }
    },
  };
}
