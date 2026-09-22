"use client";

import { useState, type ReactNode } from "react";
import { ArrowRight, Bell, FileText, Globe2, LayoutTemplate, Workflow } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SelectInput } from "@/components/ui/TextInput";
import { StrelvaShell, type StrelvaSection } from "@/experience/app-frame/StrelvaShell";
import type { OfferingWebsiteBinding, OfferingWebsiteBindingCommand } from "@/platform/offerings";
import type { WorkspaceSnapshot } from "./contracts";
import type { ManagedWorkSummary } from "./workspace-discovery";
import { BusinessOfferingSummary, WebsiteAssignmentHandoff, type WorkspaceOfferingState } from "./WorkspaceOfferings";
import { WorkspaceAllowanceSummary } from "./WorkspaceAllowanceSummary";
import { WorkspaceComposer } from "./WorkspaceComposer";
import { useBusinessDeliveries } from "./useBusinessDeliveries";
import { workspaceHome } from "./workspace-home";
import { workspaceWorkLabel } from "./work-label";
import styles from "./workspace-home.module.css";

export interface BusinessHomeProps {
  snapshot: WorkspaceSnapshot;
  sites: readonly ManagedWorkSummary[];
  unassignedSites: readonly ManagedWorkSummary[];
  siteAssignmentsKnown: boolean;
  offerings: WorkspaceOfferingState;
  busy: boolean;
  notice?: ReactNode;
  appBase?: string;
  accountHref: string;
  signOut?: ReactNode;
  managedWorkUnavailable?: boolean;
  request?: string;
  onRequestChange?: (request: string) => void;
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
  onExplore: () => void;
  onTemplates?: () => void;
  onSearch?: () => void;
  onOfferings: (id?: string) => void;
  onWebsiteCommand?: (command: OfferingWebsiteBindingCommand) => Promise<OfferingWebsiteBinding | null>;
  onRetryWebsiteAssignments?: () => void;
}

export function BusinessHome({ snapshot, sites, unassignedSites, siteAssignmentsKnown, offerings, busy, notice, appBase = "", accountHref, signOut, managedWorkUnavailable, request: suppliedRequest, onRequestChange, onOpen, onStart, onCreateWebsite, onRequest, onWork, onOngoing, onAccess, onSettings, onWorkspace, onHelp, onExplore, onTemplates, onSearch, onOfferings, onWebsiteCommand, onRetryWebsiteAssignments }: BusinessHomeProps) {
  const [localRequest, setLocalRequest] = useState("");
  const request = suppliedRequest ?? localRequest;
  const current = snapshot.workspaces.find(workspace => workspace.id === snapshot.workspaceId);
  const readOnly = current?.access === "delegated_read";
  const name = current?.name || "Your business";
  const home = workspaceHome(snapshot.work);
  const deliveryScope = current?.kind === "customer" && !readOnly && ["owner", "admin"].includes(current.role || "") ? snapshot.workspaceId : undefined;
  const deliveries = useBusinessDeliveries(deliveryScope);
  const deliveryItems = deliveries.state.status === "ready" ? deliveries.state.items : [];
  const deliveryAttention = deliveryItems.filter(item => item.attention);
  const attentionCount = home.attention.length + deliveryAttention.length;
  const deliveryPending = deliveries.state.status === "loading";
  const openTemplates = onTemplates ?? onExplore;
  function start(value: string) { if (!readOnly && !busy) { if (onRequest) onRequest(value); else { setLocalRequest(value); onStart(); } } }
  function navigate(section: StrelvaSection) {
    if (section === "work") onWork();
    else if (section === "ongoing") onOngoing();
    else if (section === "templates") openTemplates();
    else if (section === "access") onAccess();
    else if (section === "settings") onSettings();
    else if (section === "products") onExplore();
    else if (section === "help") onHelp();
  }
  return <StrelvaShell active="home" title="Strelva" appBase={appBase} workspaceId={snapshot.workspaceId} accountName={snapshot.actor.email.split("@")[0] || "Your account"} accountDetail={snapshot.actor.email} signOut={signOut} notice={notice} onNavigate={navigate} onAccess={onAccess} onSearch={onSearch ?? onWork} onStart={onStart} startDisabled={readOnly || busy}
    context={<SelectInput aria-label="Current workspace" value={snapshot.workspaceId} disabled={busy} onChange={event => onWorkspace(event.target.value)} options={snapshot.workspaces.map(workspace => ({ value: workspace.id, label: `${workspace.name}${workspace.access === "delegated_read" ? " · Read-only" : ""}` }))} />}
    navigation={home.results.length ? <><h2>Recent</h2>{home.results.slice(0, 7).map(work => <button key={work.id} type="button" onClick={() => onOpen(work.id)}><span>{work.title}</span></button>)}</> : undefined}
    contentId="business-home-main">
    <div className={styles.scroll}>
      <div className={styles.page} aria-busy={busy}>
        {managedWorkUnavailable ? <div role="status" className={styles.notice}><span>Some websites could not be loaded.</span><a href={accountHref}>Check website access</a></div> : null}
        <section className={styles.intro} aria-labelledby="business-home-heading">
          <p className={styles.eyebrow}>{readOnly ? `Shared by ${name}` : name}</p>
          <h1 id="business-home-heading" className={styles.heading}>{readOnly ? "Work shared with you." : "What would you like to build?"}</h1>
          {!readOnly ? <>
            <WorkspaceComposer value={request} onChange={value => { setLocalRequest(value); onRequestChange?.(value); }} onSubmit={start} busy={busy} onTemplates={openTemplates} />
            <div className={styles.starters} aria-label="Start with something useful">
              <Button variant="secondary" type="button" disabled={busy} icon={<LayoutTemplate size={16} />} onClick={openTemplates}>Start from a template</Button>
              <Button variant="ghost" type="button" disabled={busy} onClick={() => start("Organize supplier onboarding requirements.")}>Organize onboarding</Button>
              <Button variant="ghost" type="button" disabled={busy} onClick={() => start("Have Strelva build our website.")}>Have Strelva build your website</Button>
              {onCreateWebsite ? <Button variant="ghost" type="button" disabled={busy} onClick={onCreateWebsite}>Create your own website</Button> : null}
            </div>
          </> : <p className={styles.empty}>You can inspect the work shared here. Only the business can create or change it.</p>}
        </section>

        <section className={styles.section} aria-labelledby="home-attention">
          <header className={styles.sectionHeader}><h2 id="home-attention"><Bell size={18} aria-hidden="true" />Needs your attention <span className={styles.count}>{busy || deliveryPending ? "" : attentionCount}</span></h2></header>
          {busy || deliveryPending ? <p role="status">Checking your work…</p> : <>
            {attentionCount ? <ul className={styles.list}>
              {deliveryAttention.map(item => <li key={`delivery-${item.id}`}><a className={styles.row} href={item.href}><Globe2 size={18} aria-hidden="true" /><span><strong>{item.title}</strong><small>{item.detail}</small></span><ArrowRight size={16} aria-hidden="true" /></a></li>)}
              {home.attention.map(({ work, reason }) => <li key={work.id}><button type="button" className={styles.row} onClick={() => onOpen(work.id)}><Bell size={18} aria-hidden="true" /><span><strong>{work.title}</strong><small>{reason}</small></span><ArrowRight size={16} aria-hidden="true" /></button></li>)}
            </ul> : deliveries.state.status !== "error" ? <p>All caught up. Decisions that need you will appear here.</p> : null}
            {deliveries.state.status === "error" ? <div role="status" className={styles.notice}><span>Delivery decisions could not be checked.</span><Button variant="ghost" type="button" onClick={deliveries.refresh}>Check again</Button></div> : null}
          </>}
        </section>

        <section className={styles.section} aria-labelledby="home-recent">
          <header className={styles.sectionHeader}><h2 id="home-recent">Recent work</h2><Button variant="ghost" type="button" onClick={onWork}>View all <ArrowRight size={16} /></Button></header>
          {busy ? <p role="status">Loading saved work…</p> : home.results.length ? <ul className={styles.list}>{home.results.slice(0, 8).map(work => <li key={work.id}><button type="button" className={styles.row} onClick={() => onOpen(work.id)}><FileText size={18} aria-hidden="true" /><span><strong>{work.title}</strong><small>{work.unavailableReason || workspaceWorkLabel(work)}</small></span><ArrowRight size={16} aria-hidden="true" /></button></li>)}</ul> : <div className={styles.empty}>{readOnly ? "No saved work has been shared here yet." : "Your apps, documents, and other saved work will be here. Start with a template or describe what you need."}</div>}
        </section>

        {sites.length ? <section className={styles.section} aria-labelledby="home-sites"><header className={styles.sectionHeader}><h2 id="home-sites">Your websites</h2></header><ul className={styles.list}>{sites.map(site => <li key={site.id}><a href={site.href} className={styles.row}><Globe2 size={18} aria-hidden="true" /><span><strong>{site.title}</strong><small>Managed website</small></span><ArrowRight size={16} aria-hidden="true" /></a></li>)}</ul></section> : null}

        {deliveryScope ? <section className={styles.section} aria-labelledby="home-deliveries"><header className={styles.sectionHeader}><h2 id="home-deliveries"><Workflow size={18} aria-hidden="true" />Strelva delivery</h2><a href={`${appBase}/workspace/delivery?businessId=${encodeURIComponent(deliveryScope)}`}>View all</a></header>
          {deliveryPending ? <p role="status">Checking accepted work…</p> : deliveries.state.status === "error" ? <p role="status">{deliveries.state.message}</p> : deliveryItems.length ? <ul className={styles.list}>{deliveryItems.slice(0, 5).map(item => <li key={item.id}><a className={styles.row} href={item.href}><span><strong>{item.title}</strong><small>{item.detail}</small></span><ArrowRight size={16} aria-hidden="true" /></a></li>)}</ul> : <p>No service request has been accepted for delivery. <button type="button" className="underline underline-offset-4" onClick={onHelp}>Ask Strelva for work</button></p>}
        </section> : null}

        {unassignedSites.length ? <section className={styles.section} aria-labelledby="home-unassigned-sites"><header className={styles.sectionHeader}><h2 id="home-unassigned-sites">Authorized sites</h2></header><p>{siteAssignmentsKnown ? "Available to your account, but not assigned to this business." : "Available to your account. Business assignment cannot be read from this view."}</p>
          {current?.kind !== "customer" ? <ul className={styles.list}>{unassignedSites.map(site => <li key={site.id}><a className={styles.row} href={site.href}><span><strong>{site.title}</strong><small>Account-authorized website</small></span></a></li>)}</ul> : <WebsiteAssignmentHandoff businessName={name} state={managedWorkUnavailable ? { status: "unavailable", reason: "Linked website access is unavailable right now." } : offerings} sites={unassignedSites} onRetry={onRetryWebsiteAssignments} onCommand={onWebsiteCommand} />}
        </section> : null}
        <div className={styles.supporting}>
          <BusinessOfferingSummary state={offerings} work={snapshot.work} onOpen={onOfferings} />
          {current?.kind === "customer" && !readOnly ? <WorkspaceAllowanceSummary businessId={snapshot.workspaceId} enabled compact onOpenSettings={onSettings} /> : null}
        </div>
      </div>
    </div>
  </StrelvaShell>;
}
