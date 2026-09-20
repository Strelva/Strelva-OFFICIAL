"use client";

import { ArrowRight, BriefcaseBusiness, CircleAlert, Coins, FileText, RefreshCw, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { WorkAllowanceInspection } from "@/platform/work-economics/allowances";
import type { AgencyApplicationDraftWork } from "@/platform/offerings";
import { Button } from "@/components/ui/Button";
import { ServiceRequestInbox } from "@/experience/operations/ServiceRequestInbox";
import type { WorkspaceSnapshot, WorkspaceWork } from "./contracts";
import { useWorkspaceRequest } from "./WorkspaceRequest";
import {
  MAX_AGENCY_CLIENT_LOADS,
  agencyAttentionQueue,
  agencyClientTargets,
  agencyCreditPeriods,
  loadAgencyClientSnapshots,
  type AgencyClientLoadResult,
  type AgencyCreditPeriod,
} from "./agency-home";

type ClientState =
  | { status: "loading" }
  | { status: "ready"; result: AgencyClientLoadResult };

function workLabel(work: WorkspaceWork): string {
  if (work.productId === "applications") return "Application";
  if (work.productId === "documents") return "Document";
  if (work.productId === "operations") return "Ongoing work";
  if (work.productId === "tracker") return "Tracker";
  if (work.productId === "work_plans") return "Work plan";
  return work.assessment?.method.label ?? "Saved work";
}

function unitLabel(value: string, count: number): string {
  const label = value.replace(/^completed_/, "").replaceAll("_", " ");
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}

function periodLabel(period: AgencyCreditPeriod): string {
  const format = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `${format.format(new Date(period.periodStart))} to ${format.format(new Date(period.periodEnd))}`;
}

export function AgencyHome({
  snapshot,
  busy,
  onWorkspace,
  onOpenClientWork,
  onOpenWork,
  onStart,
}: {
  snapshot: WorkspaceSnapshot;
  busy: boolean;
  onWorkspace: (workspaceId: string) => void;
  onOpenClientWork: (workspaceId: string, workId: string) => void;
  onOpenWork: (workId: string) => void;
  onStart: () => void;
}) {
  const request = useWorkspaceRequest();
  const [page, setPage] = useState({ workspaceId: snapshot.workspaceId, offset: 0 });
  const total = agencyClientTargets(snapshot, 0).totalCount;
  const lastOffset = Math.max(0, Math.floor((total - 1) / MAX_AGENCY_CLIENT_LOADS) * MAX_AGENCY_CLIENT_LOADS);
  const offset = page.workspaceId === snapshot.workspaceId ? Math.min(page.offset, lastOffset) : 0;
  const selection = useMemo(() => agencyClientTargets(snapshot, MAX_AGENCY_CLIENT_LOADS, offset), [snapshot, offset]);
  const targetSignature = selection.targets.map((target) => `${target.id}:${target.workIds.join(",")}`).join("|");
  const [refresh, setRefresh] = useState(0);
  const [clients, setClients] = useState<ClientState>(() => selection.targets.length ? { status: "loading" } : {
    status: "ready",
    result: { clients: [], failed: [], omittedCount: 0, totalCount: 0 },
  });
  const [credits, setCredits] = useState<AgencyCreditPeriod[]>([]);
  const [applicationDrafts, setApplicationDrafts] = useState<AgencyApplicationDraftWork[] | null>(null);
  const [applicationDraftError, setApplicationDraftError] = useState("");
  const current = snapshot.workspaces.find((workspace) => workspace.id === snapshot.workspaceId);
  const agencyName = current?.name || "Your agency";

  useEffect(() => {
    const controller = new AbortController();
    if (!selection.targets.length) {
      setClients({ status: "ready", result: { clients: [], failed: [], omittedCount: selection.omittedCount, totalCount: selection.totalCount } });
      return () => controller.abort();
    }
    setClients({ status: "loading" });
    void loadAgencyClientSnapshots(request, snapshot, controller.signal, offset).then((result) => {
      if (!controller.signal.aborted) setClients({ status: "ready", result });
    }).catch(() => {
      if (!controller.signal.aborted) setClients({ status: "ready", result: {
        clients: [],
        failed: selection.targets,
        omittedCount: selection.omittedCount,
        totalCount: selection.totalCount,
      } });
    });
    return () => controller.abort();
    // The IDs are the durable fetch boundary. Other agency-snapshot changes do not broaden it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, snapshot.workspaceId, targetSignature, refresh, offset]);

  useEffect(() => {
    const controller = new AbortController();
    setCredits([]);
    if (current?.kind !== "agency" || current.access === "delegated_read") return () => controller.abort();
    void request(`/api/work-allowances?workspaceId=${encodeURIComponent(snapshot.workspaceId)}`, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) return null;
      return response.json() as Promise<WorkAllowanceInspection>;
    }).then((value) => {
      if (!controller.signal.aborted && value?.policy?.contributionPayouts === false) setCredits(agencyCreditPeriods(value));
    }).catch(() => undefined);
    return () => controller.abort();
  }, [current?.access, current?.kind, request, snapshot.workspaceId]);

  useEffect(() => {
    const controller = new AbortController();
    setApplicationDrafts(null);
    setApplicationDraftError("");
    if (current?.kind !== "agency" || current.access === "delegated_read") return () => controller.abort();
    void request(`/api/agency-applications?agencyWorkspaceId=${encodeURIComponent(snapshot.workspaceId)}`, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    }).then(async (response) => {
      const value = await response.json().catch(() => null) as { applications?: AgencyApplicationDraftWork[]; error?: unknown } | null;
      if (!response.ok) throw new Error(typeof value?.error === "string" ? value.error : "Assigned application drafts could not be loaded.");
      if (!controller.signal.aborted) setApplicationDrafts(value?.applications ?? []);
    }).catch((cause) => {
      if (!controller.signal.aborted) setApplicationDraftError(cause instanceof Error ? cause.message : "Assigned application drafts could not be loaded.");
    });
    return () => controller.abort();
  }, [current?.access, current?.kind, request, snapshot.workspaceId]);

  const loadedClients = clients.status === "ready" ? clients.result.clients : [];
  const queue = agencyAttentionQueue(loadedClients);
  const failed = clients.status === "ready" ? clients.result.failed : [];
  const totalClients = clients.status === "ready" ? clients.result.totalCount : selection.totalCount;
  const omittedCount = clients.status === "ready" ? clients.result.omittedCount : selection.omittedCount;
  const readyApplicationDrafts = applicationDrafts ?? [];

  return <div className="mx-auto w-full max-w-5xl px-6 py-10 sm:px-8 lg:px-12" aria-busy={busy || clients.status === "loading" || undefined}>
    <header className="max-w-2xl border-b border-gray-border pb-8">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent-text">{agencyName}</p>
      <h1 className="mt-3 font-display text-[28px] font-medium leading-tight text-warm-black sm:text-[32px]">Client work</h1>
      <p className="mt-3 text-[14px] leading-relaxed text-gray-muted">Only work currently shared with this agency appears here. Customers keep ownership and control access.</p>
    </header>

    {current?.kind === "agency" && current.access !== "delegated_read" ? <section className="mt-10" aria-labelledby="agency-service-requests-title">
      <h2 id="agency-service-requests-title" className="text-[15px] font-medium text-warm-black">Service requests</h2>
      <p className="mt-1 text-[12px] text-gray-muted">Review requests addressed to {agencyName}. A response records review and does not start work.</p>
      <div className="mt-5"><ServiceRequestInbox providerWorkspaceId={snapshot.workspaceId} surface="workspace" /></div>
    </section> : null}

    {current?.kind === "agency" && current.access !== "delegated_read" ? <section className="mt-10" aria-labelledby="agency-application-drafts-title">
      <h2 id="agency-application-drafts-title" className="text-[15px] font-medium text-warm-black">Assigned application drafts</h2>
      <p className="mt-1 text-[12px] text-gray-muted">Open only the installed application named by an active customer delivery. Editing appears after the customer grants it.</p>
      {applicationDrafts === null && !applicationDraftError ? <p role="status" className="mt-4 text-[13px] text-gray-muted">Checking assigned application drafts…</p> : applicationDraftError ? <p role="alert" className="mt-4 text-[13px] text-critical">{applicationDraftError}</p> : readyApplicationDrafts.length ? <ul className="mt-4 divide-y divide-gray-border border-y border-gray-border">{readyApplicationDrafts.map((draft) => {
        const editable = draft.draftGrantStatus === "active" && Boolean(draft.draftGrantExpiresAt) && Date.parse(draft.draftGrantExpiresAt!) > Date.now();
        return <li key={`${draft.assignmentId}:${draft.applicationWorkId}`} className="flex items-center gap-4 px-2 py-4"><FileText className="shrink-0 text-accent-text" size={18} aria-hidden="true" /><span className="min-w-0 flex-1"><strong className="block truncate text-[14px] font-medium text-warm-black">{draft.applicationTitle}</strong><small className="mt-1 block text-[12px] text-gray-muted">{draft.customerWorkspaceName} · {editable ? "Draft editing granted" : "Waiting for customer draft-edit permission"}</small></span><a className="shrink-0 text-[13px] text-warm-black underline" href={`/agency-applications/${encodeURIComponent(draft.applicationWorkId)}`}>Open draft</a></li>;
      })}</ul> : <p className="mt-4 border-y border-gray-border py-5 text-[13px] text-gray-muted">No accepted agency application delivery is assigned to you.</p>}
    </section> : null}

    <section className="mt-10" aria-labelledby="agency-attention-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="agency-attention-title" className="text-[15px] font-medium text-warm-black">Needs attention across clients</h2>
          <p className="mt-1 text-[12px] text-gray-muted">Recorded decisions and exceptions from the client work loaded below.</p>
        </div>
        {clients.status !== "loading" && selection.targets.length ? <button type="button" className="inline-flex min-h-11 items-center gap-2 text-[13px] text-gray-muted underline-offset-4 hover:text-warm-black hover:underline" onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={14} aria-hidden="true" />Refresh</button> : null}
      </div>
      {clients.status === "loading" ? <p role="status" className="mt-5 border-y border-gray-border py-5 text-[13px] text-gray-muted">Checking shared client work…</p>
        : queue.length ? <ul className="mt-5 divide-y divide-gray-border border-y border-gray-border">{queue.map((item) => <li key={`${item.client.workspace.id}:${item.work.id}`}>
            <button type="button" className="flex min-h-16 w-full items-center gap-4 px-2 py-4 text-left hover:bg-surface" onClick={() => onOpenClientWork(item.client.workspace.id, item.work.id)} aria-label={`Open ${item.client.workspace.name} to review ${item.work.title}`}>
              <CircleAlert className="shrink-0 text-warning" size={18} aria-hidden="true" />
              <span className="min-w-0 flex-1"><strong className="block truncate text-[14px] font-medium text-warm-black">{item.work.title}</strong><small className="mt-1 block text-[12px] leading-relaxed text-gray-muted">{item.client.workspace.name} · {item.reason}</small></span>
              <ArrowRight className="shrink-0 text-gray-muted" size={16} aria-hidden="true" />
            </button>
          </li>)}</ul>
          : <p className="mt-5 border-y border-gray-border py-5 text-[13px] text-gray-muted">{failed.length && failed.length === selection.targets.length ? "Client work could not be checked. Access has not changed." : totalClients ? "No loaded client work currently needs a recorded decision." : "No customer work is currently shared with this agency."}</p>}
      {omittedCount ? <p className="mt-3 text-[12px] text-gray-muted">This queue shows the selected page. {omittedCount} other clients are outside this check.</p> : null}
      {failed.length ? <p className="mt-3 text-[12px] text-gray-muted">{failed.length} client workspace{failed.length === 1 ? " was" : "s were"} unavailable during this check. Access may have changed.</p> : null}
    </section>

    <section className="mt-12" aria-labelledby="agency-clients-title">
      <div className="flex items-end justify-between gap-4 border-b border-gray-border pb-3">
        <div><h2 id="agency-clients-title" className="text-[15px] font-medium text-warm-black">Clients with shared work</h2><p className="mt-1 text-[12px] text-gray-muted">Opening a client keeps you inside the access that customer granted.</p></div>
        <span className="text-[12px] text-gray-muted">{totalClients}</span>
      </div>
      {totalClients > MAX_AGENCY_CLIENT_LOADS ? <nav aria-label="Client pages" className="flex flex-wrap items-center justify-between gap-3 py-4">
        <p className="text-[12px] text-gray-muted" aria-live="polite">Clients {offset + 1}–{Math.min(offset + MAX_AGENCY_CLIENT_LOADS, totalClients)} of {totalClients}</p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" disabled={busy || offset === 0} onClick={() => setPage({ workspaceId: snapshot.workspaceId, offset: Math.max(0, offset - MAX_AGENCY_CLIENT_LOADS) })}>Previous clients</Button>
          <Button variant="secondary" size="sm" disabled={busy || offset + MAX_AGENCY_CLIENT_LOADS >= totalClients} onClick={() => setPage({ workspaceId: snapshot.workspaceId, offset: offset + MAX_AGENCY_CLIENT_LOADS })}>Next clients</Button>
        </div>
      </nav> : null}
      {selection.targets.length ? <ul>{selection.targets.map((target) => {
        const loaded = loadedClients.find((client) => client.workspace.id === target.id);
        const unavailable = failed.some((item) => item.id === target.id);
        return <li key={target.id} className="border-b border-gray-border">
          <button type="button" className="flex min-h-16 w-full items-center gap-4 px-2 py-4 text-left hover:bg-surface" onClick={() => onWorkspace(target.id)}>
            <Users className="shrink-0 text-accent-text" size={18} aria-hidden="true" />
            <span className="min-w-0 flex-1"><strong className="block truncate text-[14px] font-medium text-warm-black">{target.name}</strong><small className="mt-1 block text-[12px] text-gray-muted">{loaded ? `${loaded.work.length} shared work item${loaded.work.length === 1 ? "" : "s"}` : unavailable ? "Shared-work check unavailable" : "Checking shared work"}</small></span>
            <ArrowRight className="shrink-0 text-gray-muted" size={16} aria-hidden="true" />
          </button>
        </li>;
      })}</ul> : <div className="flex items-start gap-3 border-b border-gray-border py-5 text-[13px] leading-relaxed text-gray-muted"><Users className="mt-0.5 shrink-0" size={17} aria-hidden="true" /><p>Direct business memberships stay in their business workspace. They are not treated as agency clients without an active agency work delegation.</p></div>}
    </section>

    <section className="mt-12" aria-labelledby="agency-private-title">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-gray-border pb-3">
        <div><h2 id="agency-private-title" className="text-[15px] font-medium text-warm-black">Private agency work</h2><p className="mt-1 text-[12px] text-gray-muted">Drafts and methods stay in {agencyName} until you hand specific work to a customer.</p></div>
        <button type="button" onClick={onStart} className="inline-flex min-h-11 items-center gap-2 text-[13px] font-medium text-warm-black">Start private work<ArrowRight size={15} aria-hidden="true" /></button>
      </div>
      {snapshot.work.length ? <ul>{snapshot.work.slice(0, 6).map((work) => <li key={work.id} className="border-b border-gray-border">
        <button type="button" className="flex min-h-16 w-full items-center gap-4 px-2 py-4 text-left hover:bg-surface" onClick={() => onOpenWork(work.id)}>
          <FileText className="shrink-0 text-accent-text" size={18} aria-hidden="true" />
          <span className="min-w-0 flex-1"><strong className="block truncate text-[14px] font-medium text-warm-black">{work.title}</strong><small className="mt-1 block text-[12px] text-gray-muted">{workLabel(work)} · Private to this agency workspace</small></span>
          <ArrowRight className="shrink-0 text-gray-muted" size={16} aria-hidden="true" />
        </button>
      </li>)}</ul> : <div className="flex items-start gap-3 border-b border-gray-border py-5 text-[13px] leading-relaxed text-gray-muted"><BriefcaseBusiness className="mt-0.5 shrink-0" size={17} aria-hidden="true" /><p>No private agency work has been saved yet.</p></div>}
      <p className="mt-3 text-[12px] leading-relaxed text-gray-muted">Business offerings are installed and managed from the customer business that owns them. This agency workspace does not currently hold a private offering catalog.</p>
    </section>

    <section className="mt-12" aria-labelledby="agency-access-title">
      <h2 id="agency-access-title" className="text-[15px] font-medium text-warm-black">Team and access</h2>
      <div className="mt-3 flex items-start gap-3 border-y border-gray-border py-5 text-[13px] leading-relaxed text-gray-muted"><Users className="mt-0.5 shrink-0" size={17} aria-hidden="true" /><p>Use People &amp; access in the workspace navigation to review the agency’s handoffs and sharing. A customer’s access remains controlled from that customer’s workspace.</p></div>
    </section>

    {credits.length ? <section className="mt-12" aria-labelledby="agency-credits-title">
      <div className="flex items-center gap-3"><Coins className="text-accent-text" size={18} aria-hidden="true" /><h2 id="agency-credits-title" className="text-[15px] font-medium text-warm-black">Awarded contribution credits</h2></div>
      <ul className="mt-3 divide-y divide-gray-border border-y border-gray-border">{credits.map((period) => <li key={period.id} className="py-4"><strong className="text-[13px] font-medium text-warm-black">{period.units.map((unit) => unitLabel(unit.unitKind, unit.creditedUnits)).join(" · ")}</strong><small className="mt-1 block text-[12px] text-gray-muted">{periodLabel(period)}</small></li>)}</ul>
      <p className="mt-3 text-[12px] leading-relaxed text-gray-muted">These are recorded work-allowance units, not cash payments.</p>
    </section> : null}
  </div>;
}
