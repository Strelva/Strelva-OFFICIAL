"use client";

import { ArrowRight, BriefcaseBusiness, Coins, FileText, Globe2, RefreshCw, Users } from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { WorkAllowanceInspection } from "@/platform/work-economics/allowances";
import type { AgencyApplicationDraftWork, AgencyManagedWebsiteDraftWork } from "@/platform/offerings";
import { Tabs, TabsPanel } from "@/components/ui/Tabs";
import { ServiceRequestInbox } from "@/experience/operations/ServiceRequestInbox";
import type { WorkspaceSnapshot, WorkspaceWork } from "./contracts";
import { useWorkspaceRequest } from "./WorkspaceRequest";
import { systemsReleased } from "@/experience/systems/model";
import { daysWaiting, loadAgencyClients } from "./agency-clients";
import {
  agencyCreditPeriods,
  combineAgencyPages,
  type AgencyCreditPeriod,
  type AgencyLoadedPage,
} from "./agency-home";
import { AgencyClientList, AgencyClientsError, AgencyClientsLoading, AgencyQueueList } from "./agency/AgencyViews";
import { AgencyAuthoring } from "./agency/AgencyAuthoring";
import { AgencyTeamView } from "./agency/AgencyTeamView";
import { AgencyLibraryView } from "./agency/AgencyLibraryView";
import { AgencyVersionCreate } from "./agency/AgencyVersionCreate";

type ClientsState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; pages: AgencyLoadedPage[]; loadingMore: boolean; moreError: boolean; retrying: ReadonlySet<number> };

type AgencyView = "clients" | "queue" | "library" | "team" | "build" | "package";

function workLabel(work: WorkspaceWork, systemsReleased: boolean): string {
  if (work.productId === "applications") return systemsReleased ? "Internal tool" : "Application";
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

const sectionTitle = "text-[15px] font-medium text-warm-black";
const sectionNote = "mt-1 text-[12px] text-gray-muted";

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
  const id = useId().replace(/:/g, "");
  const current = snapshot.workspaces.find((workspace) => workspace.id === snapshot.workspaceId);
  const agencyName = current?.name || "Your agency";
  // A delegated reader of the agency itself sees no agency tools, as before.
  const canUseTools = current?.kind === "agency" && current.access !== "delegated_read";
  // Clients, Queue, Library and Team are the Systems model (STRELVA_SYSTEMS_RELEASE).
  // Off, the page reads as it did, with clients from the same batched read.
  const released = systemsReleased(snapshot);
  const [now] = useState(() => Date.now());
  const [view, setView] = useState<AgencyView>("clients");
  const [libraryOpened, setLibraryOpened] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Every read below is stored with the key it was made for, so a change of
  // agency or a retry shows loading without resetting state inside an effect.
  const clientsKey = `${snapshot.workspaceId}:${attempt}`;
  const [storedClients, setStoredClients] = useState<{ key: string; state: ClientsState } | null>(null);
  const [storedCredits, setStoredCredits] = useState<{ key: string; periods: AgencyCreditPeriod[] } | null>(null);
  const [storedApplications, setStoredApplications] = useState<{ key: string; drafts: AgencyApplicationDraftWork[] | null; error: string } | null>(null);
  const [storedWebsites, setStoredWebsites] = useState<{ key: string; drafts: AgencyManagedWebsiteDraftWork[] | null; error: string } | null>(null);
  const clients: ClientsState = storedClients?.key === clientsKey ? storedClients.state : { status: "loading" };
  const credits = storedCredits?.key === snapshot.workspaceId ? storedCredits.periods : [];
  const applicationDrafts = storedApplications?.key === snapshot.workspaceId ? storedApplications.drafts : null;
  const applicationDraftError = storedApplications?.key === snapshot.workspaceId ? storedApplications.error : "";
  const websiteDrafts = storedWebsites?.key === snapshot.workspaceId ? storedWebsites.drafts : null;
  const websiteDraftError = storedWebsites?.key === snapshot.workspaceId ? storedWebsites.error : "";

  /** Changes the ready client state only while it still belongs to the current read. */
  const updateClients = (key: string, change: (state: Extract<ClientsState, { status: "ready" }>) => ClientsState) => {
    setStoredClients((stored) => stored?.key === key && stored.state.status === "ready" ? { key, state: change(stored.state) } : stored);
  };

  // One request for the first page of every client. Later pages only on "Show more clients".
  useEffect(() => {
    const controller = new AbortController();
    if (!canUseTools) return () => controller.abort();
    void loadAgencyClients(request, snapshot.workspaceId, { signal: controller.signal }).then((page) => {
      if (!controller.signal.aborted) setStoredClients({ key: clientsKey, state: { status: "ready", pages: [{ cursor: null, page }], loadingMore: false, moreError: false, retrying: new Set() } });
    }).catch(() => {
      if (!controller.signal.aborted) setStoredClients({ key: clientsKey, state: { status: "error" } });
    });
    return () => controller.abort();
  }, [request, snapshot.workspaceId, canUseTools, clientsKey]);

  const combined = clients.status === "ready" ? combineAgencyPages(clients.pages) : null;

  const loadMore = () => {
    if (clients.status !== "ready" || clients.loadingMore) return;
    const cursor = combineAgencyPages(clients.pages).nextCursor;
    if (!cursor) return;
    const key = clientsKey;
    updateClients(key, (state) => ({ ...state, loadingMore: true, moreError: false }));
    void loadAgencyClients(request, snapshot.workspaceId, { cursor }).then((page) => {
      updateClients(key, (state) => ({ ...state, pages: [...state.pages, { cursor, page }], loadingMore: false }));
    }).catch(() => {
      updateClients(key, (state) => ({ ...state, loadingMore: false, moreError: true }));
    });
  };

  /** A client that could not be loaded is retried by refetching the page it came from. */
  const retryPage = (pageIndex: number) => {
    if (clients.status !== "ready") return;
    const target = clients.pages[pageIndex];
    if (!target || clients.retrying.has(pageIndex)) return;
    const key = clientsKey;
    updateClients(key, (state) => ({ ...state, retrying: new Set([...state.retrying, pageIndex]) }));
    const settle = (page: AgencyLoadedPage["page"] | null) => updateClients(key, (state) => {
      const retrying = new Set(state.retrying);
      retrying.delete(pageIndex);
      const pages = page ? state.pages.map((item, index) => index === pageIndex ? { cursor: target.cursor, page } : item) : state.pages;
      return { ...state, pages, retrying };
    });
    void loadAgencyClients(request, snapshot.workspaceId, { cursor: target.cursor }).then(settle).catch(() => settle(null));
  };

  useEffect(() => {
    const controller = new AbortController();
    const key = snapshot.workspaceId;
    if (!canUseTools) return () => controller.abort();
    void request(`/api/work-allowances?workspaceId=${encodeURIComponent(key)}`, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) return null;
      return response.json() as Promise<WorkAllowanceInspection>;
    }).then((value) => {
      if (!controller.signal.aborted) setStoredCredits({ key, periods: value?.policy?.contributionPayouts === false ? agencyCreditPeriods(value) : [] });
    }).catch(() => undefined);
    return () => controller.abort();
  }, [canUseTools, request, snapshot.workspaceId]);

  useEffect(() => {
    const controller = new AbortController();
    const key = snapshot.workspaceId;
    if (!canUseTools) return () => controller.abort();
    void request(`/api/agency-website-draft-access?agencyWorkspaceId=${encodeURIComponent(key)}`, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    }).then(async (response) => {
      const value = await response.json().catch(() => null) as { websites?: AgencyManagedWebsiteDraftWork[]; error?: unknown } | null;
      if (!response.ok) {
        const detail = typeof value?.error === "string" ? value.error : "Assigned website drafts could not be loaded.";
        throw new Error(detail);
      }
      if (!controller.signal.aborted) setStoredWebsites({ key, drafts: value?.websites ?? [], error: "" });
    }).catch((cause) => {
      if (!controller.signal.aborted) setStoredWebsites({ key, drafts: null, error: cause instanceof Error ? cause.message : "Assigned website drafts could not be loaded." });
    });
    return () => controller.abort();
  }, [canUseTools, request, snapshot.workspaceId]);

  useEffect(() => {
    const controller = new AbortController();
    const key = snapshot.workspaceId;
    if (!canUseTools) return () => controller.abort();
    void request(`/api/agency-applications?agencyWorkspaceId=${encodeURIComponent(key)}`, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    }).then(async (response) => {
      const value = await response.json().catch(() => null) as { applications?: AgencyApplicationDraftWork[]; error?: unknown } | null;
      if (!response.ok) throw new Error(typeof value?.error === "string" ? value.error : "Assigned application drafts could not be loaded.");
      if (!controller.signal.aborted) setStoredApplications({ key, drafts: value?.applications ?? [], error: "" });
    }).catch((cause) => {
      if (!controller.signal.aborted) setStoredApplications({ key, drafts: null, error: cause instanceof Error ? cause.message : "Assigned application drafts could not be loaded." });
    });
    return () => controller.abort();
  }, [canUseTools, request, snapshot.workspaceId]);

  const readyApplicationDrafts = applicationDrafts ?? [];
  const readyWebsiteDrafts = websiteDrafts ?? [];
  const retry = () => setAttempt((value) => value + 1);
  const oldestQueueWait = combined?.queue.length ? Math.max(...combined.queue.map((item) => daysWaiting(item.since, now) ?? 0)) : null;

  const clientList = clients.status === "loading" ? <AgencyClientsLoading />
    : clients.status === "error" ? <AgencyClientsError onRetry={retry} />
    : <AgencyClientList
        clients={combined!.clients}
        total={combined!.total}
        agencyName={agencyName}
        hasMore={Boolean(combined!.nextCursor)}
        loadingMore={clients.loadingMore}
        moreError={clients.moreError}
        retrying={clients.retrying}
        now={now}
        onOpen={onWorkspace}
        onRetryPage={retryPage}
        onMore={loadMore}
      />;

  const queueList = clients.status === "loading" ? <p role="status" className="border-y border-gray-border py-5 text-[13px] text-gray-muted">Checking work across clients…</p>
    : clients.status === "error" ? <AgencyClientsError onRetry={retry} />
    : <AgencyQueueList items={combined!.queue} now={now} onWorkspace={onWorkspace} onOpenClientWork={onOpenClientWork} />;

  const serviceRequests = <section aria-labelledby={`${id}-service-requests`}>
    <h2 id={`${id}-service-requests`} className={sectionTitle}>Service requests</h2>
    <p className={sectionNote}>Review requests addressed to {agencyName}. A response records review and does not start work.</p>
    <div className="mt-5"><ServiceRequestInbox providerWorkspaceId={snapshot.workspaceId} surface="workspace" /></div>
  </section>;

  const applicationDraftSection = <section aria-labelledby={`${id}-application-drafts`}>
    <h2 id={`${id}-application-drafts`} className={sectionTitle}>{released ? "Internal-tool drafts for clients" : "Assigned application drafts"}</h2>
    <p className={sectionNote}>{released ? "Open only the client tool named by an active customer delivery." : "Open only the installed application named by an active customer delivery."} Editing appears after the customer grants it.</p>
    {applicationDrafts === null && !applicationDraftError ? <p role="status" className="mt-4 text-[13px] text-gray-muted">Checking assigned application drafts…</p> : applicationDraftError ? <p role="alert" className="mt-4 text-[13px] text-critical">{applicationDraftError}</p> : readyApplicationDrafts.length ? <ul className="mt-4 divide-y divide-gray-border border-y border-gray-border">{readyApplicationDrafts.map((draft) => {
      const editable = draft.draftGrantStatus === "active" && Boolean(draft.draftGrantExpiresAt) && Date.parse(draft.draftGrantExpiresAt!) > now;
      return <li key={`${draft.assignmentId}:${draft.applicationWorkId}`} className="flex items-center gap-4 px-2 py-4"><FileText className="shrink-0 text-accent-text" size={18} aria-hidden="true" /><span className="min-w-0 flex-1"><strong className="block truncate text-[14px] font-medium text-warm-black">{draft.applicationTitle}</strong><small className="mt-1 block text-[12px] text-gray-muted">{draft.customerWorkspaceName} · {editable ? "Draft editing granted" : "Waiting for customer draft-edit permission"}</small></span><a className="shrink-0 text-[13px] text-warm-black underline" href={`/agency-applications/${encodeURIComponent(draft.applicationWorkId)}`}>Open draft</a></li>;
    })}</ul> : <p className="mt-4 border-y border-gray-border py-5 text-[13px] text-gray-muted">No accepted agency application delivery is assigned to you.</p>}
  </section>;

  const websiteDraftSection = <section aria-labelledby={`${id}-website-drafts`}>
    <h2 id={`${id}-website-drafts`} className={sectionTitle}>{released ? "Website possibilities for clients" : "Assigned website drafts"}</h2>
    <p className={sectionNote}>{released ? "Prepare a possibility on the exact client website named by an active delivery. Preparation appears only after the customer grants it; it stays a possibility until the customer makes it real." : "Open the exact managed website named by an active customer delivery. Preparation appears only after the customer grants it; publishing stays with the customer."}</p>
    {websiteDrafts === null && !websiteDraftError ? <p role="status" className="mt-4 text-[13px] text-gray-muted">Checking assigned website drafts…</p> : websiteDraftError ? <p role="alert" className="mt-4 text-[13px] text-critical">{websiteDraftError}</p> : readyWebsiteDrafts.length ? <ul className="mt-4 divide-y divide-gray-border border-y border-gray-border">{readyWebsiteDrafts.map((draft) => {
      const permission = draft.draftGrantStatus === "active" ? "Draft preparation granted" : "Waiting for customer draft permission";
      return <li key={`${draft.assignmentId}:${draft.managedWebsiteBindingId}`} className="flex items-center gap-4 px-2 py-4"><Globe2 className="shrink-0 text-accent-text" size={18} aria-hidden="true" /><span className="min-w-0 flex-1"><strong className="block truncate text-[14px] font-medium text-warm-black">{draft.siteName}</strong><small className="mt-1 block text-[12px] text-gray-muted">{draft.customerWorkspaceName} · {permission}</small></span><a className="shrink-0 text-[13px] text-warm-black underline" href={`/agency-websites/${encodeURIComponent(draft.managedWebsiteBindingId)}`}>Open website</a></li>;
    })}</ul> : <p className="mt-4 border-y border-gray-border py-5 text-[13px] text-gray-muted">No accepted agency website delivery is assigned to you.</p>}
  </section>;

  const accessNote = <div className="mt-3 flex items-start gap-3 border-y border-gray-border py-5 text-[13px] leading-relaxed text-gray-muted"><Users className="mt-0.5 shrink-0" size={17} aria-hidden="true" /><p>Use People &amp; access in the workspace navigation to review the agency’s handoffs and sharing. A customer’s access remains controlled from that customer’s workspace.</p></div>;

  const privateWork = <section className="mt-12" aria-labelledby={`${id}-private`}>
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-gray-border pb-3">
      <div><h2 id={`${id}-private`} className={sectionTitle}>Private agency work</h2><p className={sectionNote}>Drafts and methods stay in {agencyName} until you hand specific work to a customer.</p></div>
      <button type="button" onClick={onStart} className="inline-flex min-h-11 items-center gap-2 text-[13px] font-medium text-warm-black">Start private work<ArrowRight size={15} aria-hidden="true" /></button>
    </div>
    {snapshot.work.length ? <ul>{snapshot.work.slice(0, 6).map((work) => <li key={work.id} className="border-b border-gray-border">
      <button type="button" className="flex min-h-16 w-full items-center gap-4 px-2 py-4 text-left hover:bg-surface" onClick={() => onOpenWork(work.id)}>
        <FileText className="shrink-0 text-accent-text" size={18} aria-hidden="true" />
        <span className="min-w-0 flex-1"><strong className="block truncate text-[14px] font-medium text-warm-black">{work.title}</strong><small className="mt-1 block text-[12px] text-gray-muted">{workLabel(work, released)} · Private to this agency workspace</small></span>
        <ArrowRight className="shrink-0 text-gray-muted" size={16} aria-hidden="true" />
      </button>
    </li>)}</ul> : <div className="flex items-start gap-3 border-b border-gray-border py-5 text-[13px] leading-relaxed text-gray-muted"><BriefcaseBusiness className="mt-0.5 shrink-0" size={17} aria-hidden="true" /><p>No private agency work has been saved yet.</p></div>}
    <p className="mt-3 text-[12px] leading-relaxed text-gray-muted">{released ? "Ready-made systems are set up and managed from the customer business that owns them. This agency workspace does not hold a private catalog yet." : "Business offerings are installed and managed from the customer business that owns them. This agency workspace does not currently hold a private offering catalog."}</p>
  </section>;

  const creditSection = credits.length ? <section className="mt-12" aria-labelledby={`${id}-credits`}>
    <div className="flex items-center gap-3"><Coins className="text-accent-text" size={18} aria-hidden="true" /><h2 id={`${id}-credits`} className={sectionTitle}>Awarded contribution credits</h2></div>
    <ul className="mt-3 divide-y divide-gray-border border-y border-gray-border">{credits.map((period) => <li key={period.id} className="py-4"><strong className="text-[13px] font-medium text-warm-black">{period.units.map((unit) => unitLabel(unit.unitKind, unit.creditedUnits)).join(" · ")}</strong><small className="mt-1 block text-[12px] text-gray-muted">{periodLabel(period)}</small></li>)}</ul>
    <p className="mt-3 text-[12px] leading-relaxed text-gray-muted">These are recorded work-allowance units, not cash payments.</p>
  </section> : null;

  const header = <header className="max-w-2xl border-b border-gray-border pb-8">
    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent-text">{agencyName}</p>
    <h1 className="mt-3 font-display text-[28px] font-medium leading-tight text-warm-black sm:text-[32px]">Client work</h1>
    <p className="mt-3 text-[14px] leading-relaxed text-gray-muted">Each client is shown with the access you have in that business. Customers keep ownership and control access.</p>
    {canUseTools && snapshot.releases?.agencySetup ? <a href={`/workspace/agency/start?workspaceId=${encodeURIComponent(snapshot.workspaceId)}`} className="mt-4 inline-flex min-h-11 items-center gap-2 text-[13px] font-medium text-warm-black underline-offset-4 hover:underline">Agency setup and verification<ArrowRight size={15} aria-hidden="true" /></a> : null}
    {canUseTools && snapshot.releases?.agencyProspecting && <a href={`/workspace/prospects?workspace=${encodeURIComponent(snapshot.workspaceId)}`} className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm text-warm-black underline">View prospects<ArrowRight size={16} aria-hidden="true" /></a>}
    {combined ? <p className="mt-4 font-mono text-[12px] tabular-nums text-warm-black" aria-live="polite">
      {combined.total} {combined.total === 1 ? "client" : "clients"} · {combined.queue.length} {released ? "in the queue" : "need attention"}{oldestQueueWait ? ` · oldest waiting ${oldestQueueWait} ${oldestQueueWait === 1 ? "day" : "days"}` : ""}
    </p> : null}
  </header>;

  if (!canUseTools) {
    return <div className="mx-auto w-full max-w-5xl px-6 py-10 sm:px-8 lg:px-12" aria-busy={busy || undefined}>
      {header}
      <p className="border-b border-gray-border py-5 text-[13px] leading-relaxed text-gray-muted">{agencyName} shared some work with you to read. Clients, the queue and agency tools are for members of {agencyName}.</p>
      {privateWork}
    </div>;
  }

  if (!released) {
    return <div className="mx-auto w-full max-w-5xl px-6 py-10 sm:px-8 lg:px-12" aria-busy={busy || clients.status === "loading" || undefined}>
      {header}
      <div className="mt-10">{serviceRequests}</div>
      <div className="mt-10">{applicationDraftSection}</div>
      <div className="mt-10">{websiteDraftSection}</div>
      <section className="mt-10" aria-labelledby={`${id}-attention`}>
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
          <div>
            <h2 id={`${id}-attention`} className={sectionTitle}>Needs attention across clients</h2>
            <p className={sectionNote}>Oldest first. Each item opens the client’s own work.</p>
          </div>
          {clients.status === "ready" ? <button type="button" className="inline-flex min-h-11 items-center gap-2 text-[13px] text-gray-muted underline-offset-4 hover:text-warm-black hover:underline" onClick={retry}><RefreshCw size={14} aria-hidden="true" />Refresh</button> : null}
        </div>
        {queueList}
      </section>
      <section className="mt-12" aria-labelledby={`${id}-clients`}>
        <div className="pb-3"><h2 id={`${id}-clients`} className={sectionTitle}>Clients</h2><p className={sectionNote}>Opening a client keeps you inside the access that customer granted.</p></div>
        {clientList}
      </section>
      {privateWork}
      <section className="mt-12" aria-labelledby={`${id}-access`}>
        <h2 id={`${id}-access`} className={sectionTitle}>Team and access</h2>
        {accessNote}
      </section>
      {creditSection}
    </div>;
  }

  const tab = (value: AgencyView) => ({ id: `${id}-${value}-tab`, panelId: `${id}-${value}-panel` });
  const choose = (value: string) => {
    const next = value as AgencyView;
    if (next === "library") setLibraryOpened(true);
    setView(next);
  };

  return <div className="mx-auto w-full max-w-5xl px-6 py-10 sm:px-8 lg:px-12" aria-busy={busy || clients.status === "loading" || undefined}>
    {header}
    <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
      <Tabs
        aria-label="Agency views"
        variant="segment"
        value={view}
        onChange={choose}
        items={[
          { value: "clients", label: "Clients", ...tab("clients") },
          { value: "queue", label: "Queue", ...tab("queue") },
          { value: "library", label: "Library", ...tab("library") },
          { value: "team", label: "Team", ...tab("team") },
          ...(current?.role === "owner" || current?.role === "admin" ? [{ value: "build", label: "Build", ...tab("build") }, { value: "package", label: "Package", ...tab("package") }] : []),
        ]}
      />
      {clients.status === "ready" ? <button type="button" className="inline-flex min-h-11 items-center gap-2 text-[13px] text-gray-muted underline-offset-4 hover:text-warm-black hover:underline" onClick={retry}><RefreshCw size={14} aria-hidden="true" />Refresh</button> : null}
    </div>

    <TabsPanel id={tab("clients").panelId} tabId={tab("clients").id} active={view === "clients"} className="mt-6 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-text">
      {clientList}
    </TabsPanel>

    <TabsPanel id={tab("queue").panelId} tabId={tab("queue").id} active={view === "queue"} className="mt-6 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-text">
      <p className="mb-4 text-[12px] text-gray-muted">Oldest first. Each item opens the client’s own System or work, never a copy.</p>
      {queueList}
      {combined?.queueGaps.length ? <div role="alert" className="mt-4 text-sm text-critical"><p>This Queue is incomplete. Some sources could not be read.</p><ul className="mt-2 list-disc pl-5">{combined.queueGaps.map(gap => <li key={gap}>{gap}</li>)}</ul></div> : null}
      <div className="mt-12 space-y-10">
        {serviceRequests}
        {applicationDraftSection}
        {websiteDraftSection}
      </div>
    </TabsPanel>

    <TabsPanel id={tab("library").panelId} tabId={tab("library").id} active={view === "library"} className="mt-6 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-text">
      <p className="mb-6 max-w-2xl text-[12px] leading-relaxed text-gray-muted">Sources {agencyName} keeps, and where each client’s Version stands against the latest revision. Nothing reaches a client until its owner approves.</p>
      {libraryOpened ? <AgencyLibraryView request={request} agencyWorkspaceId={snapshot.workspaceId} onWorkspace={onWorkspace} /> : null}
      {libraryOpened && (current?.role === "owner" || current?.role === "admin") ? <AgencyVersionCreate request={request} agencyWorkspaceId={snapshot.workspaceId} clients={combined?.clients ?? []} /> : null}
    </TabsPanel>

    <TabsPanel id={tab("team").panelId} tabId={tab("team").id} active={view === "team"} className="mt-6 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-text">
      {view === "team" ? <AgencyTeamView key={snapshot.workspaceId} workspaceId={snapshot.workspaceId} /> : null}
      {accessNote}
    </TabsPanel>

    {(view === "build" || view === "package") && (current?.role === "owner" || current?.role === "admin") ? <TabsPanel id={tab(view).panelId} tabId={tab(view).id} active className="mt-6"><AgencyAuthoring request={request} snapshot={snapshot} clients={combined?.clients ?? []} kind={view} onOpenClientWork={onOpenClientWork} /></TabsPanel> : null}
    {privateWork}
    {creditSection}
  </div>;
}
