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
import { ArrowUpRight, History } from "lucide-react";
import { XaAnswers, XaButton, XaButtonLink, XaComposer, XaComposerDock, XaDecision, XaEmpty, XaHeadline, XaSays, XaStatus, XaSystemTile, XaTextLink, XaYes } from "@/components/ui/strelva/Xa";
import { SidePanel, SystemHead } from "./xa/SystemHead";
import { PossibilityView } from "./xa/PossibilityView";
import { WebsiteHistoryView } from "./xa/WebsiteHistoryView";
import { requestMakeReal } from "./make-real-request";
import x from "./xa/system-xa.module.css";
import { InquiryServerWorkspaceExperience } from "@/experience/inquiries/InquiryServerExperience";
import type { InquirySurfaceAdapter } from "@/experience/inquiries/contracts";
import { OpenedWork } from "@/experience/workspace/OpenedWork";
import type { WorkspaceWork } from "@/experience/workspace/contracts";
import { possibilityScope } from "./from-workspace";
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
import styles from "./systems.module.css";
import { StEmpty, StMono, StNotice, StPill, StPillLink, StRows, StRow, StSection, StSkeleton, StState } from "@/components/ui/strelva/Kit";
import { ConnectionDetail, connectionDetailData } from "./ConnectionDetail";
import { MakeRealProgress } from "./MakeRealProgress";
import { PossibilityComparison } from "./PossibilityComparison";

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
  /** Open a website straight at its History (S6) or one Possibility side by side (S5), e.g. from a link in Today. */
  initialView?: "site" | "history";
  initialPossibilityId?: string;
}

/**
 * Opening a System gives most of the space to the actual thing; what it
 * reads, checks and could become sits beside it (XA · S1, S4). A website
 * also opens its History (S6) and a Possibility side by side (S5) in place.
 */
export function SystemPage(props: SystemPageProps) {
  const { system, systems, readOnly, readOnlyReason, loading, onHome, onAsk } = props;
  const [compareId, setCompareId] = useState<string | null>(props.initialPossibilityId ?? null);
  const [mode, setMode] = useState<"current" | "possibility" | "both">(props.initialPossibilityId ? "both" : "current");
  const [view, setView] = useState<"site" | "history">(props.initialView ?? "site");
  // A managed website (Strelva edits it, or every change is a repo Request): "Ask for a change" files a Request.
  const [askingChange, setAskingChange] = useState(false);
  const [ask, setAsk] = useState("");
  const [detailVersion, setDetailVersion] = useState(0);
  const fetchedDetail = useWebsiteSystemDetail(props.workspaceId, system?.id ?? "", Boolean(system && system.kind === "website" && !props.websiteDetail), detailVersion);
  const websiteDetail = props.websiteDetail ?? fetchedDetail;
  const siteHref = props.operator && system && system.surface.kind === "website" && system.surface.editing ? (tab: "connections" | "google") => workspaceSiteHref({ workspaceId: props.workspaceId, systemId: system.id, tab }, props.appBase || "") : undefined;
  const back = <button type="button" className={x.back} onClick={onHome}>‹ Home</button>;
  if (loading && !system) return <div className={x.screen} aria-busy="true">{back}<XaEmpty size="sm" pose="alone" title="Opening this system…" job="Pebble is reading its latest state" /><StSkeleton label="Opening this system" /></div>;
  if (!system) return <div className={x.screen}>{back}<XaEmpty size="sm" pose="alone" title="This system isn’t available here." job="Pebble checked this business and found nothing under that name">It may belong to another business, or your access may have changed. Nothing about it was changed.</XaEmpty></div>;
  // Website panels and the site's own editor links count as context too.
  const filesRequests = system.kind === "website" && system.surface.kind === "website" && Boolean(system.surface.editing) && !readOnly;
  const showAside = hasContext(system) || (system.kind === "website" && hasWebsiteDetail(websiteDetail)) || Boolean(siteHref) || (filesRequests && askingChange);
  function askForChange() {
    if (filesRequests) setAskingChange(true);
    else onAsk(`About ${system!.name}: `);
  }

  const comparing = system.possibilities.find(item => item.id === compareId && item.previewSrc);
  function compare(possibility: SystemPossibility) {
    setCompareId(possibility.id);
    setMode("both");
  }
  const healthTone = system.health.state === "blocked" || system.health.state === "degraded" ? "waits" as const : undefined;
  const healthLine = `${HEALTH_LABEL[system.health.state]}. ${system.health.summary}`;
  const lifecycleStatus = { kind: system.lifecycle === "live" ? "live" as const : "draft" as const, label: LIFECYCLE_LABEL[system.lifecycle], breathe: system.lifecycle === "live" };
  const askButton = <XaButton disabled={readOnly} title={readOnly ? readOnlyReason : undefined} aria-expanded={filesRequests ? askingChange : undefined} onClick={askForChange}>Ask for a change</XaButton>;
  const readOnlyLine = readOnly && readOnlyReason ? <p className={x.note} role="note">{readOnlyReason}</p> : null;
  const agencyLine = system.operatedBy ? <p className={x.quiet}>Agency of record: {system.operatedBy}</p> : system.providerIdentityStatus === "unavailable" ? <p className={x.quiet}>Agency identity could not be loaded</p> : system.providerIdentityStatus === "unassigned" ? <p className={x.quiet}>No agency of record</p> : null;
  const pausedLine = system.lifecycle === "paused" ? <p className={x.sentence} role="note">{PAUSED_KEEPS[system.kind] ?? "Paused. Its records are kept."}</p> : null;
  const needsYou = <SystemNeedsYou system={system} state={props.needsYou} agencyState={props.agencyDecisions} businessName={props.businessName} workspaceId={props.workspaceId} appBase={props.appBase} />;

  if (system.surface.kind !== "website") {
    const titled = system.surface.kind !== "work";
    const tileKind = system.surface.kind === "work" ? system.surface.productId === "unknown" ? system.kind : system.surface.productId : system.kind;
    // S4: a System in Draft. One ready alternative that can go live is the yes; anything else stays in its own controls.
    const ready = system.possibilities.filter(item => item.status === "ready" && !item.staleReason && item.executionAvailability === "live");
    const heldByYes = system.lifecycle === "draft" && ready.length === 1 && system.possibilities.length === 1 ? ready[0] : undefined;
    const aside = showAside ? <div className={x.side} aria-label={`About ${system.name}`}>
      {system.activations?.length ? <ActivationsPanel system={system} /> : null}
      {(system.possibilities.length && !heldByYes) || system.storedVersionId ? <PossibilitiesPanel key={`${props.workspaceId}:${system.id}`} systemHref={props.systemHref} versionReadOnly={props.versionReadOnly} system={system} systems={systems} workspaceId={props.workspaceId} readOnly={readOnly} readOnlyReason={readOnlyReason} canMakeReal={props.canMakeReal ?? !readOnly} makeRealReason={props.makeRealReason ?? readOnlyReason} appBase={props.appBase || ""} comparingId={compareId} onCompare={compare} onAsk={onAsk} heldByYes={heldByYes?.id} /> : null}
      <SystemContextSections {...props} system={system} />
    </div> : <p className={x.note}><XaTextLink onClick={readOnly ? undefined : () => onAsk(`What else could ${system.name} become? `)}>Ask what else {system.name} could become.</XaTextLink></p>;
    const surface = <section className={x.main} aria-label={`${system.name}, the actual ${SYSTEM_KIND_LABEL[system.kind].toLowerCase()}`}><SystemSurface {...props} system={system} /></section>;
    if (system.lifecycle === "draft") return <div className={x.screen} aria-busy={loading || undefined}>
      {back}
      <div className={x.draft}>
        <div className={x.brief}>
          <XaSystemTile kind={tileKind} size={64} />
          <XaHeadline size="sm" quiet="Draft. Nobody outside your business can see it yet.">{titled ? system.name : system.detail || system.name}</XaHeadline>
          <XaAnswers labelWidth={150} rows={[
            ...(system.operatedBy ? [["Made by", system.operatedBy] as const] : []),
            ...(system.builtInApp ? [["Runs on", system.builtInApp.label] as const] : []),
            ...(system.detail && titled ? [["What it is for", system.detail] as const] : []),
            ...connectionAnswers(system),
            ["Checks", healthLine] as const,
          ]} />
          {readOnlyLine}
          {needsYou}
        </div>
        <XaDecision label={`${system.name}, not live yet`} status={<XaStatus kind="draft">Draft</XaStatus>} meta="Nothing is live"
          yes={heldByYes ? <DraftYes key={`${props.workspaceId}:${system.id}:${heldByYes.id}`} possibility={heldByYes} workspaceId={props.workspaceId} systemHref={props.systemHref(system.id)} blockedReason={readOnly || props.canMakeReal === false ? props.makeRealReason || readOnlyReason || "Only an owner of this business can make a possibility real." : undefined} />
            : <p className={x.quiet}>Nothing is waiting for a yes yet. {readOnly ? null : <XaTextLink onClick={askForChange}>Ask for a change</XaTextLink>}</p>}>
          {surface}
        </XaDecision>
        <div className={x.draftAside}>{aside}</div>
      </div>
    </div>;
    return <div className={x.screen} aria-busy={loading || undefined}>
      <SystemHead kind={tileKind} back={back} title={titled ? system.name : system.detail || SYSTEM_KIND_LABEL[system.kind]}
        status={system.lifecycle === "live" ? (healthTone ? { kind: "waits", label: HEALTH_LABEL[system.health.state] } : lifecycleStatus) : { kind: "draft", label: LIFECYCLE_LABEL[system.lifecycle] }}
        line={<>{system.builtInApp ? `${system.builtInApp.label} · ` : `${SYSTEM_KIND_LABEL[system.kind]} · `}{healthLine}</>} tone={healthTone}
        actions={askButton} />
      {readOnlyLine}{agencyLine}{pausedLine}
      {needsYou}
      <div className={x.body} data-side={showAside ? undefined : "none"}>
        {surface}
        {showAside ? aside : null}
      </div>
      {showAside ? null : aside}
    </div>;
  }

  const website = system.kind === "website";
  const surface = system.surface;
  const withSurface = { ...system, surface };
  if (website && view === "history") return <WebsiteHistoryView workspaceId={props.workspaceId} systemId={system.id} siteName={system.name} state={websiteDetail} systemHistory={system.history} canRestore={!readOnly && (props.operator || (props.canMakeReal ?? true))} appBase={props.appBase} onBack={() => setView("site")} onPrepared={() => setDetailVersion(version => version + 1)} onAskRestore={filesRequests ? () => { setView("site"); setAskingChange(true); } : undefined} />;
  if (comparing && mode !== "current") {
    return <PossibilityView system={withSurface} systems={systems} possibility={comparing} workspaceId={props.workspaceId} appBase={props.appBase || ""} readOnly={readOnly} canMakeReal={props.canMakeReal ?? !readOnly} blockedReason={readOnly || props.canMakeReal === false ? props.makeRealReason || readOnlyReason : undefined} systemHref={props.systemHref} sandbox={websiteSandbox} onBack={() => { setMode("current"); setCompareId(null); }} />;
  }
  const checks = system.health.signals ?? [];
  const reads = system.connections.filter(connection => connection.kind === "read" && connection.status === "connected");
  const checkedAt = system.health.lastVerifiedAt ? new Date(system.health.lastVerifiedAt) : null;
  // The one thing that waits sits on the composer, beside where the owner would type (LX · Composer · With a yes).
  const waitingPossibility = readOnly ? undefined : system.possibilities.find(item => item.previewSrc && item.status === "ready" && !item.staleReason);
  const waitingDecision = website && websiteDetail?.status === "ready" ? websiteDetail.detail.waiting.find(item => item.href) : undefined;
  const waitingItem = waitingPossibility ? { kicker: "Waits for you · a Possibility", title: waitingPossibility.title, from: { pebble: true } as const, action: <XaButton size="sm" onClick={() => compare(waitingPossibility)}>Compare</XaButton> }
    : waitingDecision?.href ? { kicker: "Waits for you", title: waitingDecision.title, from: { pebble: true } as const, action: <XaButtonLink size="sm" href={waitingDecision.href}>Review</XaButtonLink> } : undefined;
  const websiteAside = showAside || checks.length > 0 || reads.length > 0;
  const historyReady = website && websiteDetail?.status === "ready" && (websiteDetail.detail.history.length > 0 || Boolean(system.history?.length));
  return <><div className={x.screen} data-lifecycle={system.lifecycle} aria-busy={loading || undefined}>
    <SystemHead kind="website" back={back} title={system.name} status={healthTone ? { kind: "waits", label: HEALTH_LABEL[system.health.state] } : lifecycleStatus} line={healthTone ? undefined : system.health.state === "healthy" ? system.health.summary : healthLine} tone={healthTone}
      actions={<>
        {historyReady ? <XaButton onClick={() => setView("history")}><History size={14} aria-hidden="true" />History</XaButton> : null}
        {askButton}
        {surface.liveUrl ? <XaButtonLink variant="primary" href={surface.liveUrl} target="_blank" rel="noreferrer"><ArrowUpRight size={14} aria-hidden="true" />Open site</XaButtonLink> : null}
      </>} />
    {surface.editing || surface.manageHref || system.operatedBy ? <p className={x.textLinks}>
      {system.operatedBy ? <span className={x.quiet}>Agency of record: {system.operatedBy}</span> : null}
      {surface.editing ? <a href={workspaceSiteHref({ workspaceId: props.workspaceId, systemId: system.id, tab: "request" }, props.appBase || "")}>Changes to this site</a>
        : surface.manageHref ? <a href={surface.manageHref}>Website controls</a> : null}
    </p> : null}
    {healthTone ? <div role="status"><XaSays>{system.health.summary}</XaSays></div> : null}
    {readOnlyLine}{pausedLine}
    {system.storedVersionId ? <SystemCreator workspaceId={props.workspaceId} systemId={system.id} /> : null}
    {needsYou}
    <div className={x.body} data-side={websiteAside ? undefined : "none"}>
      <section className={x.main} data-kind={surface.kind} aria-label={`${system.name}, the actual ${SYSTEM_KIND_LABEL[system.kind].toLowerCase()}`}>
        <WebsiteSystemCanvas system={withSurface} comparing={comparing} mode={mode} onModeChange={setMode} sandbox={websiteSandbox} />
        {system.publishing && !props.localPreview ? <ContentWorkspace key={system.id} workspaceId={props.workspaceId} systemId={system.id} kind="website" readOnly={readOnly || system.lifecycle === "paused"} /> : null}
      </section>
      {websiteAside ? <aside className={x.side} aria-label={`About ${system.name}`}>
        {filesRequests && askingChange ? <WebsiteChangeAsk workspaceId={props.workspaceId} systemId={system.id} siteName={system.name} onFiled={() => setDetailVersion(version => version + 1)} onClose={() => setAskingChange(false)} /> : null}
        {checks.length ? <SidePanel title="Checks" intro={checkedAt && !Number.isNaN(checkedAt.getTime()) ? `Last checked ${checkedAt.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : undefined}>
          <ul className={x.facts} aria-label="Website health evidence">{checks.map(signal => <li key={signal}><span>{signal}</span></li>)}</ul>
        </SidePanel> : null}
        {reads.length ? <SidePanel title="Reads from"><ul className={x.chips}>{reads.map(connection => <li key={connection.id} className={x.chip} title={connection.sentence}>{connection.target}</li>)}</ul></SidePanel> : null}
        {website && websiteDetail ? <WebsiteSystemPanels workspaceId={props.workspaceId} systemId={system.id} state={websiteDetail} onAsk={onAsk} onAskChange={filesRequests ? () => setAskingChange(true) : undefined} readOnly={readOnly} includeHistory={false} /> : null}
        {system.activations?.length ? <ActivationsPanel system={system} /> : null}
        {system.possibilities.length || system.storedVersionId ? <PossibilitiesPanel key={`${props.workspaceId}:${system.id}`} systemHref={props.systemHref} versionReadOnly={props.versionReadOnly} system={system} systems={systems} workspaceId={props.workspaceId} readOnly={readOnly} readOnlyReason={readOnlyReason} canMakeReal={props.canMakeReal ?? !readOnly} makeRealReason={props.makeRealReason ?? readOnlyReason} appBase={props.appBase || ""} comparingId={null} onCompare={compare} onAsk={onAsk} /> : null}
        <PartsPanel system={system} />
        <SystemContextSections {...props} system={system} websiteDetail={websiteDetail ?? undefined} siteHref={siteHref} onPrepared={() => setDetailVersion(version => version + 1)} onAskRestore={filesRequests ? () => setAskingChange(true) : undefined} />
        {system.audits?.length ? <AuditsPanel system={system} workspaceId={props.workspaceId} appBase={props.appBase || ""} /> : null}
        {checkedAt && !Number.isNaN(checkedAt.getTime()) && system.health.state === "healthy" ? <XaSays>Pebble last checked the site {checkedAt.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}. Every check passed.</XaSays> : null}
      </aside> : null}
    </div>
    {showAside ? null : <p className={x.note}><XaTextLink onClick={readOnly ? undefined : () => onAsk(`What else could ${system.name} become? `)}>Ask what else {system.name} could become.</XaTextLink></p>}
  </div><XaComposerDock><XaComposer waiting={waitingItem} placeholder={`Ask for a change to ${system.name}`} inputLabel={`Ask Strelva about ${system.name}`} value={ask} onChange={setAsk} disabled={readOnly || loading} maxLength={3000} onSubmit={() => onAsk(`About ${system.name}: ${ask.trim()}`)} /></XaComposerDock></>;
}

/** Plain answers about what a System reads and where its answers go, from its recorded Connections. */
function connectionAnswers(system: SystemView): Array<readonly [string, string]> {
  const reads = system.connections.filter(item => item.kind === "read").map(item => item.target);
  const sends = system.connections.filter(item => item.kind === "share" || item.kind === "act" || item.kind === "trigger").map(item => item.target);
  const appears = system.connections.filter(item => item.kind === "appear" && item.direction !== "in").map(item => item.target);
  return [
    ...(appears.length ? [["Appears in", appears.join(", ")] as const] : []),
    ...(reads.length ? [["Reads from", reads.join(", ")] as const] : []),
    ...(sends.length ? [["Answers go to", sends.join(", ")] as const] : []),
  ];
}

/** S4's yes for a Draft System with one ready alternative: the same Make real call as the list, said as one gesture. */
function DraftYes({ possibility, workspaceId, systemHref, blockedReason }: { possibility: SystemPossibility; workspaceId: string; systemHref: string; blockedReason?: string }) {
  const request = useWorkspaceRequest();
  const [state, setState] = useState<"waiting" | "going" | "live" | "expired">("waiting");
  const [outcome, setOutcome] = useState<MakeRealOutcome | null>(null);
  const inFlight = useRef(false);
  async function yes() {
    if (inFlight.current || blockedReason) return;
    inFlight.current = true;
    setState("going");
    const next = await requestMakeReal(request, workspaceId, possibility.id, "live");
    inFlight.current = false;
    setOutcome(next);
    setState(next.kind === "live" ? "live" : "expired");
  }
  const message = outcome?.kind === "result" ? `${outcome.result.headline} ${makeRealSummary(outcome.result)}` : outcome && outcome.kind !== "live" ? outcome.message : null;
  return <>
    <XaYes state={state} onYes={() => void yes()} disabledReason={blockedReason}
      working={{ title: outcome?.kind === "live" ? outcome.headline : "Putting it live", steps: state === "going" ? [{ id: "ask", label: "Asking to put it live", state: "active" }] : outcome?.kind === "live" ? [{ id: "ask", label: outcome.started ? "Started. Reload to see what landed." : "Reload to check the current outcome.", state: "done" }] : [] }}
      liveLabel={outcome?.kind === "live" ? outcome.headline : undefined} />
    {message ? <div role={outcome?.kind === "result" ? "status" : "alert"}><XaSays links={outcome?.kind === "result" ? undefined : [<XaTextLink key="reload" href={systemHref}>Reload now</XaTextLink>]}>{message}</XaSays></div> : null}
  </>;
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

function PossibilitiesPanel({ systemHref, versionReadOnly, system, systems, workspaceId, readOnly, readOnlyReason, canMakeReal, makeRealReason, appBase, comparingId, onCompare, onAsk, heldByYes }: { heldByYes?: string; systemHref: (id: string) => string; versionReadOnly?: boolean; system: SystemView; systems: readonly SystemView[]; workspaceId: string; readOnly: boolean; readOnlyReason?: string; canMakeReal: boolean; makeRealReason?: string; appBase: string; comparingId: string | null; onCompare?: (possibility: SystemPossibility) => void; onAsk: (request: string) => void }) {
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
          {heldByYes === possibility.id ? null : <StPill variant={system.surface.kind !== "website" && (system.possibilities.length === 1 || comparingId === possibility.id) ? "primary" : "soft"} disabled={Boolean(blockedReason)} busy={running === possibility.id} title={blockedReason} onClick={() => void makeReal(possibility)}>{running === possibility.id ? execution === "rehearsal" ? "Rehearsing…" : "Making it live…" : execution === "rehearsal" ? "Rehearse this change" : execution === "unavailable" ? "Live unavailable" : "Make it live"}</StPill>}
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
