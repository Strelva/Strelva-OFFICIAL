"use client";
import { actorPresentation } from "@/platform/presentation/actor";
import { STRELVA_HANDLED_LABEL, PLACE_LABELS, STATE_LABELS } from "@/platform/presentation/place-labels";
import type { AgencyClientHomeState } from "@/experience/workspace/useAgencyClientHome";
import { clientDecisionHref } from "@/platform/workspaces/location";
import type { NeedsYouState } from "@/experience/workspace/useNeedsYou";
import { CONTROL_PLANE_URL } from "@/platform/infra/brand";

import { WorkspaceInquirySystem } from "@/experience/places/WorkspaceInquirySystem";
import Link from "next/link";
import { ContentWorkspace } from "@/experience/publishing/ContentWorkspace";
import { useRef, useState, type ReactNode } from "react";
import { z } from "zod";
import { ArrowLeft, ArrowUpRight, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { InquiryServerWorkspaceExperience } from "@/experience/inquiries/InquiryServerExperience";
import type { InquirySurfaceAdapter } from "@/experience/inquiries/contracts";
import { OpenedWork } from "@/experience/workspace/OpenedWork";
import type { WorkspaceWork } from "@/experience/workspace/contracts";
import { possibilityScope } from "./from-workspace";
import { HealthSignal, LifecyclePill, SYSTEM_ICONS } from "./SystemList";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";
import { RequiredConnections } from "./RequiredConnections";
import { useConnectionRead } from "./use-connection-read";
import {
  CONNECTION_KIND_LABEL, HEALTH_LABEL, INCOMING_CONNECTION_LABEL, LIFECYCLE_LABEL, PAUSED_KEEPS, POSSIBILITY_STATUS_LABEL, SYSTEM_KIND_LABEL, makeRealSummary,
  type MakeRealOutcome, type SystemConnection, type SystemPossibility, type SystemView,
} from "./model";
import { workspaceSiteHref } from "@/platform/workspaces/site-places";
import { SystemPanel as Panel } from "./SystemPanel";
import { WebsiteSystemPanels, WebsiteHistoryPanel, hasWebsiteDetail, useWebsiteSystemDetail, type WebsiteDetailState } from "./WebsiteSystemPanels";
import { WebsiteChangeAsk } from "./WebsiteChangeAsk";
import { websiteDomainConnections } from "./website-detail";
import { SystemVersionImprovements } from "./SystemVersionImprovements";
import { SystemVersionManagement } from "./SystemVersionManagement";
import { SystemCreator } from "./SystemCreator";
import { WebsiteSystemCanvas } from "./WebsiteSystemCanvas";
import canvasStyles from "./website-system-canvas.module.css";
import styles from "./systems.module.css";
import { StComposerBar, StComposerDock, StEmpty, StHead, StMono, StNotice, StPage, StPill, StPillLink, StRows, StRow, StSection, StSkeleton, StState, StTextButton } from "@/components/ui/strelva/Kit";
import { ConnectionDetail, connectionDetailData } from "./ConnectionDetail";
import { MakeRealProgress } from "./MakeRealProgress";
import { PossibilityComparison } from "./PossibilityComparison";
import paper from "./system-page.module.css";

export interface SystemPageProps {
  system: SystemView | undefined;
  systems: readonly SystemView[];
  workspaceId: string;
  appBase?: string;
  /** No management or requests for changes (shared read-only, member, or stopped workspace). */
  readOnly: boolean;
  /** Version endpoints return exact installation authority; stopped work still blocks it. */
  versionReadOnly?: boolean;
  /** Runtime use can remain available to members who cannot manage the System. */
  useReadOnly?: boolean;
  /** Current maker authority; release management alone does not grant design or rehearsal. */
  canEditApplications?: boolean;
  rebuildEnabled?: boolean;
  managed?: boolean;
  /** Managed website tooling is available only to a Strelva operator. */
  operator?: boolean;
  agency?: boolean;
  readOnlyReason?: string;
  /** Only owners can make a Possibility real. When false, say why. */
  canMakeReal?: boolean;
  makeRealReason?: string;
  loading?: boolean;
  sources: readonly WorkspaceWork[];
  /** Reuse the workspace's decision read, without creating another approval. */
  needsYou?: NeedsYouState;
  agencyDecisions?: AgencyClientHomeState;
  businessName?: string;
  localPreview?: boolean;
  workspaceStopped?: boolean;
  calendarRecoveryAllowed?: boolean;
  /** Domains, Waiting on you, Requests and History for a website System. Supplied by tests; otherwise read from the server. */
  websiteDetail?: WebsiteDetailState;
  inquiryInbox?: boolean;
  inquiryAdapter?: { tenantId: string; adapter?: InquirySurfaceAdapter };
  systemHref: (id: string) => string;
  onHome: () => void;
  onOpenSystem?: (id: string) => void;
  onAsk: (request: string) => void;
}

/** Opening a System gives most of the space to the actual thing; the four nouns sit beside it. */
export function SystemPage(props: SystemPageProps) {
  const { system, systems, readOnly, readOnlyReason, loading, onHome, onAsk } = props;
  const [compareId, setCompareId] = useState<string | null>(null);
  const [mode, setMode] = useState<"current" | "possibility" | "both">("current");
  // A managed website (Strelva edits it, or every change is a repo Request): "Ask for a change" files a Request.
  const [askingChange, setAskingChange] = useState(false);
  const [ask, setAsk] = useState("");
  const [detailVersion, setDetailVersion] = useState(0);
  const fetchedDetail = useWebsiteSystemDetail(props.workspaceId, system?.id ?? "", Boolean(system && system.kind === "website" && !props.websiteDetail), detailVersion);
  const websiteDetail = props.websiteDetail ?? fetchedDetail;
  const siteHref = props.operator && system && system.surface.kind === "website" && system.surface.editing ? (tab: "connections" | "google") => workspaceSiteHref({ workspaceId: props.workspaceId, systemId: system.id, tab }, props.appBase || "") : undefined;
  const back = <button type="button" className={styles.back} onClick={onHome}><ArrowLeft size={16} aria-hidden="true" />Home</button>;
  if (loading && !system) return <StPage><StHead crumb={{ label: "Home", onClick: onHome }} title="Opening this system…" /><StSkeleton label="Opening this system" /><StSkeleton width="60%" /></StPage>;
  if (!system) return <StPage><StHead crumb={{ label: "Home", onClick: onHome }} title="This system isn’t available here." /><StEmpty>It may belong to another business, or your access may have changed. Nothing about it was changed.</StEmpty></StPage>;
  // Website panels and the site's own editor links count as context too.
  const filesRequests = system.kind === "website" && system.surface.kind === "website" && Boolean(system.surface.editing) && !readOnly;
  const showAside = hasContext(system) || (system.kind === "website" && hasWebsiteDetail(websiteDetail)) || Boolean(siteHref) || (filesRequests && askingChange);
  function askForChange() {
    if (filesRequests) setAskingChange(true);
    else onAsk(`About ${system!.name}: `);
  }

  const Icon = SYSTEM_ICONS[system.kind];
  const titled = system.surface.kind !== "work";
  const comparing = system.possibilities.find(item => item.id === compareId && item.previewSrc);
  function compare(possibility: SystemPossibility) {
    setCompareId(possibility.id);
    setMode("both");
  }

  if (system.surface.kind !== "website") return <StPage className={paper.page}>
    <div aria-busy={loading || undefined} className={paper.stack}>
      {titled ? <StHead crumb={{ label: "Home", onClick: onHome }} title={system.name} meta={<><StState kind={system.lifecycle === "live" ? "live" : "draft"}>{LIFECYCLE_LABEL[system.lifecycle]}</StState> · {system.builtInApp ? <StMono>{system.builtInApp.label}</StMono> : SYSTEM_KIND_LABEL[system.kind]}{system.detail ? ` · ${system.detail}` : ""}</>} actions={<StTextButton disabled={readOnly} title={readOnly ? readOnlyReason : undefined} onClick={askForChange}>Ask for a change</StTextButton>} />
        : <div className={paper.workMeta}><StTextButton onClick={onHome}>← Home</StTextButton><StState kind={system.lifecycle === "live" ? "live" : "draft"}>{LIFECYCLE_LABEL[system.lifecycle]}</StState><StTextButton disabled={readOnly} title={readOnly ? readOnlyReason : undefined} onClick={askForChange}>Ask for a change</StTextButton></div>}
      <StNotice tone={system.health.state === "blocked" ? "critical" : system.health.state === "degraded" ? "need" : undefined}>{HEALTH_LABEL[system.health.state]}. {system.health.summary}</StNotice>
      {readOnly && readOnlyReason ? <StNotice>{readOnlyReason}</StNotice> : null}
      {system.operatedBy ? <p className={paper.meta}>Agency of record: {system.operatedBy}</p> : system.providerIdentityStatus === "unavailable" ? <p className={paper.meta}>Agency identity could not be loaded</p> : null}
      {system.lifecycle === "paused" ? <p className={paper.meta} role="note">{PAUSED_KEEPS[system.kind] ?? "Paused. Its records are kept."}</p> : null}
      <SystemNeedsYou system={system} state={props.needsYou} agencyState={props.agencyDecisions} businessName={props.businessName} workspaceId={props.workspaceId} appBase={props.appBase} />
      <section className={paper.object} aria-label={`${system.name}, the actual ${SYSTEM_KIND_LABEL[system.kind].toLowerCase()}`}><SystemSurface {...props} system={system} /></section>
      {showAside ? <div className={paper.context} aria-label={`About ${system.name}`}>
        {system.activations?.length ? <ActivationsPanel system={system} /> : null}
        {system.possibilities.length || system.storedVersionId ? <PossibilitiesPanel key={`${props.workspaceId}:${system.id}`} systemHref={props.systemHref} versionReadOnly={props.versionReadOnly} system={system} systems={systems} workspaceId={props.workspaceId} readOnly={readOnly} readOnlyReason={readOnlyReason} canMakeReal={props.canMakeReal ?? !readOnly} makeRealReason={props.makeRealReason ?? readOnlyReason} appBase={props.appBase || ""} comparingId={compareId} onCompare={compare} onAsk={onAsk} /> : null}
        <SystemContextSections {...props} system={system} />
      </div> : <StTextButton disabled={readOnly} title={readOnly ? readOnlyReason : undefined} onClick={() => onAsk(`What else could ${system.name} become? `)}>Ask what else {system.name} could become.</StTextButton>}
    </div>
  </StPage>;

  const website = system.kind === "website" && system.surface.kind === "website";
  const Page = website ? StPage : "div";
  return <><Page className={website ? undefined : styles.page} aria-busy={loading || undefined}>
    {website ? <div className={canvasStyles.heading}>
      <StHead crumb={{ label: system.detail || "Home", onClick: onHome }} title={system.name}
        meta={<span className={canvasStyles.meta}>
          <span data-lifecycle={system.lifecycle}><StState kind={system.lifecycle === "live" ? "live" : "draft"}>{LIFECYCLE_LABEL[system.lifecycle]}</StState></span>
          <StState kind={system.health.state === "healthy" ? "live" : system.health.state === "blocked" ? "down" : system.health.state === "degraded" ? "need" : "draft"}>{HEALTH_LABEL[system.health.state]}. {system.health.summary}</StState>
        </span>}
        actions={<div className={canvasStyles.actions}>
          {system.surface.kind === "website" && system.surface.liveUrl ? <StTextButton href={system.surface.liveUrl} target="_blank" rel="noreferrer" tone="accent">Visit site<ArrowUpRight size={14} aria-hidden="true" /></StTextButton> : null}
          {system.surface.kind === "website" && system.surface.editing ? <StTextButton href={workspaceSiteHref({ workspaceId: props.workspaceId, systemId: system.id, tab: "request" }, props.appBase || "")}>Changes to this site</StTextButton>
            : system.surface.kind === "website" && system.surface.manageHref ? <StTextButton href={system.surface.manageHref}>Website controls</StTextButton> : null}
          <StPill disabled={readOnly} title={readOnly ? readOnlyReason : undefined} aria-expanded={filesRequests ? askingChange : undefined} onClick={askForChange}>Ask for a change</StPill>
        </div>} />
      {readOnly && readOnlyReason ? <StNotice>{readOnlyReason}</StNotice> : null}
      {system.operatedBy ? <p className={canvasStyles.note}>Agency of record: {system.operatedBy}</p> : null}
      {system.storedVersionId ? <SystemCreator workspaceId={props.workspaceId} systemId={system.id} /> : null}
      {system.health.signals?.length ? <details className={canvasStyles.note}><summary>Latest checks</summary><ul aria-label="Website health evidence" className={canvasStyles.evidence}>{system.health.signals.map(signal => <li key={signal}>{signal}</li>)}</ul></details> : null}
      {system.lifecycle === "paused" ? <StNotice>{PAUSED_KEEPS.website}</StNotice> : null}
    </div> : <header className={styles.header}>
      <div>
        {back}
        {titled ? <h1 className="font-display">{system.name}</h1> : null}
        <p className={styles.meta}>
          <span><Icon size={16} aria-hidden="true" className="mr-2 inline align-[-3px]" />{system.builtInApp ? <StMono>{system.builtInApp.label}</StMono> : SYSTEM_KIND_LABEL[system.kind]}{titled && system.detail ? ` · ${system.detail}` : ""}</span>
          <LifecyclePill lifecycle={system.lifecycle} />
          <HealthSignal health={system.health} detailed />
          {system.operatedBy ? <span>Agency of record: {system.operatedBy}</span> : system.providerIdentityStatus === "unavailable" ? <span>Agency identity could not be loaded</span> : system.providerIdentityStatus === "unassigned" ? <span>No agency of record</span> : null}
        </p>
        {system.storedVersionId ? <SystemCreator workspaceId={props.workspaceId} systemId={system.id} /> : null}
        {system.health.signals?.length ? <ul aria-label="Website health evidence" className="mt-3 space-y-1 text-sm text-gray-muted">{system.health.signals.map(signal => <li key={signal}>{signal}</li>)}</ul> : null}
        {system.lifecycle === "paused" ? <p className={styles.meta} role="note">{PAUSED_KEEPS[system.kind] ?? "Paused. Its records are kept."}</p> : null}
      </div>
      <div className={styles.actions}>
        {system.surface.kind === "website" && system.surface.liveUrl ? <a className={styles.linkAction} href={system.surface.liveUrl} target="_blank" rel="noreferrer">Visit site<ArrowUpRight size={16} aria-hidden="true" /></a> : null}
        {system.surface.kind === "website" && system.surface.editing ? <a className={styles.linkAction} data-variant="secondary" href={workspaceSiteHref({ workspaceId: props.workspaceId, systemId: system.id, tab: "request" }, props.appBase || "")}>Changes to this site</a>
          : system.surface.kind === "website" && system.surface.manageHref ? <a className={styles.linkAction} data-variant="secondary" href={system.surface.manageHref}>Website controls</a> : null}
        {readOnly && readOnlyReason ? <span className="self-center text-xs text-gray-muted">{readOnlyReason}</span> : null}
        <Button size="sm" disabled={readOnly} title={readOnly ? readOnlyReason : undefined} icon={<MessageSquareText size={16} />} aria-expanded={filesRequests ? askingChange : undefined} onClick={askForChange}>Ask for a change</Button>
      </div>
    </header>}

    <SystemNeedsYou system={system} state={props.needsYou} agencyState={props.agencyDecisions} businessName={props.businessName} workspaceId={props.workspaceId} appBase={props.appBase} />
    <div className={website ? canvasStyles.body : styles.body} data-context={(website ? showAside : hasContext(system)) ? undefined : "none"} aria-busy={website && loading || undefined}>
      <section className={website ? canvasStyles.surface : styles.surface} data-kind={system.surface.kind} aria-label={`${system.name}, the actual ${SYSTEM_KIND_LABEL[system.kind].toLowerCase()}`}>
        {system.surface.kind === "website" ? <>
          <WebsiteSystemCanvas system={{ ...system, surface: system.surface }} comparing={comparing} mode={mode} onModeChange={setMode} sandbox={websiteSandbox} />
          {system.publishing && !props.localPreview ? <ContentWorkspace key={system.id} workspaceId={props.workspaceId} systemId={system.id} kind="website" readOnly={readOnly || system.lifecycle === "paused"} /> : null}
        </> : <div className={styles.workSurface}><SystemSurface {...props} system={system} /></div>}
      </section>

      {showAside ? <aside className={website ? canvasStyles.aside : styles.aside} aria-label={`About ${system.name}`}>
        {filesRequests && askingChange ? <WebsiteChangeAsk workspaceId={props.workspaceId} systemId={system.id} siteName={system.name} onFiled={() => setDetailVersion(version => version + 1)} onClose={() => setAskingChange(false)} /> : null}
        {system.kind === "website" && websiteDetail ? <WebsiteSystemPanels workspaceId={props.workspaceId} systemId={system.id} state={websiteDetail} onAsk={onAsk} onAskChange={filesRequests ? () => setAskingChange(true) : undefined} readOnly={readOnly} includeHistory={false} /> : null}
        {system.activations?.length ? <ActivationsPanel system={system} /> : null}
        {system.possibilities.length || system.storedVersionId ? <PossibilitiesPanel key={`${props.workspaceId}:${system.id}`} systemHref={props.systemHref} versionReadOnly={props.versionReadOnly} system={system} systems={systems} workspaceId={props.workspaceId} readOnly={readOnly} readOnlyReason={readOnlyReason} canMakeReal={props.canMakeReal ?? !readOnly} makeRealReason={props.makeRealReason ?? readOnlyReason} appBase={props.appBase || ""} comparingId={comparing && mode !== "current" ? comparing.id : null} onCompare={system.surface.kind === "website" ? compare : undefined} onAsk={onAsk} /> : null}
        <PartsPanel system={system} />
        <SystemContextSections {...props} system={system} websiteDetail={websiteDetail ?? undefined} siteHref={siteHref} onPrepared={() => setDetailVersion(version => version + 1)} onAskRestore={filesRequests ? () => setAskingChange(true) : undefined} />
        {system.audits?.length ? <AuditsPanel system={system} workspaceId={props.workspaceId} appBase={props.appBase || ""} /> : null}
      </aside> : null}
    </div>
    {showAside ? null : <p className={styles.askMore}><button type="button" className="underline" disabled={readOnly} title={readOnly ? readOnlyReason : undefined} onClick={() => onAsk(`What else could ${system.name} become? `)}>Ask what else {system.name} could become.</button></p>}
  </Page>{website ? <StComposerDock><StComposerBar scope={system.name} placeholder={`Ask about ${system.name}`} value={ask} onChange={setAsk} disabled={readOnly || loading} maxLength={3000} onSubmit={() => onAsk(`About ${system.name}: ${ask.trim()}`)} /></StComposerDock> : null}</>;
}

/** Spec behavior 11-12: an empty block is not drawn; nothing at all is one line under the surface. */
export function hasContext(system: SystemView): boolean {
  return Boolean(system.storedVersionId || system.activations?.length || system.possibilities.length || system.connections.length || system.offers?.length
    || system.parts?.length || system.versions.length || system.history?.length || system.audits?.length || system.builtInApp?.requiredConnections.length);
}

function ActivationsPanel({ system }: { system: SystemView }) {
  const activations = system.activations ?? [];
  return <Panel id={`${system.id}-making-live`} title={STATE_LABELS.makingReal} count={activations.length} intro="What landed stays. Check the receipt to see what settled.">
    <StRows>{activations.map(activation => <StRow key={activation.id} title={activation.title}><MakeRealProgress activation={activation} /></StRow>)}</StRows>
  </Panel>;
}

function HistoryPanel({ system, children }: { system: SystemView; children?: ReactNode }) {
  const rows = system.history ?? [];
  const when = (at: string) => {
    const date = new Date(at);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };
  return <Panel id={`${system.id}-history`} title={STATE_LABELS.history} count={0} intro="The last changes, newest first.">
    {children}
    <StRows>{rows.map(row => <StRow key={row.id} title={row.sentence} detail={actorPresentation(row.actor).credit} end={<StMono as="time" dateTime={row.at}>{when(row.at)}</StMono>} />)}</StRows>
  </Panel>;
}

/**
 * A customer's live site runs on its own origin, so it keeps its scripts. Anything
 * served from Strelva's origin (saved copies, candidates) gets no privileges.
 */
export function websiteSandbox(src: string): string {
  try {
    const url = new URL(src);
    const own = url.hostname === new URL(CONTROL_PLANE_URL).hostname || url.hostname === "localhost" || url.hostname === "127.0.0.1";
    return (url.protocol === "https:" || url.protocol === "http:") && !own ? "allow-scripts allow-same-origin allow-popups" : "";
  } catch {
    return "";
  }
}

function SystemSurface({ system, workspaceId, readOnly, versionReadOnly, useReadOnly = readOnly, canEditApplications = false, rebuildEnabled, managed, agency, canMakeReal, sources, localPreview, workspaceStopped, calendarRecoveryAllowed, inquiryAdapter, inquiryInbox }: SystemPageProps & { system: SystemView }) {
  // A registry-only inquiry System can open the released business inbox
  // without first appearing on a tenant website. Native access still applies.
  if (system.kind === "inquiries" && inquiryInbox) return <WorkspaceInquirySystem key={workspaceId} workspaceId={workspaceId} />;
  if (system.surface.kind === "inquiries") {
    const adapter = inquiryAdapter?.tenantId === system.surface.tenantId ? inquiryAdapter.adapter : undefined;
    return <InquiryServerWorkspaceExperience tenantId={system.surface.tenantId} adapter={adapter} initialView="home" basePath="/workspace" routePrefix="inquiry" />;
  }
  if (system.surface.kind === "listing") return <ListingSurface surface={system.surface} />;
  if (system.surface.kind === "newsletter" && system.publishing && !localPreview) return <ContentWorkspace key={system.id} workspaceId={workspaceId} systemId={system.id} kind="newsletter" readOnly={readOnly || system.lifecycle === "paused"} />;
  if (system.surface.kind === "newsletter") return <div className="p-6"><h2 className="text-sm font-semibold">Newsletter</h2><p className="mt-2 text-sm text-gray-muted">{system.surface.audience}</p><p className="mt-2 text-sm text-gray-muted">Each issue starts as a draft. Sending is paused. Approval keeps an immutable issue and receipt; no subscriber receives email.</p></div>;
  if (system.surface.kind !== "work") return null;
  const { workId, productId } = system.surface;
  if (productId === "home_finder") return <div className="p-6"><h2 className="text-sm font-semibold">HomeFinder</h2><p className="mt-2 text-sm text-gray-muted">Open the licensed search settings and installation evidence for this business.</p><a className={styles.linkAction} href={`/workspace/home-finder?${new URLSearchParams({ workspaceId })}`}>Open HomeFinder<ArrowUpRight size={16} aria-hidden="true" /></a></div>;
  const creatorDraft = productId === "applications" && sources.some(source => source.id === workId && source.creatorDraft === true);
  const draftEditOnly = creatorDraft && !workspaceStopped && versionReadOnly === false;
  if (productId === "applications" || productId === "scheduling" || productId === "custom-applications" || productId === "onboarding" || productId === "websites" || ((productId === "documents" || productId === "tracker") && !localPreview)) {
    return <OpenedWork key={workId} workspaceId={workspaceId} workId={workId} productId={productId} sources={sources}
      readOnly={productId === "applications" || productId === "scheduling" ? (draftEditOnly ? false : useReadOnly) : readOnly}
      canManage={draftEditOnly || !readOnly} canEdit={draftEditOnly || (canEditApplications && !readOnly)} draftEditOnly={draftEditOnly}
      workspaceStopped={workspaceStopped} calendarRecoveryAllowed={calendarRecoveryAllowed}
      rebuildEnabled={rebuildEnabled} managed={managed} canPublish={canMakeReal === true} agency={agency} />;
  }
  if (productId === "unknown" && system.views?.length) return <div className="p-6 text-sm">
    <p className="text-gray-muted">These bookings are taken on the site and kept in its own booking store. Open a view of them:</p>
    <ul className="mt-3 space-y-2">{system.views.map(view => <li key={view.id}>{view.href ? <a className="underline" href={view.href}>{view.label}</a> : <span>{view.label} · not available from here</span>}</li>)}</ul>
  </div>;
  if (productId === "unknown") return <p className="p-6 text-sm text-gray-muted">There is nothing to open for this system here yet. Its record and status are beside it.</p>;
  return <p className="p-6 text-sm text-gray-muted">This system opens in its own view. <Link className="underline" href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}&work=${encodeURIComponent(workId)}`}>Open it</Link></p>;
}

/** The listing's own surface: its health in words and What changed. */
function ListingSurface({ surface }: { surface: Extract<SystemView["surface"], { kind: "listing" }> }) {
  const when = (at: string) => {
    const date = new Date(at);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };
  return <div className="p-6">
    <p role={surface.unavailable ? "alert" : "status"} className="text-sm">{surface.healthMessage}</p>
    <h2 className="mt-6 text-sm font-semibold">{STRELVA_HANDLED_LABEL}</h2>
    {surface.receipts.length ? <ul className={styles.panelList} aria-label="Changes on Google">
      {surface.receipts.map(receipt => <li key={receipt.id}><span>{receipt.headline}</span><small>{when(receipt.at)}</small></li>)}
    </ul> : <p className="mt-2 text-sm text-gray-muted">Nothing yet. Replies, hours and posts sent to Google show here, each with what changed and how to undo it.</p>}
  </div>;
}

function PartsPanel({ system }: { system: SystemView }) {
  if (!system.parts?.length) return null;
  return <Panel id={`${system.id}-parts`} title="On this site" count={system.parts.length} intro="Content that lives on this website.">
    <ul className={styles.panelList}>{system.parts.map(part => <li key={part.label}>
      <span>{part.label}</span>
      <small>{part.published} published{part.drafts ? ` · ${part.drafts} draft${part.drafts === 1 ? "" : "s"} waiting` : ""}</small>
    </li>)}</ul>
  </Panel>;
}

function SystemLink({ id, label, systemHref, onOpenSystem }: { id?: string; label: string; systemHref: (id: string) => string; onOpenSystem?: (id: string) => void }) {
  if (!id) return <>{label}</>;
  return <Link href={systemHref(id)} onClick={event => { if (!onOpenSystem || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return; event.preventDefault(); onOpenSystem(id); }}>{label}</Link>;
}

function ConnectionsPanel({ system, systemHref, onOpenSystem, siteHref, children }: { system: SystemView; systemHref: (id: string) => string; onOpenSystem?: (id: string) => void; siteHref?: (tab: "connections" | "google") => string; children?: ReactNode }) {
  // Anything disconnected or unconfirmed shows in full; connected ones fold into one line.
  const attention = system.connections.filter(connection => connection.status !== "connected");
  const working = system.connections.filter(connection => connection.status === "connected");
  const item = (connection: SystemConnection) => <StRow key={connection.id} title={connection.sentence} detail={<>{(connection.direction === "in" ? INCOMING_CONNECTION_LABEL : CONNECTION_KIND_LABEL)[connection.kind]} <SystemLink id={connection.systemId} label={connection.target} systemHref={systemHref} onOpenSystem={onOpenSystem} />{connection.status === "connected" ? "" : connection.status === "not_connected" ? " · Not connected" : " · Not confirmed"}</>}>
    {system.surface.kind !== "website" ? <details><summary className="cursor-pointer py-2 text-sm">Open Connection details</summary><ConnectionDetail detail={connectionDetailData(connection, system.name)} embedded /></details> : null}
    {connection.contract ? <><small>Source: {connection.contract.sourceOfTruth}</small><small>{connection.contract.authority}</small><small>{connection.contract.freshness}</small><small>{connection.contract.failureBehavior}</small></> : null}
  </StRow>;
  return <Panel id={`${system.id}-connections`} title="Connections" count={system.connections.length} intro="What it works with.">
    {children}
    {attention.length ? <StRows>{attention.map(item)}</StRows> : null}
    {working.length ? <details className={styles.fold}>
      <summary>Works with {working.length} {working.length === 1 ? "thing" : "things"}</summary>
      <StRows>{working.map(item)}</StRows>
    </details> : null}
    {system.offers?.map(offer => <p key={offer.kind} className="mt-3">{offer.label}. <Link className="underline" href={siteHref ? siteHref("google") : "/dashboard/google"}>Connect Google</Link></p>)}
    {siteHref ? <p className="mt-3"><Link className="underline" href={siteHref("connections")}>Accounts and sources this site uses</Link></p> : null}
  </Panel>;
}

const makeRealResponseSchema = z.union([
  z.object({ live: z.object({ live: z.literal(true), status: z.string(), headline: z.string(), activationId: z.string().nullable() }) }),
  z.object({ result: z.object({ isolated: z.literal(true), status: z.enum(["in_progress", "needs_attention", "made_real", "rolled_back"]), headline: z.string(),
    done: z.array(z.object({ label: z.string(), mode: z.string().nullable() })), waiting: z.array(z.object({ label: z.string(), reason: z.string() })),
    unknown: z.array(z.string()), notStarted: z.array(z.string()), liveUnchanged: z.boolean(), notConnected: z.array(z.string()) }) }),
]);

async function requestMakeReal(request: typeof fetch, workspaceId: string, possibilityId: string, executionMode: "live" | "rehearsal"): Promise<MakeRealOutcome> {
  try {
    const response = await request("/api/workspace/systems/make-real", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, possibilityId, executionMode }),
    });
    const body: unknown = await response.json().catch(() => null);
    const parsed = makeRealResponseSchema.safeParse(body);
    if (response.ok && parsed.success) {
      if ("live" in parsed.data) return { kind: "live", headline: parsed.data.live.headline, started: Boolean(parsed.data.live.activationId) };
      return { kind: "result", result: parsed.data.result };
    }
    const error = z.object({ error: z.string() }).safeParse(body);
    if (response.status === 403) return { kind: "permission", message: error.success ? error.data.error : "Only an owner of this business can make a possibility real." };
    return { kind: "error", message: `${error.success ? error.data.error : "Making this change live could not be confirmed."} Reload this System to check what landed before trying another change.` };
  } catch {
    return { kind: "error", message: "The response to making this change live was lost. It may have started. Reload this System to check what landed before trying another change." };
  }
}

function MakeRealState({ outcome, onAsk, title }: { outcome: MakeRealOutcome; onAsk: (request: string) => void; title: string }) {
  if (outcome.kind === "live") return <div role="status" className={styles.makeRealNotice} aria-label="Live change result">
    <h3>{outcome.headline}</h3>
    <p>{outcome.started ? "This change has started. Reload this System to see what landed and what still needs attention." : "Reload this System to check the current outcome before trying another change."}</p>
  </div>;
  if (outcome.kind !== "result") return <p role={outcome.kind === "error" ? "alert" : "status"} className={styles.makeRealNotice}>{outcome.message}</p>;
  const { result } = outcome;
  return <div role="status" className={styles.makeRealNotice} aria-label="Live change result">
    <h3>{result.headline}</h3>
    <p>{makeRealSummary(result)}</p>
    {result.done.length ? <><h3>Done in the isolated copy</h3><ul>{result.done.map(item => <li key={item.label}>{item.label}</li>)}</ul></> : null}
    {result.waiting.length ? <><h3>Waiting</h3><ul>{result.waiting.map(item => <li key={item.label}>{item.label}: {item.reason}</li>)}</ul></> : null}
    {result.unknown.length ? <><h3>Outcome not known</h3><ul>{result.unknown.map(item => <li key={item}>{item}</li>)}</ul></> : null}
    {result.notStarted.length ? <><h3>Not started</h3><ul>{result.notStarted.map(item => <li key={item}>{item}</li>)}</ul></> : null}
    {result.notConnected.length ? <><h3>Not connected</h3><ul>{result.notConnected.map(item => <li key={item}>{item}</li>)}</ul></> : null}
    <button type="button" className="underline" onClick={() => onAsk(`Make this real: ${title}. `)}>Ask to finish it</button>
  </div>;
}

function PossibilitiesPanel({ systemHref, versionReadOnly, system, systems, workspaceId, readOnly, readOnlyReason, canMakeReal, makeRealReason, appBase, comparingId, onCompare, onAsk }: { systemHref: (id: string) => string; versionReadOnly?: boolean; system: SystemView; systems: readonly SystemView[]; workspaceId: string; readOnly: boolean; readOnlyReason?: string; canMakeReal: boolean; makeRealReason?: string; appBase: string; comparingId: string | null; onCompare?: (possibility: SystemPossibility) => void; onAsk: (request: string) => void }) {
  const request = useWorkspaceRequest();
  const [outcome, setOutcome] = useState<{ id: string; outcome: MakeRealOutcome } | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const inFlight = useRef(false);
  const [needsReload, setNeedsReload] = useState(false);
  const [versionCount, setVersionCount] = useState(0);
  async function makeReal(possibility: SystemPossibility) {
    if (inFlight.current || needsReload || !canMakeReal || readOnly || possibility.status !== "ready" || possibility.staleReason || !possibility.executionAvailability || possibility.executionAvailability === "unavailable") return;
    inFlight.current = true;
    setRunning(possibility.id);
    setOutcome(null);
    const next = await requestMakeReal(request, workspaceId, possibility.id, possibility.executionAvailability);
    setOutcome({ id: possibility.id, outcome: next });
    setNeedsReload(next.kind === "live" || next.kind === "error" || next.kind === "permission");
    inFlight.current = false;
    setRunning(null);
  }
  return <Panel id={`${system.id}-possibilities`} title="Possibilities" count={system.possibilities.length + versionCount} intro="Alternatives you can open and compare before anything changes.">
    {system.possibilities.length ? <StRows>{system.possibilities.map(possibility => {
      const scope = possibilityScope(possibility, systems);
      const execution = possibility.executionAvailability ?? "unavailable";
      const blockedReason = readOnly || !canMakeReal ? makeRealReason || readOnlyReason || "Only an owner of this business can make a possibility real." : execution === "unavailable" ? "Live execution is unavailable for this Possibility. You can still open and compare it." : possibility.staleReason ? "Refresh this Possibility before making it real." : possibility.status !== "ready" ? "Still being explored. It can be made real once it is ready." : needsReload ? "Reload this System to check the current outcome before making another change." : running ? "Wait for the current live change request to finish." : undefined;
      return <StRow key={possibility.id} title={possibility.title} detail={possibility.summary}>
        <StState kind="draft">{POSSIBILITY_STATUS_LABEL[possibility.status]}</StState>
        {possibility.staleReason ? <small role="note">{possibility.staleReason} A fresh check is needed.</small> : null}
        {possibility.evidence ? <small>{possibility.evidence}</small> : null}
        <small>Changes: {scope.join(", ")}</small>
        <span className={styles.possibilityActions}>
          {onCompare && possibility.previewSrc ? <StPill variant="soft" aria-pressed={comparingId === possibility.id} onClick={() => onCompare(possibility)}>Compare</StPill> : null}
          {possibility.openHref ? <StPillLink variant="soft" href={`${appBase}${possibility.openHref}`}>{possibility.tryHref ? "Try it as a visitor" : "Open"}</StPillLink> : null}
          <StPill variant={system.possibilities.length === 1 || comparingId === possibility.id ? "primary" : "soft"} disabled={Boolean(blockedReason)} busy={running === possibility.id} title={blockedReason} onClick={() => void makeReal(possibility)}>{running === possibility.id ? execution === "rehearsal" ? "Rehearsing…" : "Making it live…" : execution === "rehearsal" ? "Rehearse this change" : execution === "unavailable" ? "Live unavailable" : "Make it live"}</StPill>
        </span>
        {comparingId === possibility.id && possibility.previewSrc && system.surface.kind !== "website" ? <PossibilityComparison title={possibility.title}
          live={<StEmpty>The current System is open above. A visitor preview has not been recorded.</StEmpty>}
          candidate={<iframe title={`${possibility.title}, not live`} src={possibility.previewSrc} sandbox="" referrerPolicy="no-referrer" />}
          staleReason={possibility.staleReason} scope={scope.join(", ")} /> : null}
        {blockedReason ? <small>{blockedReason}</small> : execution === "rehearsal" ? <small>Runs in an isolated copy. Your live Systems stay unchanged.</small> : null}
        {outcome?.id === possibility.id ? <MakeRealState outcome={outcome.outcome} onAsk={onAsk} title={possibility.title} /> : null}
      </StRow>;
    })}</StRows> : system.storedVersionId ? null : <p className="mt-3">No alternatives are being explored. <button type="button" className="underline" disabled={readOnly} title={readOnly ? readOnlyReason : undefined} onClick={() => onAsk(`What else could ${system.name} become? `)}>Ask what else it could become</button></p>}
    {needsReload ? <a className={styles.linkAction} href={systemHref(system.id)}>Reload this System</a> : null}
    {system.storedVersionId ? <SystemVersionImprovements key={`${workspaceId}:${system.id}:${system.storedVersionId}`} workspaceId={workspaceId} systemId={system.id} versionId={system.storedVersionId} readOnly={versionReadOnly ?? readOnly} canMakeReal={canMakeReal} onCount={setVersionCount} /> : null}
  </Panel>;
}

/** Audits are issued results about this website, not Systems. A rebuild they lead to shows under Possibilities. */
function AuditsPanel({ system, workspaceId, appBase }: { system: SystemView; workspaceId: string; appBase: string }) {
  const audits = system.audits ?? [];
  return <Panel id={`${system.id}-audits`} title="Audits" count={audits.length} intro="Checks of this site at a point in time. They change nothing on their own.">
    <ul className={styles.panelList}>{audits.map(audit => <li key={audit.workId}>
      <a href={`${appBase}/workspace?workspaceId=${encodeURIComponent(workspaceId)}&work=${encodeURIComponent(audit.workId)}`}>{audit.title}</a>
      <small><time dateTime={audit.at}>{new Date(audit.at).toLocaleDateString()}</time></small>
    </li>)}</ul>
  </Panel>;
}

function VersionsPanel({ system, systemHref, onOpenSystem }: { system: SystemView; systemHref: (id: string) => string; onOpenSystem?: (id: string) => void }) {
  return <Panel id={`${system.id}-versions`} title="Versions" count={system.versions.length} intro="The same system, adapted for another location or client. Records and access never carry over.">
    {system.versions.length ? <StRows>{system.versions.map(version => <StRow key={version.id} title={<>{version.relation === "source" ? "Source · " : ""}<SystemLink id={version.systemId} label={version.title} systemHref={systemHref} onOpenSystem={onOpenSystem} /></>} detail={<>{version.context} · {version.lineage}</>}>
      {version.relation === "version" ? version.comparison?.state === "ready" ? version.comparison.changes.length ? <details className="min-w-0 w-full">
        <summary className="cursor-pointer py-3">What changed here · {version.comparison.changes.length}</summary>
        <p className="mb-3 text-gray-muted">Local draft changes over this Version’s source baseline.</p>
        <ul className="space-y-4">{version.comparison.changes.map(change => <li key={change.path} className="min-w-0">
          <p className="font-medium break-words">{change.path}</p>
          <dl className="mt-2 grid min-w-0 gap-3 sm:grid-cols-2">
            <div className="min-w-0"><dt className="text-gray-muted">Source baseline</dt><dd className="mt-1 whitespace-pre-wrap break-words">{!change.beforePresent ? "Not present" : typeof change.before === "string" ? change.before : JSON.stringify(change.before, null, 2)}</dd></div>
            <div className="min-w-0"><dt className="text-gray-muted">This Version</dt><dd className="mt-1 whitespace-pre-wrap break-words">{!change.afterPresent ? "Removed" : typeof change.after === "string" ? change.after : JSON.stringify(change.after, null, 2)}</dd></div>
          </dl>
        </li>)}</ul>
      </details> : <small>No local definition changes.</small> : <small>Definition changes: Not verified.</small> : null}
    </StRow>)}</StRows> : <p className="mt-3">It runs in one context today.</p>}
  </Panel>;
}

/** Same decision identity/title as the owner deck; all actions stay in that deck. */
function SystemContextSections(props: SystemPageProps & { system: SystemView; siteHref?: (tab: "connections" | "google") => string; onPrepared?: () => void; onAskRestore?: () => void }) {
  const { system, websiteDetail, siteHref } = props;
  const compose = ({ draft, connections, history }: { draft?: ReactNode; connections?: ReactNode; history?: ReactNode }) => <>
    {system.connections.length || system.offers?.length || siteHref || system.storedVersionId || (websiteDetail?.status === "ready" && websiteDetail.detail.domains.length) ? <ConnectionsPanel system={system.kind === "website" && websiteDetail?.status === "ready" ? { ...system, connections: [...system.connections, ...websiteDomainConnections(websiteDetail.detail)] } : system} systemHref={props.systemHref} onOpenSystem={props.onOpenSystem} siteHref={siteHref}>{connections}</ConnectionsPanel> : null}
    {system.versions.length ? <VersionsPanel system={system} systemHref={props.systemHref} onOpenSystem={props.onOpenSystem} /> : null}
    {draft ? <Panel id={`${system.id}-version-draft`} title="Version draft" count={1} intro="Local changes stay in this business’s working draft.">{draft}{system.surface.kind !== "website" ? <SystemCreator workspaceId={props.workspaceId} systemId={system.id} /> : null}</Panel> : null}
    {system.kind === "website" && websiteDetail?.status === "ready" ? <WebsiteHistoryPanel workspaceId={props.workspaceId} systemId={system.id} state={websiteDetail} systemHistory={system.history} canRestore={!props.readOnly && (props.operator || (props.canMakeReal ?? true))} appBase={props.appBase} onPrepared={props.onPrepared} onAskRestore={props.onAskRestore}>{history}</WebsiteHistoryPanel>
      : system.history?.length || system.storedVersionId ? <HistoryPanel system={system}>{history}</HistoryPanel> : null}
  </>;
  const needs = system.builtInApp?.requiredConnections.length ? <BuiltInNeeds workspaceId={props.workspaceId} requirements={system.builtInApp.requiredConnections} /> : null;
  return system.storedVersionId ? <SystemVersionManagement workspaceId={props.workspaceId} systemId={system.id} versionId={system.storedVersionId} readOnly={props.versionReadOnly ?? props.readOnly} compose={compose} /> : <>{compose({})}{needs}</>;
}

/** What a built-in App's current Release needs, with each Connection's real state. Reads Connections only when it renders. */
function BuiltInNeeds({ workspaceId, requirements }: { workspaceId: string; requirements: NonNullable<SystemView["builtInApp"]>["requiredConnections"] }) {
  const needs = useConnectionRead(workspaceId, useWorkspaceRequest(), true);
  return <RequiredConnections requirements={requirements} read={needs.read} workspaceId={workspaceId} retry={needs.retry} footer="Required accounts are checked again when you make it live." />;
}

function SystemNeedsYou({ system, state, agencyState, businessName, workspaceId, appBase = "" }: { system: SystemView; state?: NeedsYouState; agencyState?: AgencyClientHomeState; businessName?: string; workspaceId: string; appBase?: string }) {
  if (agencyState) {
    if (agencyState.status === "disabled") return null;
    const title = `Waiting on ${businessName || "the business"}`;
    const decisions = agencyState.status === "ready" && agencyState.data.workspaceId === workspaceId ? agencyState.data.decisions.filter(item => item.systemId === system.id && item.state === "open") : [];
    return <StSection title={title}>
      {agencyState.status === "loading" ? <StSkeleton label="Checking shared decision status" /> : agencyState.status === "error" ? <StNotice tone="critical">Shared decisions could not be checked.</StNotice> : decisions.length ? <StRows label={title}>{decisions.map(item => <StRow key={item.id} title={item.title} href={`${appBase}${clientDecisionHref(workspaceId, item.id)}#decision-${item.id}`} end={title} />)}</StRows> : <StEmpty>No shared decisions are waiting for this System.</StEmpty>}
      <p className="text-sm text-gray-muted">Read-only · the business decides.</p>
    </StSection>;
  }
  if (!state || state.status === "disabled") return null;
  const title = `${PLACE_LABELS.needsYou} for this System`;
  if (state.status === "loading") return <StSection title={title}><StSkeleton label="Checking decisions for this System" /></StSection>;
  if (state.status === "error") return <StSection title={title}><StNotice tone="critical">{state.message}</StNotice></StSection>;
  const items = state.items.filter(item => item.workspaceId === workspaceId && item.systemId === system.id);
  return <StSection title={title}>
    {!state.complete ? <StNotice>Some decisions could not be checked.</StNotice> : null}
    {items.length ? <StRows label={title}>{items.map(item => <StRow key={item.id} title={item.title} detail={item.detail} href={`${appBase}${clientDecisionHref(workspaceId, item.id)}#decision-${item.id}`} end="Review in Needs you" />)}</StRows> : state.complete ? <StEmpty>No decisions are waiting for this System.</StEmpty> : null}
  </StSection>;
}
