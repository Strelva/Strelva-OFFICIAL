"use client";
import { useEffect, useState } from "react";
import { StEmpty, StMono, StPillLink, StNotice, StPill, StRow, StRows, StSection, StState, StTextButton } from "@/components/ui/strelva/Kit";
import { useWorkspaceRequest } from "../WorkspaceRequest";
import { providerQueuePageSchema, type ProviderQueueCursor, type ProviderQueuePage, type ProviderQueueItem } from "@/platform/provider-client-queue/contracts";
type State = { status: "loading" } | { status: "error" } | { status: "permission" } | { status: "ready"; page: ProviderQueuePage; moreBusy: boolean; moreError: boolean };
const statusWords: Record<string, string> = { failed: "Read-back failed", differs: "Read-back differs", not_confirmed: "Read-back not confirmed", not_checked: "Read-back not checked", not_sent: "Owner not told", suppressed: "Delivery suppressed", bounced: "Delivery bounced", expired: "Owner decision expired before delivery", waiting: "Waiting for your review", pending_acceptance: "Waiting for you to accept" };
export function providerQueueItemHref(item: ProviderQueueItem) {
  const [kind, id] = item.key.split(":");
  // A Request opens in the delivery view, where the agency accepts it.
  if (kind === "request") return `/workspace/delivery/${id}?${new URLSearchParams({ workspaceId: item.workspaceId })}`;
  if (kind === "review") return `/workspace?${new URLSearchParams({ workspaceId: item.workspaceId, view: "needs-you", decision: id! })}`;
  return `/workspace?${new URLSearchParams({ workspaceId: item.workspaceId, view: kind === "decision" ? "needs-you" : "home", ...(kind === "decision" ? { decision: id! } : { deliveryCheck: item.key }) })}`;
}
export function ProviderClientQueue({ workspaceId }: { workspaceId: string; onWorkspace: (workspaceId: string) => void }) {
  const request = useWorkspaceRequest();
  const [attempt, setAttempt] = useState(0);
  const key = `${workspaceId}:${attempt}`;
  const [stored, setStored] = useState<{ key: string; state: State } | null>(null);
  const state: State = stored?.key === key ? stored.state : { status: "loading" };
  async function load(cursor: ProviderQueueCursor | null, signal?: AbortSignal): Promise<ProviderQueuePage> {
    const url = `/api/workspace/provider-client-queue?workspaceId=${encodeURIComponent(workspaceId)}${cursor ? `&cursor=${encodeURIComponent(JSON.stringify(cursor))}` : ""}`;
    const response = await request(url, { credentials: "same-origin", headers: { Accept: "application/json" }, signal });
    if (response.status === 401 || response.status === 403) throw new Error("permission");
    if (!response.ok) throw new Error("error");
    const page = providerQueuePageSchema.parse(await response.json());
    if (page.agencyWorkspaceId !== workspaceId) throw new Error("error");
    return page;
  }
  useEffect(() => {
    const controller = new AbortController();
    void load(null, controller.signal).then(page => {
      if (!controller.signal.aborted) setStored({ key, state: { status: "ready", page, moreBusy: false, moreError: false } });
    }).catch(error => {
      if (!controller.signal.aborted) setStored({ key, state: { status: error instanceof Error && error.message === "permission" ? "permission" : "error" } });
    });
    return () => controller.abort();
    // Keyed reads discard old agency results; request is the owned preview/real boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, workspaceId, key]);
  const more = () => {
    if (state.status !== "ready" || state.moreBusy || !state.page.nextCursor) return;
    setStored({ key, state: { ...state, moreBusy: true, moreError: false } });
    void load(state.page.nextCursor).then(page => setStored(current => current?.key === key ? { key, state: { status: "ready", page: { ...page, items: [...state.page.items, ...page.items.filter(item => !state.page.items.some(old => old.key === item.key))] }, moreBusy: false, moreError: false } } : current))
      .catch(error => setStored(current => current?.key === key ? { key, state: error instanceof Error && error.message === "permission" ? { status: "permission" } : { ...state, moreBusy: false, moreError: true } } : current));
  };
  const group = (kind: "readback" | "owner_not_told" | "client_work", title: string) => {
    if (state.status !== "ready") return null;
    const rows = state.page.items.filter(item => kind === "client_work" ? item.kind === "review" || item.kind === "request" : item.kind === kind);
    return <StSection title={title} meta={<StMono>{rows.length}</StMono>}>
      {rows.length ? <StRows label={title}>{rows.map(item => <StRow key={item.key} title={item.title} detail={<>{item.workspaceName} · <StState kind={kind === "readback" ? "down" : "need"}>{statusWords[item.status]}</StState></>} end={<><StMono as="time" dateTime={item.openedAt}>{new Date(item.openedAt).toLocaleDateString()}</StMono><StPillLink variant="soft" href={providerQueueItemHref(item)}>Open this item</StPillLink></>} />)}</StRows> : <StEmpty>{state.page.nextCursor ? "No items in this part of the queue yet. More items are available." : kind === "readback" ? "No failed or unchecked read-backs in the loaded queue." : kind === "client_work" ? "No client work waiting in the loaded queue." : "No undelivered owner decisions in the loaded queue."}</StEmpty>}
    </StSection>;
  };
  return <div className="mt-8 space-y-8" aria-busy={state.status === "loading" || (state.status === "ready" && state.moreBusy) || undefined}>
    <StSection title="Delivery checks for your clients" action={<StTextButton onClick={() => setAttempt(value => value + 1)}>Refresh delivery checks</StTextButton>}>
      <p className="text-sm text-gray-muted">Only clients assigned to you with active agency access. Oldest first.</p>
      {state.status === "loading" ? <p role="status">Checking read-backs and owner delivery…</p> : state.status === "permission" ? <StNotice>This client queue is unavailable to your account. Your agency membership or client access may have changed.</StNotice> : state.status === "error" ? <StNotice tone="critical">Delivery checks could not be loaded. The queue is incomplete. <StPill variant="soft" onClick={() => setAttempt(value => value + 1)}>Retry delivery checks</StPill></StNotice> : <>{group("readback", "Read-back queue")}{group("owner_not_told", "Owner not told")}{group("client_work", "Client work")}{state.moreError ? <StNotice tone="critical">More delivery checks could not be loaded. The queue is incomplete.</StNotice> : null}{state.page.nextCursor ? <StPill variant="soft" busy={state.moreBusy} onClick={more}>Show more delivery checks</StPill> : null}</>}
    </StSection>
  </div>;
}
