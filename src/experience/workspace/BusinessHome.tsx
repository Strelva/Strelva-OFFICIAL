"use client";

import type { ReactNode } from "react";
import { ArrowRight, Bell, FileText, Globe2, LayoutGrid, Plus, Workflow } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StrelvaShell, type StrelvaSection } from "@/experience/app-frame/StrelvaShell";
import type { OfferingWebsiteBinding, OfferingWebsiteBindingCommand } from "@/platform/offerings";
import type { WorkspaceSnapshot } from "./contracts";
import type { ManagedWorkSummary } from "./workspace-discovery";
import type { WorkspaceSearchItem } from "./workspace-search";
import { BusinessOfferingSummary, WebsiteAssignmentHandoff, type WorkspaceOfferingState } from "./WorkspaceOfferings";
import { WorkspaceAllowanceSummary } from "./WorkspaceAllowanceSummary";
import { WorkspaceComposer } from "./WorkspaceComposer";
import { requestDraftKey } from "./request-draft";
import { useBusinessDeliveries } from "./useBusinessDeliveries";
import { workspaceHome } from "./workspace-home";
import { workspaceWorkLabel } from "./work-label";
import styles from "./business-home.module.css";

interface Props {
  appBase?: string;
  accountHref: string;
  onExplore: () => void;
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
  onWork: () => void;
  onOngoing: () => void;
  onAccess: () => void;
  onSettings: () => void;
  onWorkspace: (id: string) => void;
  onHelp: () => void;
  signOut?: ReactNode;
  onWebsiteCommand?: (command: OfferingWebsiteBindingCommand) => Promise<OfferingWebsiteBinding | null>;
  onRetryWebsiteAssignments?: () => void;
}

/** The start and return surface, using the same frame as every saved result. */
export function BusinessHome({ snapshot, sites, unassignedSites, siteAssignmentsKnown, offerings, busy, notice, onOpen, onStart, onCreateWebsite, onRequest, onWork, onOngoing, onAccess, onSettings, onWorkspace, onHelp, onExplore, onOfferings, appBase = "", accountHref, signOut, managedWorkUnavailable, onWebsiteCommand, onRetryWebsiteAssignments }: Props) {
  const current = snapshot.workspaces.find(space => space.id === snapshot.workspaceId);
  const readOnly = current?.access === "delegated_read";
  const name = current?.name || "Your business";
  const home = workspaceHome(snapshot.work);
  const deliveryScope = current?.kind === "customer" && !readOnly && ["owner", "admin"].includes(current.role || "") ? snapshot.workspaceId : undefined;
  const deliveries = useBusinessDeliveries(deliveryScope);
  const deliveryItems = deliveries.state.status === "ready" ? deliveries.state.items : [];
  const deliveryAttention = deliveryItems.filter(item => item.attention);
  const attentionCount = home.attention.length + deliveryAttention.length;
  const deliveryPending = deliveries.state.status === "loading";
  const deliveryUnavailable = deliveries.state.status === "error";
  const workHref = (id: string) => `${appBase}/workspace?workspaceId=${encodeURIComponent(snapshot.workspaceId)}&work=${encodeURIComponent(id)}`;
  const searchItems: WorkspaceSearchItem[] = [
    ...snapshot.work.map(work => ({ id: work.id, title: work.title, detail: workspaceWorkLabel(work), href: workHref(work.id), onOpen: () => onOpen(work.id) })),
    ...sites.map(site => ({ id: `site-${site.id}`, title: site.title, detail: "Managed website", href: site.href })),
    ...deliveryItems.map(item => ({ id: `delivery-${item.id}`, title: item.title, detail: item.detail, href: item.href })),
  ];
  const recentWork = home.results.map(work => ({ id: work.id, title: work.title, detail: workspaceWorkLabel(work), href: workHref(work.id), onOpen: () => onOpen(work.id) }));

  function request(value: string) {
    if (readOnly || busy) return;
    if (onRequest) onRequest(value);
    else onStart();
  }
  function navigate(section: StrelvaSection) {
    if (section === "work") onWork();
    if (section === "ongoing") onOngoing();
    if (section === "access") onAccess();
    if (section === "settings") onSettings();
    if (section === "products") onExplore();
    if (section === "help") onHelp();
  }

  return <StrelvaShell active="home" title={name} appBase={appBase} workspaceId={snapshot.workspaceId} accountName={snapshot.actor.email.split("@")[0] || "Your account"} accountDetail={snapshot.actor.email} signOut={signOut} onNavigate={navigate} onAccess={onAccess} onStart={onStart} startDisabled={readOnly || busy} searchItems={searchItems} searchScopeName={name} recentWork={recentWork} notice={notice} contentId="business-home-main"
    businessContext={<label><span className={styles.srOnly}>Current workspace</span><select aria-label="Current workspace" value={snapshot.workspaceId} disabled={busy} onChange={event => onWorkspace(event.target.value)}>{snapshot.workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}{workspace.access === "delegated_read" ? " · Read-only" : ""}</option>)}</select></label>}>
    <div className={styles.home} aria-busy={busy || undefined}>
      <section className={styles.start} aria-labelledby="business-start-title">
        <header className={styles.greeting}><p>{readOnly ? "Shared with you" : name}</p><h1 id="business-start-title" className="font-display">{readOnly ? "Your shared work." : "What would you like to do?"}</h1>{readOnly ? <p>Review work shared by {name}. Only its owners can make changes.</p> : null}</header>
        {!readOnly ? <>
          <WorkspaceComposer key={`${snapshot.actor.email}:${snapshot.workspaceId}`} draftKey={requestDraftKey({ actorEmail: snapshot.actor.email, workspaceId: snapshot.workspaceId })} disabled={busy} onSubmit={request} onTemplates={onExplore} placeholder="Describe an app, a change, or something you need done…" />
          <div className={styles.starters} aria-label="Start with an example">
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => request("Create a staff request app for our team.")}><LayoutGrid size={16} aria-hidden="true" />Create an app</Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => request("Organize supplier onboarding requirements.")}><FileText size={16} aria-hidden="true" />Organize onboarding</Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => request("Have Strelva build our website.")}><Globe2 size={16} aria-hidden="true" />Have Strelva build a website</Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => request("Set up an ongoing responsibility for our business.")}><Workflow size={16} aria-hidden="true" />Set up ongoing work</Button>
          </div>
        </> : null}
      </section>

      {managedWorkUnavailable ? <p role="status" className={styles.notice}>Some websites could not be loaded. <a href={accountHref}>Check website access</a></p> : null}

      <section className={styles.section} aria-labelledby="home-attention">
        <header className={styles.sectionHeader}><h2 id="home-attention"><Bell size={18} aria-hidden="true" />Needs your attention</h2>{!busy && !deliveryPending && attentionCount > 0 ? <span className={styles.count}>{attentionCount}</span> : null}</header>
        {busy || deliveryPending ? <p role="status" className={styles.muted}>Checking your work…</p> : attentionCount ? <ul className={styles.list}>
          {deliveryAttention.map(item => <li key={`delivery-${item.id}`}><a className={styles.row} href={item.href}><span><strong>{item.title}</strong><small>{item.detail}</small></span><ArrowRight size={16} aria-hidden="true" /></a></li>)}
          {home.attention.map(({ work, reason }) => <li key={work.id}><button type="button" className={styles.row} onClick={() => onOpen(work.id)}><span><strong>{work.title}</strong><small>{reason}</small></span><ArrowRight size={16} aria-hidden="true" /></button></li>)}
        </ul> : !deliveryUnavailable ? <p className={styles.muted}>Nothing needs a decision right now.</p> : null}
        {deliveryUnavailable ? <p role="status" className={styles.notice}>Delivery decisions could not be checked. <button type="button" onClick={deliveries.refresh}>Check again</button></p> : null}
      </section>

      <section className={styles.section} aria-labelledby="home-work">
        <header className={styles.sectionHeader}><h2 id="home-work">Your apps and work</h2><Button variant="ghost" size="sm" onClick={onWork}>View all{home.results.length + sites.length ? ` (${home.results.length + sites.length})` : ""}<ArrowRight size={16} aria-hidden="true" /></Button></header>
        {busy ? <p role="status" className={styles.muted}>Loading saved work…</p> : sites.length || home.results.length ? <ul className={styles.list}>
          {sites.map(site => <li key={`site-${site.id}`}><a href={site.href} className={styles.row}><Globe2 size={18} aria-hidden="true" /><span><strong>{site.title}</strong><small>Managed website</small></span><ArrowRight size={16} aria-hidden="true" /></a></li>)}
          {home.results.slice(0, 6).map(work => <li key={work.id}><button type="button" className={styles.row} onClick={() => onOpen(work.id)}>{work.productId === "applications" ? <LayoutGrid size={18} aria-hidden="true" /> : <FileText size={18} aria-hidden="true" />}<span><strong>{work.title}</strong><small>{workspaceWorkLabel(work)}</small></span><ArrowRight size={16} aria-hidden="true" /></button></li>)}
        </ul> : <div className={styles.empty}><LayoutGrid size={24} aria-hidden="true" /><div><h3>{readOnly ? "No saved work has been shared here yet." : "Start with something you can use."}</h3><p>{readOnly ? "Shared apps, documents, and results will appear here." : "Choose an app template or describe what your business needs. No website purchase is required."}</p></div>{!readOnly ? <Button variant="secondary" onClick={onExplore}><Plus size={16} aria-hidden="true" />Browse apps &amp; templates</Button> : null}</div>}
        {!readOnly && onCreateWebsite ? <button type="button" className={styles.textAction} disabled={busy} onClick={onCreateWebsite}>Prefer to build a website yourself? Start a private draft.<ArrowRight size={16} aria-hidden="true" /></button> : null}
      </section>

      {deliveryScope && deliveryItems.length ? <section className={styles.section} aria-labelledby="home-deliveries"><header className={styles.sectionHeader}><h2 id="home-deliveries">Strelva delivery</h2><a className={styles.textAction} href={`/workspace/delivery?businessId=${encodeURIComponent(deliveryScope)}`}>View all<ArrowRight size={16} /></a></header><ul className={styles.list}>{deliveryItems.slice(0, 5).map(item => <li key={item.id}><a className={styles.row} href={item.href}><span><strong>{item.title}</strong><small>{item.detail}</small></span><ArrowRight size={16} aria-hidden="true" /></a></li>)}</ul></section> : null}

      {unassignedSites.length ? <details className={styles.details}><summary>Websites available to your account <span>{unassignedSites.length}</span></summary><p className={styles.muted}>{current?.kind !== "customer" ? "These websites are available through your account. Assign them from the appropriate customer business." : siteAssignmentsKnown ? "These websites are not yet assigned to this business." : "Business assignments could not be confirmed."}</p>{current?.kind !== "customer" ? <ul className={styles.list}>{unassignedSites.map(site => <li key={site.id}><a className={styles.row} href={site.href}><span><strong>{site.title}</strong><small>Account-authorized website</small></span><ArrowRight size={16} /></a></li>)}</ul> : <WebsiteAssignmentHandoff businessName={name} state={managedWorkUnavailable ? { status: "unavailable", reason: "Linked website access is unavailable right now." } : offerings} sites={unassignedSites} onRetry={onRetryWebsiteAssignments} onCommand={onWebsiteCommand} />}</details> : null}

      <details className={styles.details}><summary>Usage and connected services</summary><div className={styles.connections}>{current?.kind === "customer" && !readOnly ? <WorkspaceAllowanceSummary businessId={snapshot.workspaceId} enabled compact onOpenSettings={onSettings} /> : null}<BusinessOfferingSummary state={offerings} work={snapshot.work} onOpen={onOfferings} /></div></details>
    </div>
  </StrelvaShell>;
}
