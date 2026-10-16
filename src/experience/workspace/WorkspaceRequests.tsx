"use client";

import type { WorkspaceWork } from "./contracts";
import type { HandledReceipt } from "@/platform/needs-you/contracts";
import { actorPresentation } from "@/platform/presentation/actor";
import type { NeedsYouState } from "./useNeedsYou";
import type { BusinessDeliveryItem, BusinessRequestStage } from "./business-delivery-summary";
import { RequestsView, type RequestsViewStatus } from "./today/OwnerRequests";
import { useAgencyClientHome } from "./useAgencyClientHome";
import { agencyClientDeliveries } from "./agency-client-home";
import { useBusinessDeliveries } from "./useBusinessDeliveries";

/** One row on the Requests page: a request to Strelva or an agency, or a finite job saved in the workspace. */
export interface BusinessRequestRow {
  id: string;
  title: string;
  stage: BusinessRequestStage;
  /** Who asked and who is doing it, in one line: "Maya at North Studio asked Oct 12 · North Studio is making it". */
  detail: string;
  href?: string;
  workId?: string;
  sortAt: string;
  agencyName?: string;
  /** Who is doing it: an agency (Strelva Agency included, by name) or Strelva itself running a saved job. */
  provider?: "agency" | "strelva-run";
  /** The System the request is about, for its clay tile. */
  systemId?: string | null;
  /** The request and delivery ids, so a decision about this request can be found. */
  requestId?: string;
  deliveryId?: string | null;
  /** XA · O5: the open decision this request waits on, and the receipt of the one it came from. */
  decisionId?: string;
  receipt?: HandledReceipt;
}

/** Finite responsibilities have an end, so they are requests; standing ones live in Running. */
export function finiteJobStage(status: string | undefined): BusinessRequestStage {
  if (status === "proposed" || status === "needs_attention") return "needs_you";
  if (status === "completed") return "done";
  if (status === "cancelled") return "closed";
  return "in_progress";
}

function shortDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Who is doing a request, by the serving agency's recorded name. Unrecorded
 * stays empty: never a stand-in like "your agency", and never one of the
 * viewer's own agencies (`_agencyNames` is kept for callers, not read).
 */
export function deliveryProviderName(item: BusinessDeliveryItem, _agencyNames: ReadonlyMap<string, string>): string {
  if (item.provider?.kind === "agency") return item.servingAgencyName?.trim() || "";
  return item.provider?.kind === "strelva" ? "Strelva Agency" : "";
}

/** "You asked Oct 9", "Maya at North Studio asked Oct 12", or nothing when the asker was not recorded. */
function askedLine(item: BusinessDeliveryItem, viewerName: string | null | undefined): string | null {
  if (!item.askedBy || !item.createdAt) return null;
  const mine = item.askedBy.kind === "person" && viewerName && item.askedBy.displayName.trim() === viewerName.trim();
  const who = mine ? "You" : actorPresentation(item.askedBy).name;
  return who ? `${who} asked ${shortDate(item.createdAt)}` : null;
}

/** Where a request stands, said as who is doing what. A status word appears only for exceptions (RequestsView). */
function doingLine(item: BusinessDeliveryItem, who: string): string {
  switch (item.stage) {
    case "asked": return who ? `${who} has not agreed scope and a deadline yet` : "Scope and a deadline are not agreed yet";
    case "in_progress": return [who ? `${who} is making it` : "Being made", item.dueAt ? `due ${shortDate(item.dueAt)}` : null].filter(Boolean).join(", ");
    case "ready_for_review": return who ? `${who} sent it for your review` : "Ready for your review";
    case "done": return who ? `${who} finished it ${shortDate(item.updatedAt)}` : `Finished ${shortDate(item.updatedAt)}`;
    default: return item.detail;
  }
}

export function businessRequestRows(deliveries: readonly BusinessDeliveryItem[], work: readonly WorkspaceWork[], providerName: (item: BusinessDeliveryItem) => string, options: { viewerName?: string | null } = {}): BusinessRequestRow[] {
  const fromDeliveries = deliveries.map(item => {
    const who = providerName(item);
    return {
      id: `delivery-${item.id}`,
      title: item.title,
      stage: item.stage,
      detail: [askedLine(item, options.viewerName), doingLine(item, who)].filter(Boolean).join(" · "),
      href: item.href,
      sortAt: item.updatedAt || "",
      agencyName: who || undefined,
      provider: item.provider?.kind === "agency" || item.provider?.kind === "strelva" ? "agency" as const : undefined,
      systemId: item.systemId ?? null,
      requestId: item.id,
      deliveryId: item.deliveryId ?? null,
    };
  });
  const fromJobs = work.filter(item => item.productId === "operations" && item.resourceKind === "responsibility").map(item => {
    const stage = finiteJobStage(item.operation?.status);
    return {
      id: `work-${item.id}`,
      title: item.title,
      stage,
      detail: stage === "needs_you" ? item.operation?.reason || "Needs your decision before it continues"
        : stage === "done" ? `Strelva finished it · started ${shortDate(item.createdAt)}` : stage === "closed" ? `Stopped · started ${shortDate(item.createdAt)}` : `Strelva runs it · started ${shortDate(item.createdAt)}`,
      workId: item.id,
      sortAt: item.createdAt,
      provider: "strelva-run" as const,
    };
  });
  return [...fromDeliveries, ...fromJobs].sort((a, b) => b.sortAt.localeCompare(a.sortAt));
}

/** A decision is about a request when its source is the request (scope, deadline) or the request's delivery. */
function aboutRequest(source: { lifecycle: string; id: string }, row: BusinessRequestRow): boolean {
  if (!row.requestId) return false;
  if (source.lifecycle === "service_request") return source.id.startsWith(`${row.requestId}:`);
  if (source.lifecycle === "provider_delivery") return Boolean(row.deliveryId) && source.id === row.deliveryId;
  return false;
}

/** Attach the open decision a request waits on and the receipt of the decision it came from. */
export function withDecisions(rows: readonly BusinessRequestRow[], decisions: NeedsYouState | undefined): BusinessRequestRow[] {
  if (decisions?.status !== "ready") return [...rows];
  return rows.map(row => {
    const open = decisions.items.find(item => aboutRequest({ lifecycle: item.sourceLifecycle, id: item.sourceId }, row));
    const receipt = decisions.handledAvailable ? decisions.handled.find(entry => entry.source && entry.store === "owner_decisions" && aboutRequest(entry.source, row)) : undefined;
    return { ...row, ...(open ? { decisionId: open.id } : {}), ...(receipt ? { receipt } : {}) };
  });
}

interface Props {
  businessName: string;
  /** Present only when this person may see the business's requests to Strelva or an agency. */
  deliveryScope?: string;
  work: readonly WorkspaceWork[];
  agencyNames: ReadonlyMap<string, string>;
  readOnly: boolean;
  agencySeat?: boolean;
  busy: boolean;
  onOpenWork: (id: string) => void;
  /** Ask for something new; with words, they go straight to the ask. */
  onAsk: (request?: string) => void;
  /** The business's decisions (useNeedsYou), so a request that waits can open its decision and a done one can be undone. */
  decisions?: NeedsYouState;
  pendingDecision?: string | null;
  onReview?: (decisionId: string) => void;
  onUndo?: (receipt: HandledReceipt) => void;
  systems?: readonly { id: string; kind: string }[];
  viewerName?: string | null;
}

/** Things someone asked for that have an end: asked, agreed, in progress, ready for review, done (XA · O5). */
export function WorkspaceRequests({ businessName, deliveryScope, work, agencyNames, agencySeat = false, readOnly, busy, onOpenWork, onAsk, decisions, pendingDecision, onReview, onUndo, systems, viewerName }: Props) {
  const ownerDeliveries = useBusinessDeliveries(agencySeat ? undefined : deliveryScope);
  const shared = useAgencyClientHome(agencySeat ? deliveryScope : undefined);
  const deliveries = agencySeat ? { state: shared.state.status === "ready" ? { status: "ready" as const, items: agencyClientDeliveries(shared.state.data) } : shared.state.status === "error" ? { status: "error" as const, message: "Shared Requests could not be checked." } : shared.state, refresh: shared.refresh } : ownerDeliveries;
  const items = deliveries.state.status === "ready" ? deliveries.state.items : [];
  const rows = withDecisions(businessRequestRows(items, work, item => deliveryProviderName(item, agencyNames), { viewerName }), agencySeat ? undefined : decisions);
  const state: RequestsViewStatus = busy || deliveries.state.status === "loading" ? { status: "loading" }
    : deliveries.state.status === "error" ? { status: "error", message: deliveries.state.message }
      : deliveries.state.status === "disabled" ? { status: "disabled" } : { status: "ready" };
  const canUndo = decisions?.status === "ready" && decisions.authority !== "agency" && decisions.canDecide !== false && decisions.role !== "member";
  return <RequestsView businessName={businessName} rows={rows} state={state} readOnly={readOnly} agencySeat={agencySeat} onRetry={deliveries.refresh} onAsk={onAsk} onOpenWork={onOpenWork}
    systems={systems} onReview={onReview} onUndo={canUndo ? onUndo : undefined} pendingDecision={pendingDecision} />;
}
