"use client";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useWorkspaceRequest } from "../WorkspaceRequest";
import { providerQueuePageSchema, type ProviderQueueCursor, type ProviderQueuePage } from "@/platform/provider-client-queue/contracts";
type State = { status: "loading" } | { status: "error" } | { status: "permission" } | { status: "ready"; page: ProviderQueuePage; moreBusy: boolean; moreError: boolean };
const statusWords: Record<string, string> = { failed: "Read-back failed", differs: "Read-back differs", not_confirmed: "Read-back not confirmed", not_checked: "Read-back not checked", not_sent: "Owner not told", suppressed: "Delivery suppressed", bounced: "Delivery bounced", expired: "Owner decision expired before delivery" };
export function ProviderClientQueue({ workspaceId, onWorkspace }: { workspaceId: string; onWorkspace: (workspaceId: string) => void }) {
  const request = useWorkspaceRequest();
  const id = useId();
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
  const group = (kind: "readback" | "owner_not_told", title: string) => {
    if (state.status !== "ready") return null;
    const rows = state.page.items.filter(item => item.kind === kind);
    return <section className="mt-6" aria-labelledby={`${id}-${kind}`}><h3 id={`${id}-${kind}`} className="text-[14px] font-medium text-warm-black">{title}</h3>
      {rows.length ? <ul className="mt-3 divide-y divide-gray-border border-y border-gray-border">{rows.map(item => <li key={item.key} className="flex flex-wrap items-start gap-3 py-4">
        <div className="min-w-0 flex-1 basis-52"><p className="break-words text-[14px] text-warm-black">{item.title}</p><p className="mt-1 break-words text-[12px] text-gray-muted">{item.workspaceName} · {statusWords[item.status]}</p><p className="mt-1 text-[12px] text-gray-muted"><time dateTime={item.openedAt}>{new Date(item.openedAt).toLocaleDateString()}</time></p></div>
        <Button size="lg" type="button" variant="secondary" onClick={() => onWorkspace(item.workspaceId)}>Open client</Button>
      </li>)}</ul> : <p className="mt-3 text-[13px] text-gray-muted">{state.page.nextCursor ? "No items in this part of the queue yet. More items are available." : kind === "readback" ? "No failed or unchecked read-backs in the loaded queue." : "No undelivered owner decisions in the loaded queue."}</p>}
    </section>;
  };
  return <section aria-labelledby={`${id}-title`} aria-busy={state.status === "loading" || (state.status === "ready" && state.moreBusy) || undefined} className="mt-8">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id={`${id}-title`} className="text-[15px] font-medium text-warm-black">Delivery checks for your clients</h2><p className="mt-1 text-[12px] text-gray-muted">Only clients you are staffed on with an active provider seat. Oldest first.</p></div><Button size="lg" type="button" variant="ghost" onClick={() => setAttempt(value => value + 1)}>Refresh delivery checks</Button></div>
    {state.status === "loading" ? <p role="status" className="mt-4 text-[13px] text-gray-muted">Checking read-backs and owner delivery…</p> : state.status === "permission" ? <p role="alert" className="mt-4 text-[13px] text-gray-muted">This client queue is unavailable to your account. Your agency membership or client access may have changed.</p> : state.status === "error" ? <div role="alert" className="mt-4"><p className="text-[13px] text-critical">Delivery checks could not be loaded. The queue is incomplete.</p><Button size="lg" type="button" variant="secondary" onClick={() => setAttempt(value => value + 1)}>Retry delivery checks</Button></div> : <>{group("readback", "Read-back queue")}{group("owner_not_told", "Owner not told")}{state.moreError ? <p role="alert" className="mt-4 text-[13px] text-critical">More delivery checks could not be loaded. The queue is incomplete.</p> : null}{state.page.nextCursor ? <div className="mt-4"><Button size="lg" type="button" variant="secondary" loading={state.moreBusy} onClick={more}>Show more delivery checks</Button></div> : null}</>}
  </section>;
}
