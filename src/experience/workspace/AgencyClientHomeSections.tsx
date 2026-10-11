"use client";
import { StEmpty, StMono, StNotice, StRow, StRows, StSection, StSkeleton, StState, StTextButton } from "@/components/ui/strelva/Kit";
import { STRELVA_HANDLED_LABEL } from "@/platform/presentation/place-labels";
import type { AgencyClientHomeState } from "./useAgencyClientHome";
import { clientDecisionHref } from "@/platform/workspaces/location";

/** Same decision identity and title as the owner's item, with no approval controls. */
export function AgencyClientDecisionStatus({ state, businessName, workspaceId, selectedId, onRetry }: { state: AgencyClientHomeState; businessName: string; workspaceId: string; selectedId?: string; onRetry: () => void }) {
  const title = `Waiting on ${businessName}`;
  const decisions = state.status === "ready" ? state.data.decisions.filter(item => selectedId ? item.id === selectedId : item.state === "open") : [];
  return <StSection title={title} id="client-decision-status" meta="Read-only · the business decides">
    {state.status === "loading" ? <StSkeleton label="Checking shared decision status" /> : state.status === "error" ? <StNotice tone="critical">Shared decisions could not be checked. <StTextButton onClick={onRetry}>Check again</StTextButton></StNotice> : state.status === "ready" ? decisions.length ? <StRows label={title}>{decisions.map(item => <div id={`decision-${item.id}`} key={item.id}><StRow title={item.title} href={clientDecisionHref(workspaceId, item.id)} detail={<StMono as="time" dateTime={item.since}>{new Date(item.since).toLocaleDateString()}</StMono>} selected={item.id === selectedId} end={<StState kind={item.state === "open" ? "need" : "draft"}>{item.state === "open" ? title : item.state === "approved" ? "Approved by the business" : item.state === "declined" ? "Not yet" : item.state === "expired" ? "Expired" : "No longer waiting"}</StState>} /></div>)}</StRows> : <StEmpty>{selectedId ? "This decision is no longer available in your shared scope." : "No shared decisions are waiting."}</StEmpty> : null}
    <p className="text-xs text-gray-muted">Approval, access, money, exit and sensitive customer details stay with the business. Only shared status appears here.</p>
  </StSection>;
}
export function AgencyClientChanges({ state, workspaceId, onRetry }: { state: AgencyClientHomeState; workspaceId: string; onRetry: () => void }) {
  return <StSection title={STRELVA_HANDLED_LABEL} meta="Shared Systems · last 7 days">
    {state.status === "loading" ? <StSkeleton label="Checking shared changes" /> : state.status === "error" ? <StNotice>Shared changes could not be checked. <StTextButton onClick={onRetry}>Check again</StTextButton></StNotice> : state.status === "ready" ? state.data.changes.length ? <StRows>{state.data.changes.map(item => <StRow key={item.id} title={item.title} detail="Actor not recorded" href={`/workspace?view=system&system=${item.systemId}&workspaceId=${workspaceId}`} end={<StMono as="time" dateTime={item.at}>{new Date(item.at).toLocaleDateString()}</StMono>} />)}</StRows> : <StEmpty>No changes to shared Systems in the last 7 days.</StEmpty> : null}
  </StSection>;
}

export function AgencyClientDeliveryCheck({ state, selectedKey, workspaceId, onRetry }: { state: AgencyClientHomeState; selectedKey: string; workspaceId: string; onRetry: () => void }) {
  const check = state.status === "ready" ? state.data.deliveryChecks.find(item => item.key === selectedKey) : undefined;
  const words = { failed: "Read-back failed", differs: "Read-back differs", not_confirmed: "Read-back not confirmed", not_checked: "Read-back not checked" };
  return <StSection title="Delivery check" id="client-delivery-check">
    {state.status === "loading" ? <StSkeleton label="Checking this delivery" /> : state.status === "error" ? <StNotice>The delivery check could not be read. <StTextButton onClick={onRetry}>Check again</StTextButton></StNotice> : check ? <StRow title={check.title} detail="Shared delivery status" selected href={check.systemId ? `/workspace?view=system&workspaceId=${workspaceId}&system=${check.systemId}` : undefined} end={<StState kind="down">{words[check.status]}</StState>} /> : <StEmpty>This delivery check is resolved or no longer available in your shared scope.</StEmpty>}
  </StSection>;
}
