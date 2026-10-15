"use client";

import { AgencyClientSites } from "@/experience/connected-sites/AgencyClientSites";
import { AgencyProposals } from "./agency/AgencyProposals";

import { ArrowRight, BriefcaseBusiness, Coins, FileText, Globe2, RefreshCw, Users } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
import type { WorkAllowanceInspection } from "@/platform/work-economics/allowances";
import type { AgencyApplicationDraftWork, AgencyManagedWebsiteDraftWork } from "@/platform/offerings";
import { Tabs, TabsPanel } from "@/components/ui/Tabs";
import { ServiceRequestInbox } from "@/experience/operations/ServiceRequestInbox";
import type { WorkspaceSnapshot, WorkspaceWork } from "./contracts";
import { useWorkspaceRequest } from "./WorkspaceRequest";
import { systemsReleased } from "@/experience/systems/model";
import { loadAgencyClients } from "./agency-clients";
import {
  agencyCreditPeriods,
  combineAgencyPages,
  type AgencyCreditPeriod,
  type AgencyLoadedPage,
} from "./agency-home";
import { AgencyClientList, AgencyClientsError, AgencyClientsLoading, AgencyQueueList } from "./agency/AgencyViews";
import { AgencyAuthoring } from "./agency/AgencyAuthoring";
import { ProviderClientQueue } from "./agency/ProviderClientQueue";
import { AgencyTeamView } from "./agency/AgencyTeamView";
import { AgencyBrandEditor } from "./agency/AgencyBrandEditor";
import { AgencyLibraryView } from "./agency/AgencyLibraryView";
import { AgencyVersionCreate } from "./agency/AgencyVersionCreate";

import { StComposerBar, StComposerDock, StHead, StMono, StNotice, StPage, StPill, StPillLink, StSection, StTextButton } from "@/components/ui/strelva/Kit";
import type { AgencyLastGoodRead } from "./agency/AgencyViews";
import { AgencyCareReports } from "@/experience/care-reports/AgencyCareReports";

type ClientsState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; pages: AgencyLoadedPage[]; loadingMore: boolean; moreError: boolean; retrying: ReadonlySet<number> };

export type AgencyView = "home" | "clients" | "queue" | "library" | "team" | "build" | "package";

/** Last successful rows are held in component state and never cross agency scope. */
function rememberReads(previous: ReadonlyMap<string, AgencyLastGoodRead>, pages: readonly AgencyLoadedPage[]): Map<string, AgencyLastGoodRead> {
  const reads = new Map(previous);
  const readAt = new Date().toISOString();
  for (const { page } of pages) for (const client of page.clients) if (client.status === "ready") {
    if (reads.get(client.workspaceId)?.client !== client) reads.set(client.workspaceId, { client, readAt });
  }
  return reads;
}

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
  view: controlledView,
  onViewChange,
}: {
  snapshot: WorkspaceSnapshot;
  busy: boolean;
  onWorkspace: (workspaceId: string) => void;
  onOpenClientWork: (workspaceId: string, workId: string) => void;
  onOpenWork: (workId: string) => void;
  onStart: (request?: string) => void;
  view?: AgencyView;
  onViewChange?: (view: AgencyView) => void;
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
  const [localView, setView] = useState<AgencyView>(() => {
    if (typeof window === "undefined") return "home";
    const selected = new URLSearchParams(window.location.search).get("agencyView");
    return ["home", "clients", "queue", "library", "team", "build", "package"].includes(selected || "") ? selected as AgencyView : "home";
  });
  const view = released ? controlledView ?? localView : "clients";
  const [ask, setAsk] = useState("");
  const [libraryOpened, setLibraryOpened] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Every read below is stored with the key it was made for, so a change of
  // agency or a retry shows loading without resetting state inside an effect.
  const clientsKey = `${snapshot.workspaceId}:${attempt}`;
  const [storedClients, setStoredClients] = useState<{ key: string; state: ClientsState; lastGoodReads: Map<string, AgencyLastGoodRead> } | null>(null);
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
    setStoredClients(stored => {
      if (stored?.key !== key || stored.state.status !== "ready") return stored;
      const state = change(stored.state);
      return { key, state, lastGoodReads: state.status === "ready" ? rememberReads(stored.lastGoodReads, state.pages) : stored.lastGoodReads };
    });
  };

  // One request for the first page of every client. Later pages only on "Show more clients".
  useEffect(() => {
    const controller = new AbortController();
    if (!canUseTools) return () => controller.abort();
    void loadAgencyClients(request, snapshot.workspaceId, { signal: controller.signal }).then((page) => {
      if (!controller.signal.aborted) setStoredClients(stored => ({ key: clientsKey, state: { status: "ready", pages: [{ cursor: null, page }], loadingMore: false, moreError: false, retrying: new Set() }, lastGoodReads: rememberReads(stored?.key.startsWith(`${snapshot.workspaceId}:`) ? stored.lastGoodReads : new Map(), [{ cursor: null, page }]) }));
    }).catch(() => {
      if (!controller.signal.aborted) setStoredClients(stored => ({ key: clientsKey, state: { status: "error" }, lastGoodReads: stored?.key.startsWith(`${snapshot.workspaceId}:`) ? stored.lastGoodReads : new Map() }));
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

  const clientList = clients.status === "loading" ? <AgencyClientsLoading />
    : clients.status === "error" ? <AgencyClientsError onRetry={retry} />
    : <AgencyClientList
        clients={combined!.clients}
        agencyWorkspaceId={snapshot.workspaceId}
        viewerEmail={snapshot.actor.email}
        canManage={current?.role === "owner" || current?.role === "admin"}
        request={request}
        lastGoodReads={storedClients?.key.startsWith(`${snapshot.workspaceId}:`) ? storedClients.lastGoodReads : undefined}
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
    : <AgencyQueueList complete={combined!.queueComplete} items={combined!.queue} now={now} onWorkspace={onWorkspace} onOpenClientWork={onOpenClientWork} />;

  const serviceRequests = <section aria-labelledby={`${id}-service-requests`}>
    <h2 id={`${id}-service-requests`} className={sectionTitle}>Service requests</h2>
    <p className={sectionNote}>Review requests addressed to {agencyName}. A response records review and does not start work.</p>
    <div className="mt-5"><ServiceRequestInbox providerWorkspaceId={snapshot.workspaceId} surface="workspace" /></div>
  </section>;

  const applicationDraftSection = <section aria-labelledby={`${id}-application-drafts`}>
    <h2 id={`${id}-application-drafts`} className={sectionTitle}>{released ? "Internal-tool drafts for clients" : "Assigned application drafts"}</h2>
    <p className={sectionNote}>{released ? "Open only the client tool named by an active client delivery." : "Open only the installed application named by an active client delivery."} Editing appears after the client grants it.</p>
    {applicationDrafts === null && !applicationDraftError ? <p role="status" className="mt-4 text-[13px] text-gray-muted">Checking assigned application drafts…</p> : applicationDraftError ? <p role="alert" className="mt-4 text-[13px] text-critical">{applicationDraftError}</p> : readyApplicationDrafts.length ? <ul className="mt-4 divide-y divide-gray-border border-y border-gray-border">{readyApplicationDrafts.map((draft) => {
      const editable = draft.draftGrantStatus === "active" && Boolean(draft.draftGrantExpiresAt) && Date.parse(draft.draftGrantExpiresAt!) > now;
      return <li key={`${draft.assignmentId}:${draft.applicationWorkId}`} className="flex items-center gap-4 px-2 py-4"><FileText className="shrink-0 text-accent-text" size={18} aria-hidden="true" /><span className="min-w-0 flex-1"><strong className="block truncate text-[14px] font-medium text-warm-black">{draft.applicationTitle}</strong><small className="mt-1 block text-[12px] text-gray-muted">{draft.customerWorkspaceName} · {editable ? "Draft editing granted" : "Waiting for client draft-edit permission"}</small></span><a className="shrink-0 text-[13px] text-warm-black underline" href={`/agency-applications/${encodeURIComponent(draft.applicationWorkId)}`}>Open draft</a></li>;
    })}</ul> : <p className="mt-4 border-y border-gray-border py-5 text-[13px] text-gray-muted">No accepted agency application delivery is assigned to you.</p>}
  </section>;

  const websiteDraftSection = <section aria-labelledby={`${id}-website-drafts`}>
    <h2 id={`${id}-website-drafts`} className={sectionTitle}>{released ? "Website possibilities for clients" : "Assigned website drafts"}</h2>
    <p className={sectionNote}>{released ? "Prepare a possibility on the exact client website named by an active delivery. Preparation appears only after the client grants it; it stays a possibility until the client makes it real." : "Open the exact managed website named by an active client delivery. Preparation appears only after the client grants it; publishing stays with the client."}</p>
    {websiteDrafts === null && !websiteDraftError ? <p role="status" className="mt-4 text-[13px] text-gray-muted">Checking assigned website drafts…</p> : websiteDraftError ? <p role="alert" className="mt-4 text-[13px] text-critical">{websiteDraftError}</p> : readyWebsiteDrafts.length ? <ul className="mt-4 divide-y divide-gray-border border-y border-gray-border">{readyWebsiteDrafts.map((draft) => {
      const permission = draft.draftGrantStatus === "active" ? "Draft preparation granted" : "Waiting for client draft permission";
      return <li key={`${draft.assignmentId}:${draft.managedWebsiteBindingId}`} className="flex items-center gap-4 px-2 py-4"><Globe2 className="shrink-0 text-accent-text" size={18} aria-hidden="true" /><span className="min-w-0 flex-1"><strong className="block truncate text-[14px] font-medium text-warm-black">{draft.siteName}</strong><small className="mt-1 block text-[12px] text-gray-muted">{draft.customerWorkspaceName} · {permission}</small></span><a className="shrink-0 text-[13px] text-warm-black underline" href={`/agency-websites/${encodeURIComponent(draft.managedWebsiteBindingId)}`}>Open website</a></li>;
    })}</ul> : <p className="mt-4 border-y border-gray-border py-5 text-[13px] text-gray-muted">No accepted agency website delivery is assigned to you.</p>}
  </section>;

  const accessNote = <div className="mt-3 flex items-start gap-3 border-y border-gray-border py-5 text-[13px] leading-relaxed text-gray-muted"><Users className="mt-0.5 shrink-0" size={17} aria-hidden="true" /><p>Use People &amp; access in the workspace navigation to review the agency’s handoffs and sharing. A client’s access remains controlled from that client’s workspace.</p></div>;

  const privateWork = <section className="mt-12" aria-labelledby={`${id}-private`}>
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-gray-border pb-3">
      <div><h2 id={`${id}-private`} className={sectionTitle}>Private agency work</h2><p className={sectionNote}>Drafts and methods stay in {agencyName} until you hand specific work to a client.</p></div>
      <button type="button" onClick={() => onStart()} className="inline-flex min-h-11 items-center gap-2 text-[13px] font-medium text-warm-black">Start private work<ArrowRight size={15} aria-hidden="true" /></button>
    </div>
    {snapshot.work.length ? <ul>{snapshot.work.slice(0, 6).map((work) => <li key={work.id} className="border-b border-gray-border">
      <button type="button" className="flex min-h-16 w-full items-center gap-4 px-2 py-4 text-left hover:bg-surface" onClick={() => onOpenWork(work.id)}>
        <FileText className="shrink-0 text-accent-text" size={18} aria-hidden="true" />
        <span className="min-w-0 flex-1"><strong className="block truncate text-[14px] font-medium text-warm-black">{work.title}</strong><small className="mt-1 block text-[12px] text-gray-muted">{workLabel(work, released)} · Private to this agency workspace</small></span>
        <ArrowRight className="shrink-0 text-gray-muted" size={16} aria-hidden="true" />
      </button>
    </li>)}</ul> : <div className="flex items-start gap-3 border-b border-gray-border py-5 text-[13px] leading-relaxed text-gray-muted"><BriefcaseBusiness className="mt-0.5 shrink-0" size={17} aria-hidden="true" /><p>No private agency work has been saved yet.</p></div>}
    <p className="mt-3 text-[12px] leading-relaxed text-gray-muted">{released ? "Library holds your sources. Qualified releases you share appear in your clients’ Apps." : "Each client owns its Systems and records. Library is available when Systems are enabled for this agency."}</p>
  </section>;

  const creditSection = credits.length ? <section className="mt-12" aria-labelledby={`${id}-credits`}>
    <div className="flex items-center gap-3"><Coins className="text-accent-text" size={18} aria-hidden="true" /><h2 id={`${id}-credits`} className={sectionTitle}>Awarded contribution credits</h2></div>
    <ul className="mt-3 divide-y divide-gray-border border-y border-gray-border">{credits.map((period) => <li key={period.id} className="py-4"><strong className="text-[13px] font-medium text-warm-black">{period.units.map((unit) => unitLabel(unit.unitKind, unit.creditedUnits)).join(" · ")}</strong><small className="mt-1 block text-[12px] text-gray-muted">{periodLabel(period)}</small></li>)}</ul>
    <p className="mt-3 text-[12px] leading-relaxed text-gray-muted">These are recorded work-allowance units, not cash payments.</p>
  </section> : null;

  if (!canUseTools) return <StPage><StHead title="Clients" meta={agencyName} /><StNotice>{agencyName} shared some work with you to read. Clients, the queue and agency tools are for members of {agencyName}.</StNotice>{privateWork}</StPage>;

  const tab = (value: AgencyView) => ({ id: `${id}-${value}-tab`, panelId: `${id}-${value}-panel` });
  const choose = (value: string) => {
    const next = value as AgencyView;
    if (next === "library") setLibraryOpened(true);
    setView(next);
    onViewChange?.(next);
  };

  return <div aria-busy={busy || clients.status === "loading" || undefined}><StPage width={view === "home" || view === "clients" ? "wide" : "column"}>
    <StHead title={view === "home" ? agencyName : view === "clients" ? "Clients" : view === "queue" ? "Queue" : view === "library" ? "Library" : view === "team" ? "Team" : view === "build" ? "Build for a client" : "Prepare a release"} meta={<>{agencyName}{combined ? <> · {combined.total} {combined.total === 1 ? "client" : "clients"} · {combined.queue.length} client {combined.queue.length === 1 ? "item" : "items"} loaded{!combined.queueComplete ? " · Queue incomplete" : ""}</> : null}</>} actions={<>
      {snapshot.releases?.agencyAddClient ? <StPillLink variant={view === "clients" ? "primary" : "soft"} href={`/workspace/agency/clients/new?workspaceId=${encodeURIComponent(snapshot.workspaceId)}`}>Add a client</StPillLink> : null}
      {snapshot.releases?.agencyImportClients ? <StPillLink variant="soft" href={`/workspace/agency/clients/import?workspaceId=${encodeURIComponent(snapshot.workspaceId)}`}>Import clients</StPillLink> : null}
      {snapshot.releases?.agencySetup ? <StTextButton href={`/workspace/agency/start?workspaceId=${encodeURIComponent(snapshot.workspaceId)}`}>Verification</StTextButton> : null}
      {snapshot.releases?.agencyProspecting ? <StTextButton href={`/workspace/prospects?workspace=${encodeURIComponent(snapshot.workspaceId)}`}>Prospects</StTextButton> : null}
    </>} />
    <div className="flex flex-wrap items-center justify-between gap-3">
      {released && !controlledView ? <Tabs
        aria-label="Agency views"
        variant="segment"
        value={view}
        onChange={choose}
        items={[
          { value: "home", label: "Home", ...tab("home") },
          { value: "clients", label: "Clients", ...tab("clients") },
          { value: "queue", label: "Queue", ...tab("queue") },
          { value: "library", label: "Library", ...tab("library") },
          { value: "team", label: "Team", ...tab("team") },
          ...(current?.role === "owner" || current?.role === "admin" ? [{ value: "build", label: "Build", ...tab("build") }, { value: "package", label: "Package", ...tab("package") }] : []),
        ]}
      /> : null}
      {released && controlledView ? <div className="flex gap-4">{view === "home" ? <StPill variant="soft" onClick={() => choose("clients")}>View clients</StPill> : null}{current?.role === "owner" || current?.role === "admin" ? view === "home" || view === "clients" ? <StPill variant="soft" onClick={() => choose("build")}>Build for a client</StPill> : view === "library" ? <StPill variant="soft" onClick={() => choose("package")}>Prepare a release</StPill> : null : null}</div> : null}
      {clients.status === "ready" ? <button type="button" className="inline-flex min-h-11 items-center gap-2 text-[13px] text-gray-muted underline-offset-4 hover:text-warm-black hover:underline" onClick={retry}><RefreshCw size={14} aria-hidden="true" />Refresh</button> : null}
    </div>

    <AgencyPanel labelled={Boolean(controlledView) || !released} id={tab(view === "home" ? "home" : "clients").panelId} tabId={tab(view === "home" ? "home" : "clients").id} active={view === "home" || view === "clients"} className="mt-6 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-text">
      {clientList}
      {clients.status === "ready" && (view === "clients" || !released) ? <AgencyCareReports agencyWorkspaceId={snapshot.workspaceId} agencyName={agencyName} request={request} /> : null}
      {snapshot.releases?.keepYourSite && view === "clients" ? <AgencyClientSites agencyWorkspaceId={snapshot.workspaceId} request={request} /> : null}
      {!released ? <StSection title="Needs attention across clients">{queueList}<AgencyProposals key={snapshot.workspaceId} onAccepted={retry} agencyWorkspaceId={snapshot.workspaceId} agencyName={agencyName} canManage={current?.role === "owner" || current?.role === "admin"} transport={request} showListing={false} /><ProviderClientQueue workspaceId={snapshot.workspaceId} onWorkspace={onWorkspace} /></StSection> : null}
    </AgencyPanel>

    <AgencyPanel labelled={Boolean(controlledView) || !released} id={tab("queue").panelId} tabId={tab("queue").id} active={view === "queue"} className="mt-6 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-text">
      <AgencyProposals key={snapshot.workspaceId} onAccepted={retry} agencyWorkspaceId={snapshot.workspaceId} agencyName={agencyName} canManage={current?.role === "owner" || current?.role === "admin"} transport={request} showListing={false} />
      <p className="mb-4 text-sm text-gray-muted">Oldest first within each kind. Open the client’s own System or work.</p>
      {queueList}
      {combined ? <div className="flex flex-wrap items-center justify-between gap-3 pt-4"><StMono>Loaded {combined.clients.length} of {combined.total} clients</StMono>{combined.nextCursor ? <StPill variant="soft" busy={clients.status === "ready" && clients.loadingMore} onClick={loadMore}>Load more clients for Queue</StPill> : null}</div> : null}
      {clients.status === "ready" && clients.moreError ? <StNotice tone="critical">More clients could not be loaded. The Queue is incomplete.</StNotice> : null}
        <ProviderClientQueue workspaceId={snapshot.workspaceId} onWorkspace={onWorkspace} />
      {combined?.queueGaps.length ? <div role="alert" className="mt-4 text-sm text-critical"><p>This Queue is incomplete. Some sources could not be read.</p><ul className="mt-2 list-disc pl-5">{combined.queueGaps.map(gap => <li key={gap}>{gap}</li>)}</ul></div> : null}
      <div className="mt-12 space-y-10">
        {serviceRequests}
        {applicationDraftSection}
        {websiteDraftSection}
      </div>
    </AgencyPanel>

    <AgencyPanel labelled={Boolean(controlledView) || !released} id={tab("library").panelId} tabId={tab("library").id} active={view === "library"} className="mt-6 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-text">
      <p className="mb-6 max-w-2xl text-[12px] leading-relaxed text-gray-muted">Sources {agencyName} keeps, and where each client’s Version stands against the latest release. Nothing reaches a client until its owner approves.</p>
      {libraryOpened || view === "library" ? <AgencyLibraryView request={request} agencyWorkspaceId={snapshot.workspaceId} onWorkspace={onWorkspace} /> : null}
      {(libraryOpened || view === "library") && (current?.role === "owner" || current?.role === "admin") ? <AgencyVersionCreate request={request} agencyWorkspaceId={snapshot.workspaceId} clients={combined?.clients ?? []} /> : null}
    </AgencyPanel>

    <AgencyPanel labelled={Boolean(controlledView) || !released} id={tab("team").panelId} tabId={tab("team").id} active={view === "team"} className="mt-6 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-text">
      {view === "team" ? <AgencyTeamView key={snapshot.workspaceId} workspaceId={snapshot.workspaceId} /> : null}
      {view === "team" ? <AgencyProposals key={snapshot.workspaceId} onAccepted={retry} agencyWorkspaceId={snapshot.workspaceId} agencyName={agencyName} canManage={current?.role === "owner" || current?.role === "admin"} transport={request} listingOnly /> : null}
      {view === "team" && current?.role === "owner" ? <StSection id="agency-brand" title="Agency brand"><AgencyBrandEditor workspaceId={snapshot.workspaceId} request={request} /></StSection> : null}
      {accessNote}
    </AgencyPanel>

    {(view === "build" || view === "package") && (current?.role === "owner" || current?.role === "admin") ? <AgencyPanel labelled={Boolean(controlledView) || !released} id={tab(view).panelId} tabId={tab(view).id} active className="mt-6"><AgencyAuthoring request={request} snapshot={snapshot} clients={combined?.clients ?? []} kind={view} onOpenClientWork={onOpenClientWork} />{view === "build" && combined?.nextCursor ? <StPill variant="soft" busy={clients.status === "ready" && clients.loadingMore} onClick={loadMore}>Load more clients to build for</StPill> : null}</AgencyPanel> : null}
    <details className="mt-12"><summary className="min-h-11 cursor-pointer py-2 text-sm text-gray-muted focus-visible:outline-2 focus-visible:outline-offset-2">Private agency work and assignments</summary>{privateWork}{view !== "queue" ? <div className="mt-8 space-y-10">{serviceRequests}{applicationDraftSection}{websiteDraftSection}</div> : null}{!released ? <StSection title="Team and access">{accessNote}{current?.role === "owner" ? <StSection id="agency-brand" title="Agency brand"><AgencyBrandEditor workspaceId={snapshot.workspaceId} request={request} /></StSection> : null}</StSection> : null}</details>
    {creditSection}
  </StPage><StComposerDock><StComposerBar scope={agencyName} placeholder="Bring a client need and build it here" value={ask} onChange={setAsk} onSubmit={() => { onStart(ask); setAsk(""); }} /></StComposerDock></div>;
}

/** The shell owns navigation in the real workspace. Standalone embeds keep tabs. */
function AgencyPanel({ labelled, id, tabId, active, className, children }: { labelled: boolean; id: string; tabId: string; active: boolean; className?: string; children: ReactNode }) {
  if (!active) return null;
  return labelled ? <section id={id} aria-label={id.includes("home") ? "Home" : id.includes("queue") ? "Queue" : id.includes("library") ? "Library" : id.includes("team") ? "Team" : id.includes("build") ? "Build for a client" : id.includes("package") ? "Prepare a release" : "Clients"} className={className}>{children}</section> : <TabsPanel id={id} tabId={tabId} active className={className}>{children}</TabsPanel>;
}
