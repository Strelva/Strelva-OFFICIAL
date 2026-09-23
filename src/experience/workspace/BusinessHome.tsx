"use client";

import type { ReactNode } from "react";
import { ArrowRight, ArrowUpRight, FileText, Gauge, Globe2, LayoutGrid, Plus } from "lucide-react";
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
import { homeInsight, homeSuggestions, insightFixRequest, workspaceHome } from "./workspace-home";
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
  onDraftChange?: (request: string) => void;
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

function shortDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** The start and return surface, using the same frame as every saved result. */
export function BusinessHome({ snapshot, sites, unassignedSites, siteAssignmentsKnown, offerings, busy, notice, onOpen, onStart, onCreateWebsite, onRequest, onDraftChange, onWork, onOngoing, onAccess, onSettings, onWorkspace, onHelp, onExplore, onOfferings, appBase = "", accountHref, signOut, managedWorkUnavailable, onWebsiteCommand, onRetryWebsiteAssignments }: Props) {
  const current = snapshot.workspaces.find(space => space.id === snapshot.workspaceId);
  const readOnly = current?.access === "delegated_read";
  const name = current?.name || "Your business";
  const isBusiness = current?.kind === "customer";
  const home = workspaceHome(snapshot.work);
  const deliveryScope = current?.kind === "customer" && !readOnly && ["owner", "admin"].includes(current.role || "") ? snapshot.workspaceId : undefined;
  const deliveries = useBusinessDeliveries(deliveryScope);
  const deliveryItems = deliveries.state.status === "ready" ? deliveries.state.items : [];
  const deliveryAttention = deliveryItems.filter(item => item.attention);
  const attentionCount = home.attention.length + deliveryAttention.length;
  const insight = homeInsight(snapshot.work);
  const suggestions = homeSuggestions({ work: snapshot.work, siteCount: sites.length, insight });
  const appCount = home.results.filter(work => work.productId === "applications").length;
  const otherCount = home.results.length - appCount;
  const savedResultCount = home.results.length;
  const availableWorkCount = savedResultCount + sites.length;
  const deliveryPending = deliveries.state.status === "loading";
  const deliveryUnavailable = deliveries.state.status === "error";
  const workHref = (id: string) => `${appBase}/workspace?workspaceId=${encodeURIComponent(snapshot.workspaceId)}&work=${encodeURIComponent(id)}`;
  const searchItems: WorkspaceSearchItem[] = [
    { id: "action-new", title: "Start with an outcome", detail: "Tell Strelva what you want to make happen", href: `${appBase}/workspace?view=start&workspaceId=${encodeURIComponent(snapshot.workspaceId)}`, onOpen: onStart },
    { id: "action-explore", title: "Browse examples", detail: "Apps and templates you can adapt", href: `${appBase}/workspace?view=products&workspaceId=${encodeURIComponent(snapshot.workspaceId)}`, onOpen: onExplore },
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
      <header className={styles.masthead}>
        <p className={styles.eyebrow}>{readOnly ? "Shared with you" : isBusiness ? "Your business" : "Your workspace"}</p>
        <h1 id="business-start-title" className={styles.name}>{name}</h1>
        <ul className={styles.facts} aria-label="At a glance">
          {sites.length ? <li>{sites.length} {sites.length === 1 ? "website" : "websites"}</li> : null}
          {appCount ? <li>{appCount} {appCount === 1 ? "app" : "apps"}</li> : null}
          {otherCount ? <li>{otherCount} saved {otherCount === 1 ? "result" : "results"}</li> : null}
          {busy ? <li>Checking your work…</li> : attentionCount ? <li className={styles.factAttention}><a href="#home-attention">{attentionCount} {attentionCount === 1 ? "thing needs" : "things need"} you</a></li> : deliveryPending ? <li>Checking your work…</li> : <li>Nothing needs you</li>}
        </ul>
        {readOnly ? <p className={styles.readOnly}>Only {name} owners can make changes.</p> : null}
      </header>

      {!readOnly ? <section className={styles.ask} aria-label="Ask Strelva">
        <WorkspaceComposer key={`${snapshot.actor.email}:${snapshot.workspaceId}`} draftKey={requestDraftKey({ actorEmail: snapshot.actor.email, workspaceId: snapshot.workspaceId })} disabled={busy} onSubmit={request} onEdited={onDraftChange} onTemplates={onExplore} placeholder={isBusiness ? `What should ${name} do next?` : "What do you want Strelva to make happen?"} />
        <div className={styles.suggestions} aria-label="Try asking Strelva">{suggestions.map(item => <button key={item.label} type="button" disabled={busy} onClick={() => request(item.request)}>{item.label}<ArrowUpRight size={14} aria-hidden="true" /></button>)}</div>
      </section> : null}

      {managedWorkUnavailable ? <p role="status" className={styles.notice}>Some websites could not be loaded. <a href={accountHref}>Check website access</a></p> : null}

      {attentionCount || deliveryUnavailable ? <section className={styles.section} aria-labelledby="home-attention">
        <h2 id="home-attention" className={styles.sectionTitle}>Needs you <span className={styles.count}>{attentionCount}</span></h2>
        {attentionCount ? <ul className={styles.attention}>
          {deliveryAttention.map(item => <li key={`delivery-${item.id}`}><a className={styles.attentionRow} href={item.href}><span><strong>{item.title}</strong><small>{item.detail}</small></span><ArrowRight size={16} aria-hidden="true" /></a></li>)}
          {home.attention.map(({ work, reason }) => <li key={work.id}><button type="button" aria-label={`Open ${work.title}`} className={styles.attentionRow} onClick={() => onOpen(work.id)}><span><strong>{work.title}</strong><small>{reason}</small></span><ArrowRight size={16} aria-hidden="true" /></button></li>)}
        </ul> : null}
        {deliveryUnavailable ? <p role="status" className={styles.notice}>Delivery decisions could not be checked. <button type="button" onClick={deliveries.refresh}>Check again</button></p> : null}
      </section> : null}

      {insight ? <section className={styles.insight} aria-labelledby="home-insight">
        <div className={styles.grade} aria-hidden="true">{insight.grade}</div>
        <div className={styles.insightBody}>
          <p className={styles.eyebrow}>How AI sees {insight.subject}{insight.partial ? " · partial" : ""}</p>
          <h2 id="home-insight" className={styles.insightTitle}>{insight.verdict}</h2>
          <p className={styles.insightScore}>Grade {insight.grade} · {insight.score} out of 100</p>
          <div className={styles.fix}><p><span>Top fix</span>{insight.topFix}</p>
            <div className={styles.fixActions}>{!readOnly ? <Button variant="contrast" size="sm" disabled={busy} onClick={() => request(insightFixRequest(insight, sites.length))}>Have Strelva do this</Button> : null}<Button variant="ghost" size="sm" onClick={() => onOpen(insight.workId)}>See the full result</Button></div>
          </div>
          {insight.note ? <p className={styles.note}>{insight.note}</p> : null}
        </div>
      </section> : !readOnly && !busy && !home.hasWork && !sites.length ? <section className={styles.insight} aria-labelledby="home-insight">
        <div className={styles.grade} aria-hidden="true">?</div>
        <div className={styles.insightBody}>
          <p className={styles.eyebrow}>Start here</p>
          <h2 id="home-insight" className={styles.insightTitle}>{isBusiness ? `See how AI describes ${name}.` : "See how AI describes your business."}</h2>
          <p className={styles.insightScore}>Strelva checks what assistants and search can find about your business, then names the one fix that matters most.</p>
          <div className={styles.fixActions}><Button variant="contrast" size="sm" onClick={() => request("Help me see what AI can understand about my business.")}>{isBusiness ? `Check ${name}` : "Check my business"}</Button></div>
        </div>
      </section> : null}

      <section className={styles.section} aria-labelledby="home-work">
        <header className={styles.sectionHeader}><h2 id="home-work" className={styles.sectionTitle}>{readOnly ? "Shared work" : isBusiness ? `Inside ${name}` : "Your work"}</h2>{availableWorkCount ? <Button variant="ghost" size="sm" onClick={onWork}>View all ({availableWorkCount})<ArrowRight size={16} aria-hidden="true" /></Button> : null}</header>
        {busy ? <p role="status" className={styles.muted}>Loading saved work…</p> : <ul className={styles.tiles}>
          {sites.map(site => <li key={`site-${site.id}`} className={styles.wide}><a href={site.href} className={styles.tile}><Globe2 size={20} aria-hidden="true" /><span><strong>{site.title}</strong><small>Managed website</small></span></a></li>)}
          {home.results.slice(0, 6).map(work => <li key={work.id}><button type="button" aria-label={`Open ${work.title}`} className={styles.tile} onClick={() => onOpen(work.id)}>{work.productId === "applications" ? <LayoutGrid size={20} aria-hidden="true" /> : work.assessment ? <Gauge size={20} aria-hidden="true" /> : <FileText size={20} aria-hidden="true" />}<span><strong>{work.title}</strong><small>{workspaceWorkLabel(work)} · {shortDate(work.createdAt)}</small></span></button></li>)}
          {!readOnly ? <li><button type="button" aria-label="Browse examples" className={`${styles.tile} ${styles.addTile}`} onClick={onExplore}><Plus size={20} aria-hidden="true" /><span><strong>Browse examples</strong><small>Apps and templates to adapt</small></span></button></li> : null}
          {readOnly && !sites.length && !home.results.length ? <li className={styles.wide}><p className={styles.muted}>Nothing has been shared here yet.</p></li> : null}
        </ul>}
        {!readOnly && onCreateWebsite ? <button type="button" className={styles.textAction} disabled={busy} onClick={onCreateWebsite}>Build a website yourself<ArrowRight size={16} aria-hidden="true" /></button> : null}
      </section>

      {deliveryScope && deliveryItems.length ? <section className={styles.section} aria-labelledby="home-deliveries"><header className={styles.sectionHeader}><h2 id="home-deliveries" className={styles.sectionTitle}>Strelva is handling</h2><a className={styles.textAction} href={`/workspace/delivery?businessId=${encodeURIComponent(deliveryScope)}`}>View all<ArrowRight size={16} /></a></header><ul className={styles.list}>{deliveryItems.slice(0, 5).map(item => <li key={item.id}><a className={styles.row} href={item.href}><span><strong>{item.title}</strong><small>{item.detail}</small></span><ArrowRight size={16} aria-hidden="true" /></a></li>)}</ul></section> : null}

      {unassignedSites.length ? <details className={styles.details} aria-label="Websites available to your account"><summary>Websites available to your account <span>{unassignedSites.length}</span></summary><p className={styles.muted}>{current?.kind !== "customer" ? "These websites are available through your account. Assign them from the appropriate customer business." : siteAssignmentsKnown ? "These websites are not yet assigned to this business." : "Business assignments could not be confirmed."}</p>{current?.kind !== "customer" ? <ul className={styles.list}>{unassignedSites.map(site => <li key={site.id}><a className={styles.row} href={site.href}><span><strong>{site.title}</strong><small>Account-authorized website</small></span><ArrowRight size={16} /></a></li>)}</ul> : <WebsiteAssignmentHandoff businessName={name} state={managedWorkUnavailable ? { status: "unavailable", reason: "Linked website access is unavailable right now." } : offerings} sites={unassignedSites} onRetry={onRetryWebsiteAssignments} onCommand={onWebsiteCommand} />}</details> : null}

      <details className={styles.details} aria-label="Usage and connected services"><summary>Usage and connected services</summary><div className={styles.connections}>{current?.kind === "customer" && !readOnly ? <WorkspaceAllowanceSummary businessId={snapshot.workspaceId} enabled compact onOpenSettings={onSettings} /> : null}<BusinessOfferingSummary state={offerings} work={snapshot.work} onOpen={onOfferings} /></div></details>
    </div>
  </StrelvaShell>;
}
