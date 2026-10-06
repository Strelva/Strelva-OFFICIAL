"use client";

import type { ReactNode } from "react";
import { ArrowRight, Bell, CheckCircle2, FileText, LayoutGrid, ListChecks, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StrelvaShell, pinnedApps, pinnedSystems, pinnedWebsites, type StrelvaSection } from "@/experience/app-frame/StrelvaShell";
import { SystemList } from "@/experience/systems/SystemList";
import { SYSTEMS_LABEL, SYSTEMS_LIST_LABEL, type SystemView } from "@/experience/systems/model";
import type { OfferingWebsiteBinding, OfferingWebsiteBindingCommand } from "@/platform/offerings";
import type { WorkspaceSnapshot, WorkspaceWork } from "./contracts";
import type { ManagedWorkSummary } from "./workspace-discovery";
import type { WorkspaceSearchItem } from "./workspace-search";
import { BusinessOfferingSummary, WebsiteAssignmentHandoff, type WorkspaceOfferingState } from "./WorkspaceOfferings";
import { WorkspaceAllowanceSummary } from "./WorkspaceAllowanceSummary";
import { WorkspaceComposer } from "./WorkspaceComposer";
import { requestDraftKey } from "./request-draft";
import { useBusinessDeliveries } from "./useBusinessDeliveries";
import { NeedsYouSection, StrelvaHandledSection } from "./NeedsYouSection";
import { useNeedsYou } from "./useNeedsYou";
import { SiteSummarySection, useSiteSummary } from "./SiteSummarySection";
import { workspaceHome } from "./workspace-home";
import { businessRequestRows, deliveryProviderName, type BusinessRequestRow } from "./WorkspaceRequests";
import { workspaceWorkLabel } from "./work-label";
import styles from "./business-home.module.css";

interface Props {
  appBase?: string;
  accountHref: string;
  onOfferings: (id?: string) => void;
  managedWorkUnavailable?: boolean;
  snapshot: WorkspaceSnapshot;
  sites: readonly ManagedWorkSummary[];
  unassignedSites: readonly ManagedWorkSummary[];
  siteAssignmentsKnown: boolean;
  offerings: WorkspaceOfferingState;
  busy: boolean;
  notice?: ReactNode;
  onOpen: (id: string) => void;
  onStart: () => void;
  onCreateWebsite?: () => void;
  onRequest?: (request: string) => void;
  onDraftChange?: (request: string) => void;
  /** Opens any workspace place or business-menu section. */
  onNavigate: (section: StrelvaSection) => void;
  onWorkspace: (id: string) => void;
  signOut?: ReactNode;
  onWebsiteCommand?: (command: OfferingWebsiteBindingCommand) => Promise<OfferingWebsiteBinding | null>;
  onRetryWebsiteAssignments?: () => void;
  /** The business's actual Systems (read adapter output). */
  systems?: readonly SystemView[];
  /** Saved results that are not Systems. Defaults to Home's recorded results. */
  files?: readonly WorkspaceWork[];
  systemHref?: (id: string) => string;
  onOpenSystem?: (id: string) => void;
  /** Still loading, so the System list is incomplete. */
  systemsLoading?: boolean;
  /** The server could not read this business's Systems. */
  systemsUnavailable?: boolean;
  /**
   * STRELVA_SYSTEMS_RELEASE, from the server's snapshot. Off (the default)
   * renders Home exactly as before the Systems model: no Systems header,
   * list or files split, and the website and apps pinned by name.
   */
  systemsReleased?: boolean;
}

/** The start and return surface, using the same frame as every saved result. */
export function BusinessHome({ snapshot, sites, unassignedSites, siteAssignmentsKnown, offerings, busy, notice, onOpen, onStart, onCreateWebsite, onRequest, onDraftChange, onNavigate, onWorkspace, onOfferings, appBase = "", accountHref, signOut, managedWorkUnavailable, onWebsiteCommand, onRetryWebsiteAssignments, files, systemHref, onOpenSystem, systemsLoading = false, systemsUnavailable = false, systems: knownSystems = [], systemsReleased = false }: Props) {
  // An incomplete list would misplace a System; show none until it loads.
  const systems = systemsReleased && !systemsLoading ? knownSystems : [];
  const current = snapshot.workspaces.find(space => space.id === snapshot.workspaceId);
  const readOnly = current?.access === "delegated_read";
  const name = current?.name || "Your business";
  const home = workspaceHome(snapshot.work);
  const deliveryScope = current?.kind === "customer" && !readOnly && ["owner", "admin"].includes(current.role || "") ? snapshot.workspaceId : undefined;
  const deliveries = useBusinessDeliveries(deliveryScope);
  const deliveryItems = deliveries.state.status === "ready" ? deliveries.state.items : [];
  const deliveryAttention = deliveryItems.filter(item => item.attention);
  // STRELVA_NEEDS_YOU_RELEASE: Needs you and Strelva handled come from the
  // policy model. Request decisions arrive there as items, so the delivery
  // list no longer adds its own.
  const needsYouReleased = snapshot.releases?.needsYou === true && current?.kind === "customer" && !readOnly;
  const needsYou = useNeedsYou(needsYouReleased ? snapshot.workspaceId : undefined);
  // Owner entry: the linked site's numbers, inquiries and Strelva's work (the old Today page).
  const siteSummary = useSiteSummary(current?.kind === "customer" && !readOnly ? snapshot.workspaceId : undefined);
  const attentionCount = home.attention.length + deliveryAttention.length;
  const fileIds = systemsReleased && files ? new Set(files.map(item => item.id)) : null;
  const results = fileIds ? home.results.filter(work => fileIds.has(work.id)) : home.results;
  const savedResultCount = results.length;
  // The Systems layout (header, Systems list, composer below) is for a business with Systems released.
  const business = systemsReleased && current?.kind === "customer";
  // Connected sites (the business's own site, any builder) open at /workspace/site when on for this business.
  const connectSiteHref = business && !readOnly && snapshot.releases?.connectedSites === true
    ? `${appBase}/workspace/site?${new URLSearchParams({ workspaceId: snapshot.workspaceId })}` : null;
  const openSystemHref = systemHref || ((id: string) => `${appBase}/workspace?view=system&system=${encodeURIComponent(id)}&workspaceId=${encodeURIComponent(snapshot.workspaceId)}`);
  const live = systems.filter(item => item.lifecycle === "live").length;
  const drafts = systems.filter(item => item.lifecycle === "draft").length;
  const paused = systems.filter(item => item.lifecycle === "paused").length;
  const agencyNames = new Map(snapshot.workspaces.filter(space => space.kind === "agency").map(space => [space.id, space.name]));
  const requestRows = businessRequestRows(deliveryItems, snapshot.work, item => deliveryProviderName(item, agencyNames));
  const handled = requestRows.filter(row => row.stage === "done").slice(0, 5);
  const inProgress = requestRows.filter(row => row.stage === "in_progress" || row.stage === "asked");
  // With Systems released, Strelva handled is the receipt feed, not done Requests,
  // and In progress also lists every Make real that is running or partly live.
  const receipts = systemsReleased ? snapshot.systems?.handled ?? [] : [];
  const making = systemsReleased ? snapshot.systems?.activations ?? [] : [];
  const receiptList = <ul className={styles.list} aria-label="What Strelva did this week">{receipts.slice(0, 7).map(receipt => <li key={receipt.id}><span className={styles.row}><span><strong>{receipt.sentence}</strong><small>{new Date(receipt.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {receipt.undo}</small></span></span></li>)}</ul>;
  const makingRows = making.map(activation => <li key={activation.id}><span className={styles.row}><span><strong>{activation.partlyLive ? `${activation.title}: Partly live` : activation.headline}</strong><small>{activation.done} of {activation.total} done</small></span></span></li>);
  /** Requests belong to a business. Personal workspaces only see these lists when something is in them. */
  const showRequests = current?.kind === "customer" || requestRows.length > 0;
  const deliveryPending = deliveries.state.status === "loading";
  const deliveryUnavailable = deliveries.state.status === "error";
  const workHref = (id: string) => `${appBase}/workspace?workspaceId=${encodeURIComponent(snapshot.workspaceId)}&work=${encodeURIComponent(id)}`;
  const searchItems: WorkspaceSearchItem[] = [
    { id: "action-new", title: "Start with an outcome", detail: "Tell Strelva what you want to make happen", href: `${appBase}/workspace?view=start&workspaceId=${encodeURIComponent(snapshot.workspaceId)}`, onOpen: onStart },
    systemsReleased
      ? { id: "action-explore", title: "Browse ready-made systems", detail: "Ready-made systems you can adapt", href: `${appBase}/workspace?view=products&workspaceId=${encodeURIComponent(snapshot.workspaceId)}`, onOpen: () => onNavigate("products") }
      : { id: "action-explore", title: "Get or build an app", detail: "Apps and templates you can adapt", href: `${appBase}/workspace?view=products&workspaceId=${encodeURIComponent(snapshot.workspaceId)}`, onOpen: () => onNavigate("products") },
    ...snapshot.work.map(work => ({ id: work.id, title: work.title, detail: workspaceWorkLabel(work), href: workHref(work.id), onOpen: () => onOpen(work.id) })),
    ...(systemsReleased
      ? systems.map(system => ({ id: `system-${system.id}`, title: system.name, detail: "System", href: openSystemHref(system.id), onOpen: onOpenSystem ? () => onOpenSystem(system.id) : undefined }))
      : sites.map(site => ({ id: `site-${site.id}`, title: site.title, detail: "Managed website", href: site.href }))),
    ...deliveryItems.map(item => ({ id: `delivery-${item.id}`, title: item.title, detail: item.detail, href: item.href })),
  ];
  const recentWork = results.map(work => ({ id: work.id, title: work.title, detail: workspaceWorkLabel(work), href: workHref(work.id), onOpen: () => onOpen(work.id) }));

  function requestRow(row: BusinessRequestRow) {
    const body = <><span><strong>{row.title}</strong><small>{row.detail}</small></span><ArrowRight size={16} aria-hidden="true" /></>;
    return <li key={row.id}>{row.href ? <a className={styles.row} href={row.href}>{body}</a> : <button type="button" aria-label={`Open ${row.title}`} className={styles.row} onClick={() => row.workId && onOpen(row.workId)}>{body}</button>}</li>;
  }

  function request(value: string) {
    if (readOnly || busy) return;
    if (onRequest) onRequest(value);
    else onStart();
  }
  return <StrelvaShell active="home" title={name} appBase={appBase} workspaceId={snapshot.workspaceId} accountName={snapshot.actor.email.split("@")[0] || "Your account"} accountDetail={snapshot.actor.email} signOut={signOut} onNavigate={onNavigate} onStart={onStart} startDisabled={readOnly || busy} searchItems={searchItems} searchScopeName={name} recentWork={recentWork} pinned={systemsReleased ? pinnedSystems(systems, openSystemHref, onOpenSystem) : [...pinnedWebsites(sites), ...pinnedApps(snapshot.work, workHref, onOpen)]} systemsReleased={systemsReleased} notice={notice} contentId="business-home-main"
    businessContext={<label><span className={styles.srOnly}>Current workspace</span><select aria-label="Current workspace" value={snapshot.workspaceId} disabled={busy} onChange={event => onWorkspace(event.target.value)}>{snapshot.workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}{workspace.access === "delegated_read" ? " · Read-only" : ""}</option>)}</select></label>}>
    <div className={styles.home} aria-busy={busy || undefined}>
      {business ? <header className={styles.businessHeader}>
        <p>{readOnly ? "Shared with you" : "Your business"}</p>
        <h1 className="font-display">{name}</h1>
        <p>{busy || systemsLoading ? "Checking your systems…" : systems.length ? [live ? `${live} live` : "", drafts ? `${drafts} in draft` : "", paused ? `${paused} paused` : ""].filter(Boolean).join(" · ") : readOnly ? `${name} shared this with your agency to review.` : "Strelva builds and runs your systems. You make the calls only you can make."}</p>
      </header> : <section className={styles.start} aria-labelledby="business-start-title">
        <header className={styles.greeting}>
          <p>{readOnly ? "Shared workspace" : name}</p>
          <h1 id="business-start-title" className="font-display">{readOnly ? "Review what was shared." : "What should happen next?"}</h1>
          <p>{readOnly ? `${name} shared this with your agency to review.` : "Start with the outcome. You do not need to pick a feature first."}</p>
        </header>
        {!readOnly ? <>
          <WorkspaceComposer key={`${snapshot.actor.email}:${snapshot.workspaceId}`} draftKey={requestDraftKey({ actorEmail: snapshot.actor.email, workspaceId: snapshot.workspaceId })} disabled={busy} onSubmit={request} onEdited={onDraftChange} onTemplates={() => onNavigate("products")} placeholder="What do you want Strelva to make happen?" systemsReleased={systemsReleased} />
          <div className={styles.contextLine} aria-label="Current Strelva context">
            <span>Working in <strong>{name}</strong></span>
            {systemsReleased ? <>
              {systems.length ? <span>{systems.length} {systems.length === 1 ? "system" : "systems"}</span> : null}
              {savedResultCount ? <span>{savedResultCount} saved {savedResultCount === 1 ? "file" : "files"}</span> : null}
            </> : <>
              {savedResultCount ? <span>{savedResultCount} saved {savedResultCount === 1 ? "result" : "results"}</span> : null}
              {sites.length ? <span>{sites.length} connected {sites.length === 1 ? "website" : "websites"}</span> : null}
            </>}
          </div>
          <div className={styles.starters} aria-label="Try asking Strelva">
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => request("Give my team a better way to submit and track requests.")}>Give my team a better way to request things</Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => request("Make sure customer follow-up does not fall through.")}>Fix customer follow-up</Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => request("Improve our website based on what customers need.")}>Improve our website</Button>
          </div>
        </> : null}
      </section>}

      {managedWorkUnavailable ? <p role="status" className={styles.notice}>Some websites could not be loaded. <a href={accountHref}>Check website access</a></p> : null}

      {needsYouReleased ? <NeedsYouSection state={needsYou.state} pending={needsYou.pending} notices={needsYou.notices} onDecide={needsYou.decide} onRetry={needsYou.refresh} appBase={appBase}
        extraCount={home.attention.length}
        extra={home.attention.length ? home.attention.map(({ work, reason }) => <li key={work.id}><button type="button" aria-label={`Open ${work.title}`} className={styles.row} onClick={() => onOpen(work.id)}><span><strong>{work.title}</strong><small>{reason}</small></span><ArrowRight size={16} aria-hidden="true" /></button></li>) : null} />
      : <section className={styles.section} aria-labelledby="home-attention">
        <header className={styles.sectionHeader}><h2 id="home-attention"><Bell size={18} aria-hidden="true" />Needs you</h2>{!busy && !deliveryPending && attentionCount > 0 ? <span className={styles.count}>{attentionCount}</span> : null}</header>
        {busy || deliveryPending ? <p role="status" className={styles.muted}>Checking your work…</p> : attentionCount ? <ul className={styles.list}>
          {deliveryAttention.map(item => <li key={`delivery-${item.id}`}><a className={styles.row} href={item.href}><span><strong>{item.title}</strong><small>{item.detail}</small></span><ArrowRight size={16} aria-hidden="true" /></a></li>)}
          {home.attention.map(({ work, reason }) => <li key={work.id}><button type="button" aria-label={`Open ${work.title}`} className={styles.row} onClick={() => onOpen(work.id)}><span><strong>{work.title}</strong><small>{reason}</small></span><ArrowRight size={16} aria-hidden="true" /></button></li>)}
        </ul> : !deliveryUnavailable ? <p className={styles.muted}>Nothing needs a decision right now.</p> : null}
        {deliveryUnavailable ? <p role="status" className={styles.notice}>{systemsReleased ? "Requests waiting on your decision could not be checked." : "Delivery decisions could not be checked."} <button type="button" onClick={deliveries.refresh}>Check again</button></p> : null}
      </section>}

      <SiteSummarySection state={siteSummary.state} workspaceId={snapshot.workspaceId} appBase={appBase} onRetry={siteSummary.retry} />

      {business || systems.length ? <section className={styles.section} aria-labelledby="home-systems">
        <header className={styles.sectionHeader}><h2 id="home-systems"><LayoutGrid size={18} aria-hidden="true" />{SYSTEMS_LABEL}</h2>{systems.length ? <Button variant="ghost" size="sm" onClick={() => onNavigate("apps")}>{SYSTEMS_LIST_LABEL}<ArrowRight size={16} aria-hidden="true" /></Button> : null}</header>
        {busy || systemsLoading ? <p role="status" className={styles.muted}>Loading your systems…</p> : systemsUnavailable ? <p role="status" className={styles.notice}>Your systems could not be loaded just now. Nothing about them has changed.</p> : systems.length ? <SystemList systems={systems} href={openSystemHref} onOpen={onOpenSystem} label={`${name} ${SYSTEMS_LABEL.toLowerCase()}`} /> : <div className={styles.empty}><LayoutGrid size={24} aria-hidden="true" /><div><h3>{readOnly ? "Nothing has been shared here yet." : "Nothing is running yet."}</h3><p>{readOnly ? "Systems the owner shares will appear here." : "Your website, inquiries, bookings and the tools your team uses will appear here once Strelva builds them. Tell Strelva what you need below."}</p></div></div>}
        {connectSiteHref && !busy && !systemsLoading ? <p className={styles.muted} data-home-connect-site>{systems.some(item => item.kind === "website")
          ? <>Have another website? <a className="underline underline-offset-4" href={connectSiteHref}>Connect it</a>. It stays where it is.</>
          : <>Already have a website? <a className="underline underline-offset-4" href={connectSiteHref}>Bring it into Strelva</a>. It stays where it is; Strelva takes its inquiries.</>}</p> : null}
      </section> : null}

      {business && !readOnly ? <section className={styles.ask} aria-labelledby="business-start-title">
        <h2 id="business-start-title">What should happen next?</h2>
        <WorkspaceComposer key={`${snapshot.actor.email}:${snapshot.workspaceId}`} draftKey={requestDraftKey({ actorEmail: snapshot.actor.email, workspaceId: snapshot.workspaceId })} disabled={busy} onSubmit={request} onEdited={onDraftChange} onTemplates={() => onNavigate("products")} placeholder="What do you want Strelva to make happen?" systemsReleased={systemsReleased} />
          <div className={styles.contextLine} aria-label="Current Strelva context">
            <span>Working in <strong>{name}</strong></span>
            {systems.length ? <span>{systems.length} {systems.length === 1 ? "system" : "systems"}</span> : null}
            {savedResultCount ? <span>{savedResultCount} saved {savedResultCount === 1 ? "file" : "files"}</span> : null}
          </div>
          <div className={styles.starters} aria-label="Try asking Strelva">
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => request("Give my team a better way to submit and track requests.")}>Give my team a better way to request things</Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => request("Make sure customer follow-up does not fall through.")}>Fix customer follow-up</Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => request("Improve our website based on what customers need.")}>Improve our website</Button>
          </div>
      </section> : null}

      {needsYouReleased ? <StrelvaHandledSection state={needsYou.state} pending={needsYou.pending} notices={needsYou.receiptNotices} onUndo={needsYou.undo}
        fallback={receipts.length ? receiptList : handled.length && !systemsReleased ? <ul className={styles.list}>{handled.map(row => requestRow(row))}</ul> : undefined} /> : null}
      {showRequests ? <>{needsYouReleased ? null : <section className={styles.section} aria-labelledby="home-handled">
        <header className={styles.sectionHeader}><h2 id="home-handled"><CheckCircle2 size={18} aria-hidden="true" />Strelva handled</h2></header>
        {systemsReleased ? (receipts.length ? receiptList : <p className={styles.muted}>Nothing this week. When Strelva changes something for you, it shows here with what changed and how to undo it.</p>)
          : busy || deliveryPending ? <p role="status" className={styles.muted}>Checking what finished…</p> : handled.length ? <ul className={styles.list}>{handled.map(row => requestRow(row))}</ul> : <p className={styles.muted}>Nothing finished yet. When Strelva or your agency finishes something, it appears here with what changed.</p>}
        {current?.kind === "customer" && sites.length ? <a className={styles.textAction} href={`${appBase}/workspace/recaps?workspaceId=${encodeURIComponent(snapshot.workspaceId)}`}>Weekly and monthly recaps<ArrowRight size={16} aria-hidden="true" /></a> : null}
      </section>}

      <section className={styles.section} aria-labelledby="home-progress">
        <header className={styles.sectionHeader}><h2 id="home-progress"><ListChecks size={18} aria-hidden="true" />In progress</h2><Button variant="ghost" size="sm" onClick={() => onNavigate("requests")}>All requests<ArrowRight size={16} aria-hidden="true" /></Button></header>
        {makingRows.length ? <ul className={styles.list} aria-label="Making live">{makingRows}</ul> : null}
        {busy || deliveryPending ? <p role="status" className={styles.muted}>Checking your requests…</p> : inProgress.length ? <ul className={styles.list}>{inProgress.slice(0, 5).map(row => requestRow(row))}</ul> : makingRows.length ? null : <p className={styles.muted}>{readOnly ? "No shared requests are in progress." : "Nothing is in progress. Ask Strelva above for something with an end, like a new page or an intake form."}</p>}
      </section></> : null}

      {!business || results.length || !systems.length ? <section className={styles.section} aria-labelledby="home-recent">
        <header className={styles.sectionHeader}><h2 id="home-recent">{systemsReleased ? "Files and results" : "Recent"}</h2>{!business || !systems.length ? <Button variant="ghost" size="sm" onClick={() => onNavigate("apps")}>{systemsReleased ? SYSTEMS_LIST_LABEL : "All apps and files"}{savedResultCount ? ` (${savedResultCount})` : ""}<ArrowRight size={16} aria-hidden="true" /></Button> : null}</header>
        {busy ? <p role="status" className={styles.muted}>Loading saved work…</p> : results.length ? <ul className={styles.list}>
          {results.slice(0, 6).map(work => <li key={work.id}><button type="button" aria-label={`Open ${work.title}`} className={styles.row} onClick={() => onOpen(work.id)}>{work.productId === "applications" ? <LayoutGrid size={18} aria-hidden="true" /> : <FileText size={18} aria-hidden="true" />}<span><strong>{work.title}</strong><small>{workspaceWorkLabel(work)}</small></span><ArrowRight size={16} aria-hidden="true" /></button></li>)}
        </ul> : <div className={styles.empty}><LayoutGrid size={24} aria-hidden="true" /><div><h3>{readOnly ? "Nothing has been shared here yet." : systemsReleased ? "No saved files yet." : "No saved result yet."}</h3><p>{readOnly ? "Shared work will appear here." : systemsReleased ? "Checks, reports and plans Strelva makes for you are kept here." : "Describe the outcome above. Strelva will show you what it can create or handle."}</p></div>{!readOnly && !business ? <Button variant="secondary" onClick={() => onNavigate("products")}><Plus size={16} aria-hidden="true" />{systemsReleased ? "Get or build something" : "Get or build an app"}</Button> : null}</div>}
        {!readOnly && onCreateWebsite ? <button type="button" className={styles.textAction} disabled={busy} onClick={onCreateWebsite}>Prefer to build a website yourself? Start a private draft.<ArrowRight size={16} aria-hidden="true" /></button> : null}
      </section> : null}

      {unassignedSites.length ? <details className={styles.details} aria-label="Websites available to your account"><summary>Websites available to your account <span>{unassignedSites.length}</span></summary><p className={styles.muted}>{current?.kind !== "customer" ? "These websites are available through your account. Assign them from the appropriate customer business." : siteAssignmentsKnown ? "These websites are not yet assigned to this business." : "Business assignments could not be confirmed."}</p>{current?.kind !== "customer" ? <ul className={styles.list}>{unassignedSites.map(site => <li key={site.id}><a className={styles.row} href={site.href}><span><strong>{site.title}</strong><small>Account-authorized website</small></span><ArrowRight size={16} /></a></li>)}</ul> : <WebsiteAssignmentHandoff businessName={name} state={managedWorkUnavailable ? { status: "unavailable", reason: "Linked website access is unavailable right now." } : offerings} sites={unassignedSites} onRetry={onRetryWebsiteAssignments} onCommand={onWebsiteCommand} />}</details> : null}

      <details className={styles.details} aria-label="Usage and connected services"><summary>Usage and connected services</summary><div className={styles.connections}>{current?.kind === "customer" && !readOnly ? <WorkspaceAllowanceSummary businessId={snapshot.workspaceId} enabled compact onOpenSettings={() => onNavigate("settings")} /> : null}<BusinessOfferingSummary state={offerings} work={snapshot.work} onOpen={onOfferings} systemsReleased={systemsReleased} /></div></details>
    </div>
  </StrelvaShell>;
}
