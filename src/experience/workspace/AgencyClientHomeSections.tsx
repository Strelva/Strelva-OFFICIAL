"use client";
import { useEffect, useRef } from "react";
import { StEmpty, StMono, StNotice, StRow, StRows, StSection, StSkeleton, StState, StTextButton } from "@/components/ui/strelva/Kit";
import { actorLabel } from "@/platform/presentation/actor";
import { STRELVA_HANDLED_LABEL } from "@/platform/presentation/place-labels";
import type { AgencyClientHomeState } from "./useAgencyClientHome";
import { clientDecisionHref } from "@/platform/workspaces/location";

/** Same decision identity and title as the owner's item, with no approval controls. */
export function AgencyClientDecisionStatus({ state, businessName, workspaceId, selectedId, onRetry }: { state: AgencyClientHomeState; businessName: string; workspaceId: string; selectedId?: string; onRetry: () => void }) {
  const selectedItem = useRef<HTMLSpanElement>(null);
  const focusedId = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!selectedId || selectedId === focusedId.current || state.status !== "ready" || !state.data.decisions.some(item => item.id === selectedId)) return;
    if (!selectedItem.current) return;
    focusedId.current = selectedId;
    selectedItem.current.focus({ preventScroll: true });
    selectedItem.current?.scrollIntoView?.({ block: "nearest" });
  }, [selectedId, state]);
  const title = `Waiting on ${businessName}`;
  const decisions = state.status === "ready" ? state.data.decisions.filter(item => selectedId ? item.id === selectedId : item.state === "open") : [];
  // What the business decided in the last 30 days (the read already returns them), newest first.
  const decided = state.status === "ready" && !selectedId ? state.data.decisions.filter(item => item.state !== "open").sort((a, b) => Date.parse(b.since) - Date.parse(a.since)).slice(0, 10) : [];
  return <><StSection title={title} id="client-decision-status" meta="Read-only · the business decides">
    {state.status === "loading" ? <StSkeleton label="Checking shared decision status" /> : state.status === "error" ? <StNotice tone="critical">Shared decisions could not be checked. <StTextButton onClick={onRetry}>Check again</StTextButton></StNotice> : state.status === "ready" ? decisions.length ? <StRows label={title}>{decisions.map(item => <StRow key={item.id} title={<span id={`decision-${item.id}`} ref={item.id === selectedId ? selectedItem : undefined} tabIndex={-1}>{item.title}</span>} href={clientDecisionHref(workspaceId, item.id)} detail={<StMono as="time" dateTime={item.since}>{new Date(item.since).toLocaleDateString()}</StMono>} selected={item.id === selectedId} end={<StState kind={item.state === "open" ? "need" : "draft"}>{item.state === "open" ? title : item.state === "approved" ? "Approved by the business" : item.state === "declined" ? "Not yet" : item.state === "expired" ? "Expired" : "No longer waiting"}</StState>} />)}</StRows> : <StEmpty>{selectedId ? "This decision is no longer available in your shared scope." : "No shared decisions are waiting."}</StEmpty> : null}
    <p className="text-xs text-gray-muted">Approval, access, money, exit and sensitive customer details stay with the business. Only shared status appears here.</p>
  </StSection>
  {decided.length ? <StSection title="Recently decided" id="client-decisions-decided" meta="Last 30 days"><StRows label="Recently decided, newest first">{decided.map(item => <StRow key={item.id} title={item.title} href={clientDecisionHref(workspaceId, item.id)} detail={<StMono as="time" dateTime={item.since}>{new Date(item.since).toLocaleDateString()}</StMono>} end={<StState kind="draft">{item.state === "approved" ? "Approved by the business" : item.state === "declined" ? "Not yet" : item.state === "expired" ? "Expired" : "No longer waiting"}</StState>} />)}</StRows></StSection> : null}</>;
}
export function AgencyClientChanges({ state, workspaceId, onRetry }: { state: AgencyClientHomeState; workspaceId: string; onRetry: () => void }) {
  return <StSection title={STRELVA_HANDLED_LABEL} meta="Shared Systems · last 7 days">
    {state.status === "loading" ? <StSkeleton label="Checking shared changes" /> : state.status === "error" ? <StNotice>Shared changes could not be checked. <StTextButton onClick={onRetry}>Check again</StTextButton></StNotice> : state.status === "ready" ? state.data.changes.length ? <StRows>{state.data.changes.map(item => <StRow key={item.id} title={item.title} detail={actorLabel(item.actor)} href={`/workspace?view=system&system=${item.systemId}&workspaceId=${workspaceId}`} end={<StMono as="time" dateTime={item.at}>{new Date(item.at).toLocaleDateString()}</StMono>} />)}</StRows> : <StEmpty>No changes to shared Systems in the last 7 days.</StEmpty> : null}
  </StSection>;
}

export function AgencyClientDeliveryCheck({ state, selectedKey, workspaceId, onRetry }: { state: AgencyClientHomeState; selectedKey: string; workspaceId: string; onRetry: () => void }) {
  const check = state.status === "ready" ? state.data.deliveryChecks.find(item => item.key === selectedKey) : undefined;
  const words = { failed: "Read-back failed", differs: "Read-back differs", not_confirmed: "Read-back not confirmed", not_checked: "Read-back not checked" };
  return <StSection title="Delivery check" id="client-delivery-check">
    {state.status === "loading" ? <StSkeleton label="Checking this delivery" /> : state.status === "error" ? <StNotice>The delivery check could not be read. <StTextButton onClick={onRetry}>Check again</StTextButton></StNotice> : check ? <StRow title={check.title} detail="Shared delivery status" selected href={check.systemId ? `/workspace?view=system&workspaceId=${workspaceId}&system=${check.systemId}` : undefined} end={<StState kind="down">{words[check.status]}</StState>} /> : <StEmpty>This delivery check is resolved or no longer available in your shared scope.</StEmpty>}
  </StSection>;
}
