"use client";

import { ArrowUpRight } from "lucide-react";
import { StEmpty, StHead, StMono, StNotice, StPage, StPill, StRow, StRows, StSection, StSkeleton, StState, StTextButton } from "@/components/ui/strelva/Kit";
import type { WorkspaceWork } from "./contracts";
import { REQUEST_STAGE_LABELS, requestStageLabel, type BusinessDeliveryItem, type BusinessRequestStage } from "./business-delivery-summary";
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
}

const GROUPS: readonly { stage: BusinessRequestStage; heading: string }[] = [
  { stage: "needs_you", heading: "Needs you" },
  { stage: "ready_for_review", heading: "Ready for your review" },
  { stage: "in_progress", heading: "In progress" },
  { stage: "asked", heading: "Asked" },
  { stage: "done", heading: "Done" },
];

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
  return item.provider?.kind === "agency" ? item.servingAgencyName?.trim() || "Agency identity unavailable" : item.provider?.kind === "strelva" ? "Strelva Agency" : "Actor not recorded";
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
    agencyName: deliveryProviderName(item, new Map()),
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

/** Things someone asked for that have an end: asked, agreed, in progress, ready for review, done. */
export function WorkspaceRequests({ businessName, deliveryScope, work, agencyNames, agencySeat = false, readOnly, busy, onOpenWork, onAsk }: Props) {
  const ownerDeliveries = useBusinessDeliveries(agencySeat ? undefined : deliveryScope);
  const shared = useAgencyClientHome(agencySeat ? deliveryScope : undefined);
  const deliveries = agencySeat ? { state: shared.state.status === "ready" ? { status: "ready" as const, items: agencyClientDeliveries(shared.state.data) } : shared.state.status === "error" ? { status: "error" as const, message: "Shared Requests could not be checked." } : shared.state, refresh: shared.refresh } : ownerDeliveries;
  const items = deliveries.state.status === "ready" ? deliveries.state.items : [];
  const providerName = (item: BusinessDeliveryItem) => deliveryProviderName(item, agencyNames);
  const rows = businessRequestRows(items, work, providerName);
  const closed = rows.filter(row => row.stage === "closed");
  const loading = busy || deliveries.state.status === "loading";

  function stageLabel(stage: BusinessRequestStage, agencyName?: string) {
    return requestStageLabel(stage, { agencySeat, businessName, agencyName });
  }
  function row(entry: BusinessRequestRow) {
    return <StRow key={entry.id}
      title={entry.title}
      detail={entry.detail}
      href={entry.href}
      onClick={!entry.href && entry.workId ? () => onOpenWork(entry.workId!) : undefined}
      end={<><StState kind={entry.stage === "needs_you" || entry.stage === "ready_for_review" ? "need" : entry.stage === "done" ? "live" : "draft"}>{stageLabel(entry.stage, entry.agencyName)}</StState><ArrowUpRight size={16} aria-hidden="true" /></>}
    />;
  }

  return <StPage>
    <StHead title="Requests" titleId="requests-title"
      meta={<>Things you asked for that have an end. A request becomes agreed work once its scope and deadline are accepted.{readOnly ? " Shared with you." : null}</>}
      actions={!readOnly ? <StPill onClick={onAsk}>Ask Strelva for something</StPill> : undefined}
    />
    {deliveries.state.status === "disabled" ? <StNotice>Requests outside your current shared scope cannot be checked for {businessName}.</StNotice> : null}
    {deliveries.state.status === "error" ? <StNotice tone="critical"><span role="alert">{deliveries.state.message}</span> <StTextButton onClick={deliveries.refresh}>Check again</StTextButton></StNotice> : null}
    {loading ? <div role="status" aria-label="Checking your requests"><StSkeleton /><StSkeleton width="76%" /><StSkeleton width="88%" /></div> : rows.length === 0 && deliveries.state.status !== "error" ? <StEmpty>
      <p>{readOnly || deliveries.state.status === "disabled" ? "No requests you can see." : "Nothing asked yet."}</p>
      {readOnly || deliveries.state.status === "disabled" ? null : <p>Ask Strelva for something with an end: a new page, an intake form, a launch. It shows up here with its stage and due date.</p>}
    </StEmpty> : <>
      {GROUPS.map(group => {
        const entries = rows.filter(entry => entry.stage === group.stage);
        if (!entries.length) return null;
        return <StSection key={group.stage} title={group.stage === "asked" ? REQUEST_STAGE_LABELS.asked : stageLabel(group.stage)} id={`requests-${group.stage}`} meta={<StMono>{entries.length}</StMono>}>
          <StRows label={group.stage === "asked" ? REQUEST_STAGE_LABELS.asked : stageLabel(group.stage)}>{entries.map(row)}</StRows>
        </StSection>;
      })}
      {closed.length ? <details><summary className="cursor-pointer py-3 text-sm text-gray-muted">Closed (<StMono>{closed.length}</StMono>)</summary><StRows label="Closed requests">{closed.map(row)}</StRows></details> : null}
    </>}
  </StPage>;
}
