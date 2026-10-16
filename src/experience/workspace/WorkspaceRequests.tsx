"use client";

import type { WorkspaceWork } from "./contracts";
import { REQUEST_STAGE_LABELS, type BusinessDeliveryItem, type BusinessRequestStage } from "./business-delivery-summary";
import { RequestsView, type RequestsViewStatus } from "./today/OwnerRequests";
import { useAgencyClientHome } from "./useAgencyClientHome";
import { agencyClientDeliveries } from "./agency-client-home";
import { useBusinessDeliveries } from "./useBusinessDeliveries";

/** One row on the Requests page: a request to Strelva or an agency, or a finite job saved in the workspace. */
export interface BusinessRequestRow {
  id: string;
  title: string;
  stage: BusinessRequestStage;
  detail: string;
  href?: string;
  workId?: string;
  sortAt: string;
  agencyName?: string;
  /** Who is doing it: an agency (Strelva Agency included, by name) or Strelva itself running a saved job. */
  provider?: "agency" | "strelva-run";
}

/** Finite responsibilities have an end, so they are requests; standing ones live in Running. */
export function finiteJobStage(status: string | undefined): BusinessRequestStage {
  if (status === "proposed" || status === "needs_attention") return "needs_you";
  if (status === "completed") return "done";
  if (status === "cancelled") return "closed";
  return "in_progress";
}

function shortDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Who is doing a request, by name. */
export function deliveryProviderName(item: BusinessDeliveryItem, _agencyNames: ReadonlyMap<string, string>): string {
  // XA: an unrecorded name is left out rather than shown as a builder phrase; it is never given to Strelva.
  return item.provider?.kind === "agency" ? item.servingAgencyName?.trim() || "your agency" : item.provider?.kind === "strelva" ? "Strelva Agency" : "";
}

export function businessRequestRows(deliveries: readonly BusinessDeliveryItem[], work: readonly WorkspaceWork[], providerName: (item: BusinessDeliveryItem) => string): BusinessRequestRow[] {
  const fromDeliveries = deliveries.map(item => ({
    id: `delivery-${item.id}`,
    title: item.title,
    stage: item.stage,
    detail: item.stage === "asked" ? `Asked · waiting for ${providerName(item) || "your agency"} to agree scope and deadline`
      : item.stage === "done" ? ["Done", providerName(item) ? `by ${providerName(item)}` : null].filter(Boolean).join(" · ")
      : [item.detail, item.dueAt && item.stage !== "closed" ? `due ${shortDate(item.dueAt)}` : null, providerName(item) ? `by ${providerName(item)}` : null].filter(Boolean).join(" · "),
    href: item.href,
    sortAt: item.updatedAt || "",
    agencyName: deliveryProviderName(item, new Map()) || undefined,
    provider: item.provider?.kind === "agency" || item.provider?.kind === "strelva" ? "agency" as const : undefined,
  }));
  const fromJobs = work.filter(item => item.productId === "operations" && item.resourceKind === "responsibility").map(item => {
    const stage = finiteJobStage(item.operation?.status);
    return {
      id: `work-${item.id}`,
      title: item.title,
      stage,
      detail: stage === "needs_you" ? item.operation?.reason || "Needs your decision before it continues" : `${REQUEST_STAGE_LABELS[stage]} · started ${shortDate(item.createdAt)}`,
      workId: item.id,
      sortAt: item.createdAt,
      provider: "strelva-run" as const,
    };
  });
  return [...fromDeliveries, ...fromJobs].sort((a, b) => b.sortAt.localeCompare(a.sortAt));
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
  onAsk: () => void;
}

/** Things someone asked for that have an end: asked, agreed, in progress, ready for review, done (XA · O5). */
export function WorkspaceRequests({ businessName, deliveryScope, work, agencyNames, agencySeat = false, readOnly, busy, onOpenWork, onAsk }: Props) {
  const ownerDeliveries = useBusinessDeliveries(agencySeat ? undefined : deliveryScope);
  const shared = useAgencyClientHome(agencySeat ? deliveryScope : undefined);
  const deliveries = agencySeat ? { state: shared.state.status === "ready" ? { status: "ready" as const, items: agencyClientDeliveries(shared.state.data) } : shared.state.status === "error" ? { status: "error" as const, message: "Shared Requests could not be checked." } : shared.state, refresh: shared.refresh } : ownerDeliveries;
  const items = deliveries.state.status === "ready" ? deliveries.state.items : [];
  const rows = businessRequestRows(items, work, item => deliveryProviderName(item, agencyNames));
  const state: RequestsViewStatus = busy || deliveries.state.status === "loading" ? { status: "loading" }
    : deliveries.state.status === "error" ? { status: "error", message: deliveries.state.message }
      : deliveries.state.status === "disabled" ? { status: "disabled" } : { status: "ready" };
  return <RequestsView businessName={businessName} rows={rows} state={state} readOnly={readOnly} agencySeat={agencySeat} onRetry={deliveries.refresh} onAsk={onAsk} onOpenWork={onOpenWork} />;
}
