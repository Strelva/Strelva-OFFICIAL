import { actorLabel, type RecordedActor } from "@/platform/presentation/actor";

/**
 * The website System page's own lists (website System spec 2026-10-06,
 * behaviors 3, 4, 5 and 10): domains with their verification state, what is
 * waiting on the owner, open Requests, and one History across the four
 * release stores. Browser-safe types and a pure merge; the server loader is
 * website-detail-server.ts. Nothing here is stored: every row is read from
 * the store that already owns it.
 */

export type WebsiteDomainState = "verified" | "pending" | "misconfigured" | "conflict" | "error" | "not_claimed";

export interface WebsiteDomainItem {
  hostname: string;
  state: WebsiteDomainState;
  /** Plain words, e.g. "Waiting on DNS". */
  label: string;
  lastCheckedAt: string | null;
  /** Who can change it. */
  whoCanChange: string;
}

export type WebsiteWaitingKind = "decision" | "content_draft" | "site_review";

export interface WebsiteWaitingItem {
  id: string;
  kind: WebsiteWaitingKind;
  title: string;
  detail: string | null;
  at: string | null;
  href: string | null;
}

export interface WebsiteRequestItem {
  id: string;
  title: string;
  /** Asked, In progress, Ready for your review, Done, Declined. */
  stage: "asked" | "in_progress" | "ready_for_review" | "done" | "declined";
  at: string;
  href: string | null;
}

export type WebsiteHistorySource = "content" | "snapshot" | "document" | "deploy" | "system";

export interface WebsiteHistoryItem {
  id: string;
  source: WebsiteHistorySource;
  at: string;
  /** Compatibility display text, derived only from the recorded actor. */
  actor?: RecordedActor | null;
  by: string;
  title: string;
  /** Where undo exists, in words; null when it does not (stated, not faked). */
  undo: string | null;
  restore?: { section: string; versionId: string } | { kind: "snapshot"; snapshotId: string } | { kind: "document"; workId: string; targetRevision: number; targetContentHash: string };
  restoreHref?: string;
  /** Evidence retained by a deploy receipt, including unsuccessful read-back. */
  deployment?: { commitSha: string; url: string; readBack: "confirmed" | "not_confirmed" | "not_checked" };
}

/** A connected site's own block: proof of the host, install lines, reporting and inquiries. */
export interface ConnectedSiteDetail {
  siteId: string;
  siteHost: string;
  verified: boolean;
  /** The lines to paste, for managers until the host is proven. */
  install: { script: string; meta: string | null } | null;
  lastEventAt: string | null;
  /** Last 30 days, by kind (visit, call_click, ...). */
  activity: Record<string, number>;
  inquiries: Array<{ id: string; name: string; email: string | null; message: string | null; capturedAt: string }>;
  /** Keep your site only (flag on for this business): install health, what it is built with, and the changes section. */
  health?: { state: string; label: string; detail: string; tone: "live" | "need" | "draft" | "down" };
  platform?: { value: string; label: string; detected: boolean };
  keepYourSite?: boolean;
}

export interface WebsiteSystemDetail {
  systemId: string;
  connectedSite?: ConnectedSiteDetail;
  domains: WebsiteDomainItem[];
  waiting: WebsiteWaitingItem[];
  requests: WebsiteRequestItem[];
  history: WebsiteHistoryItem[];
  /** Sources that could not be read just now. Nothing about them is claimed. */
  unavailable: string[];
}

export interface ContentVersionRow { actor?: RecordedActor | null; id: string; section: string; author: "user" | "ai" | "admin"; timestamp: string; status: string; changes?: Array<{ field: string }>; requestId?: string }
export interface SnapshotRow { actor?: RecordedActor | null; id: string; label: string; reason: string; author: string; createdAt: string; status: string; restoredAt?: string }
export interface DocumentRevisionRow { actor?: RecordedActor | null; revision: number; contentHash: string; createdAt: string; createdBy: string; published: boolean }
export interface ChangeRequestRow { actor?: RecordedActor | null; requestId: string; title: string; kind: "custom_request" | "content_update"; status: string; createdAt: string; resolvedAt?: string; section?: string }
export interface DecisionRow { id: string; title: string; detail: string | null; openedAt: string; openHref: string | null }
export interface LinkedPublicationRow { actor?: RecordedActor | null; revision: number; tenantSlugAtPublication: string; publishedAt: string; fallbackUntil: string; priorDeliveryModel: string }
export interface ServiceRequestRow { id: string; outcome: string; createdAt: string; status: string; commitment: string | null }
export interface RepoDeploymentRow { actor?: RecordedActor | null; id: string; requestId: string; title: string; commitSha: string; deploymentUrl: string; readBack: "confirmed" | "not_confirmed" | "not_checked"; recordedAt: string }

export interface WebsiteDetailInputs {
  systemId: string;
  actorId: string;
  workspaceId?: string;
  workId?: string | null;
  domains: WebsiteDomainItem[];
  decisions: DecisionRow[];
  /** Sections with a saved draft that has not been published. */
  draftSections: string[];
  /** A hosted candidate waiting for the owner's approval, when there is one. */
  siteReview: { workId: string; revision: number; at: string | null; href: string } | null;
  changeRequests: ChangeRequestRow[];
  serviceRequests: ServiceRequestRow[];
  contentVersions: ContentVersionRow[];
  snapshots: SnapshotRow[];
  documentRevisions: DocumentRevisionRow[];
  linkedPublications: LinkedPublicationRow[];
  repoDeployments?: RepoDeploymentRow[];
  connectedSite?: ConnectedSiteDetail;
  unavailable: string[];
}

const SECTION_WORDS: Record<string, string> = { hero: "homepage banner", settings: "site settings", theme: "look and colors", faq: "questions and answers" };
const sectionWords = (section: string) => SECTION_WORDS[section] ?? section.replace(/[_-]+/g, " ");

function requestStage(status: string): WebsiteRequestItem["stage"] {
  if (status === "shipped") return "done";
  if (status === "declined") return "declined";
  if (status === "accepted" || status === "in_progress") return "in_progress";
  if (status === "quoted") return "ready_for_review";
  return "asked";
}

function serviceStage(row: ServiceRequestRow): WebsiteRequestItem["stage"] {
  // service_requests.status is draft | requested | withdrawn; the delivery
  // commitment carries the rest (proposed, running, submitted,
  // changes_requested, accepted, cancelled).
  if (row.status === "withdrawn" || row.commitment === "cancelled") return "declined";
  if (row.commitment === "accepted") return "done";
  if (row.commitment === "submitted") return "ready_for_review";
  if (row.commitment === "running" || row.commitment === "changes_requested") return "in_progress";
  return "asked";
}

const newestFirst = <T extends { at: string }>(items: T[]) => items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

export function buildWebsiteSystemDetail(input: WebsiteDetailInputs): WebsiteSystemDetail {
  const latestDocumentRevision = Math.max(0, ...input.documentRevisions.map(item => item.revision));
  // Waiting on you: the owner's open decisions for this site, then drafts no
  // decision already covers, then a hosted candidate awaiting approval.
  const covered = new Set(input.changeRequests.filter(row => row.kind === "content_update" && row.status === "review" && row.section).map(row => row.section!));
  const waiting: WebsiteWaitingItem[] = [
    ...input.decisions.map(row => ({ id: `decision:${row.id}`, kind: "decision" as const, title: row.title, detail: row.detail, at: row.openedAt, href: row.openHref })),
    ...input.draftSections.filter(section => !covered.has(section)).map(section => ({ id: `draft:${section}`, kind: "content_draft" as const, title: `A change to the ${sectionWords(section)} is ready for review`, detail: "It goes live only after it is approved.", at: null, href: null })),
    ...(input.siteReview ? [{ id: `site:${input.siteReview.workId}:${input.siteReview.revision}`, kind: "site_review" as const, title: "A new version of the site is ready for your review", detail: `Revision ${input.siteReview.revision}. Nothing changes until you approve it.`, at: input.siteReview.at, href: input.siteReview.href }] : []),
  ];

  const requests = newestFirst([
    ...input.changeRequests.filter(row => row.kind === "custom_request").map(row => ({ id: `change:${row.requestId}`, title: row.title, stage: requestStage(row.status), at: row.createdAt, href: null })),
    ...input.serviceRequests.map(row => ({ id: `service:${row.id}`, title: row.outcome, stage: serviceStage(row), at: row.createdAt, href: `/workspace/delivery/${row.id}` })),
  ]).filter(row => row.stage !== "done" && row.stage !== "declined");

  const history = newestFirst<WebsiteHistoryItem>([
    ...input.contentVersions.map(row => {
      const restore = row.changes?.some(change => change.field === "_restore");
      return { id: `content:${row.id}`, source: "content" as const, at: row.timestamp, actor: row.actor, by: actorLabel(row.actor),
        title: restore ? `Restored an earlier ${sectionWords(row.section)}` : `Updated the ${sectionWords(row.section)}`,
        undo: "Restore this saved content as a draft for review.", restore: { section: row.section, versionId: row.id } };
    }),
    ...input.snapshots.map(row => ({ id: `snapshot:${row.id}`, source: "snapshot" as const, at: row.createdAt, actor: row.actor, by: actorLabel(row.actor),
      title: row.status === "restored" ? `${row.label} (restored)` : row.label, undo: row.status === "available" ? "Prepare this exact saved copy for review before restoring it." : null,
      ...(row.status === "available" && input.workspaceId ? { restore: { kind: "snapshot" as const, snapshotId: row.id } } : {}) })),
    ...input.documentRevisions.map(row => ({ id: `document:${row.revision}:${row.contentHash.slice(0, 12)}`, source: "document" as const, at: row.createdAt,
      actor: row.actor, by: actorLabel(row.actor),
      title: row.published ? `Published site revision ${row.revision}` : `Saved site revision ${row.revision}`,
      undo: row.revision < latestDocumentRevision ? "Save this earlier revision as a new candidate; you approve it before it goes live." : null,
      ...(input.workspaceId && input.workId && row.revision < latestDocumentRevision ? { restore: { kind: "document" as const, workId: input.workId, targetRevision: row.revision, targetContentHash: row.contentHash } } : {}) })),
    ...input.linkedPublications.map(row => ({ id: `cutover:${row.revision}:${row.publishedAt}`, source: "document" as const, at: row.publishedAt, actor: row.actor, by: actorLabel(row.actor),
      title: `Replaced the site at ${row.tenantSlugAtPublication} with revision ${row.revision}`,
      undo: Date.parse(row.fallbackUntil) > Date.now() ? `The old site is kept until ${row.fallbackUntil.slice(0, 10)}; an authorized publisher can switch back until then.` : null })),
    ...input.changeRequests.filter(row => row.kind === "custom_request" && row.status === "shipped").map(row => ({ id: `deploy:${row.requestId}`, source: "deploy" as const, at: row.resolvedAt ?? row.createdAt, actor: row.actor, by: actorLabel(row.actor),
      title: row.title, undo: "An authorized publisher can redeploy the previous version." })),
    ...(input.repoDeployments ?? []).map(row => ({ id: `deploy-receipt:${row.id}`, source: "deploy" as const, at: row.recordedAt, actor: row.actor, by: actorLabel(row.actor),
      title: row.readBack === "confirmed" ? `${row.title} · live and checked` : `${row.title} · deployed, not yet confirmed`,
      undo: "Prepare a redeploy of the previous commit for approval.",
      deployment: { commitSha: row.commitSha, url: row.deploymentUrl, readBack: row.readBack } })),
  ]).slice(0, 50);

  if (input.connectedSite && !input.connectedSite.verified) {
    waiting.unshift({ id: `connect:${input.connectedSite.siteId}`, kind: "decision", title: `Prove ${input.connectedSite.siteHost} is yours`, detail: "Add the two lines shown under Connected site, publish your site, then check. Nothing is collected until then.", at: null, href: null });
  }
  if (input.connectedSite?.health?.state === "stopped") {
    waiting.unshift({ id: `health:${input.connectedSite.siteId}`, kind: "decision", title: `${input.connectedSite.siteHost} stopped reporting`, detail: input.connectedSite.health.detail, at: null, href: null });
  }
  return { systemId: input.systemId, ...(input.connectedSite ? { connectedSite: input.connectedSite } : {}), domains: input.domains, waiting, requests, history, unavailable: [...new Set(input.unavailable)] };
}

/** Native rows already describe their mirrored System revision. Handled
 * receipts and revisions without a native row join that same History. */
export function mergeWebsiteHistory(native: WebsiteHistoryItem[], system: Array<{ id: string; sentence: string; at: string; releaseRef?: string; implementationKind?: string; actor?: RecordedActor | null }>): WebsiteHistoryItem[] {
  const extra = system.filter(row => !native.some(item => {
    if (item.title === row.sentence && item.at === row.at) return true;
    if (!row.releaseRef) return false;
    if (item.source === "content") return row.releaseRef.endsWith(`@${item.id.slice("content:".length)}`);
    if (item.source === "document" && row.implementationKind === "website_document") return row.releaseRef.endsWith(`@${item.id.split(":")[1]}`);
    if (item.id.startsWith("deploy-receipt:")) return row.releaseRef.startsWith(`deploy:${item.id.slice("deploy-receipt:".length)}@`);
    return false;
  })).map(row => ({ id: row.id, source: "system" as const, at: row.at, actor: row.actor, by: actorLabel(row.actor), title: row.sentence, undo: null }));
  return newestFirst([...native, ...extra]);
}

/** Domain ownership and routing observations keep their own freshness and
 * authority. Listing a Connection never authorizes a DNS or provider write. */
export function websiteDomainConnections(detail: WebsiteSystemDetail): import("./model").SystemConnection[] {
  return detail.domains.map(domain => ({
    id: `${detail.systemId}:domain:${domain.hostname}`, kind: "appear", target: domain.hostname,
    sentence: `The website appears at ${domain.hostname}. ${domain.label}.`,
    status: domain.state === "verified" ? "connected" : domain.state === "pending" || domain.state === "not_claimed" ? "unknown" : "not_connected",
    contract: {
      sourceOfTruth: domain.label.includes("business's") || domain.label.includes("proof") ? "Connected site ownership proof; this does not verify hosted routing." : "Domain claims and the hosting provider's routing checks.",
      authority: `Strelva may check this address. Changes are owner-decided. ${domain.whoCanChange}`,
      freshness: domain.lastCheckedAt ? `Last checked ${domain.lastCheckedAt}.` : "No completed domain check is recorded.",
      failureBehavior: "A routing problem changes domain health, not the website's lifecycle. DNS changes require the owner's decision and exact records.",
    },
  }));
}
