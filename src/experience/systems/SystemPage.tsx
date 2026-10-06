"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ArrowLeft, ArrowUpRight, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { InquiryServerWorkspaceExperience } from "@/experience/inquiries/InquiryServerExperience";
import type { InquirySurfaceAdapter } from "@/experience/inquiries/contracts";
import { BoundedWorkExperience } from "@/experience/operations/BoundedWorkExperience";
import { CustomApplicationManageExperience } from "@/experience/custom-applications/CustomApplicationManageExperience";
import { WebsiteExperience } from "@/experience/websites/WebsiteExperience";
import { websiteDocumentVersion } from "@/experience/websites/contracts";
import { DocumentExperience } from "@/experience/workspace/DocumentExperience";
import { OnboardingWorkspaceExperience } from "@/experience/workspace/OnboardingWorkspaceExperience";
import { TrackerExperience } from "@/experience/workspace/TrackerExperience";
import type { WorkspaceWork } from "@/experience/workspace/contracts";
import { possibilityScope } from "./from-workspace";
import { HealthSignal, LifecyclePill, SYSTEM_ICONS } from "./SystemList";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";
import type { WorkspaceMakeRealResult } from "@/experience/workspace/contracts";
import {
  CONNECTION_KIND_LABEL, INCOMING_CONNECTION_LABEL, POSSIBILITY_STATUS_LABEL, SYSTEM_KIND_LABEL, makeRealSummary,
  type MakeRealOutcome, type SystemPossibility, type SystemView,
} from "./model";
import styles from "./systems.module.css";

export interface SystemPageProps {
  system: SystemView | undefined;
  systems: readonly SystemView[];
  workspaceId: string;
  appBase?: string;
  /** No management or requests for changes (shared read-only, member, or stopped workspace). */
  readOnly: boolean;
  /** Runtime use can remain available to members who cannot manage the System. */
  useReadOnly?: boolean;
  rebuildEnabled?: boolean;
  managed?: boolean;
  agency?: boolean;
  readOnlyReason?: string;
  /** Only owners can make a Possibility real. When false, say why. */
  canMakeReal?: boolean;
  makeRealReason?: string;
  loading?: boolean;
  sources: readonly WorkspaceWork[];
  localPreview?: boolean;
  workspaceStopped?: boolean;
  calendarRecoveryAllowed?: boolean;
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
  const back = <button type="button" className={styles.back} onClick={onHome}><ArrowLeft size={16} aria-hidden="true" />Home</button>;
  if (loading && !system) return <div className={styles.page}>{back}<p role="status" className="mt-6 text-sm text-gray-muted">Opening this system…</p></div>;
  if (!system) return <div className={styles.page}>{back}<div className={styles.notFound}><h1 className="font-display">This system isn’t available here.</h1><p>It may belong to another business, or your access may have changed. Nothing about it was changed.</p></div></div>;

  const Icon = SYSTEM_ICONS[system.kind];
  const titled = system.surface.kind !== "work";
  const comparing = system.possibilities.find(item => item.id === compareId && item.previewSrc);
  function compare(possibility: SystemPossibility) {
    setCompareId(possibility.id);
    setMode("both");
  }

  return <div className={styles.page} aria-busy={loading || undefined}>
    <header className={styles.header}>
      <div>
        {back}
        {titled ? <h1 className="font-display">{system.name}</h1> : null}
        <p className={styles.meta}>
          <span><Icon size={16} aria-hidden="true" className="mr-2 inline align-[-3px]" />{SYSTEM_KIND_LABEL[system.kind]}{titled && system.detail ? ` · ${system.detail}` : ""}</span>
          <LifecyclePill lifecycle={system.lifecycle} />
          <HealthSignal health={system.health} detailed />
          {system.operatedBy ? <span>Run by {system.operatedBy}</span> : null}
        </p>
      </div>
      <div className={styles.actions}>
        {system.surface.kind === "website" && system.surface.liveUrl ? <a className={styles.linkAction} href={system.surface.liveUrl} target="_blank" rel="noreferrer">Visit site<ArrowUpRight size={16} aria-hidden="true" /></a> : null}
        {system.surface.kind === "website" && system.surface.manageHref ? <a className={styles.linkAction} data-variant="secondary" href={system.surface.manageHref}>Website controls</a> : null}
        {readOnly && readOnlyReason ? <span className="self-center text-xs text-gray-muted">{readOnlyReason}</span> : null}
        <Button size="sm" disabled={readOnly} title={readOnly ? readOnlyReason : undefined} icon={<MessageSquareText size={16} />} onClick={() => onAsk(`About ${system.name}: `)}>Ask for a change</Button>
      </div>
    </header>

    <div className={styles.body}>
      <section className={styles.surface} data-kind={system.surface.kind} aria-label={`${system.name}, the actual ${SYSTEM_KIND_LABEL[system.kind].toLowerCase()}`}>
        {system.surface.kind === "website" ? <>
          <div className={styles.surfaceBar}>
            <span>{comparing && mode !== "current" ? `Comparing with: ${comparing.title}` : system.surface.previewSrc ? system.surface.previewLabel : "No public address is recorded"}</span>
            {comparing ? <span className={styles.segmented} role="group" aria-label="What to show">
              {(["current", "possibility", "both"] as const).map(value => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)}>{value === "current" ? "Current" : value === "possibility" ? "Possibility" : "Side by side"}</button>)}
            </span> : null}
          </div>
          <div className={styles.frames}>
            {mode !== "possibility" || !comparing ? <figure>{comparing && mode === "both" ? <figcaption>Current · {system.surface.domain || system.name}</figcaption> : null}{system.surface.previewSrc ? <iframe title={`${system.name} as visitors see it`} src={system.surface.previewSrc} sandbox={websiteSandbox(system.surface.previewSrc)} loading="lazy" referrerPolicy="no-referrer" /> : <p className="p-4 text-sm text-gray-muted">No address is recorded for this website yet, so there is nothing to show. Website controls still open it.</p>}</figure> : null}
            {comparing && mode !== "current" ? <figure>{mode === "both" ? <figcaption>{POSSIBILITY_STATUS_LABEL[comparing.status]} · {comparing.title}</figcaption> : null}<iframe title={`${comparing.title}, not live`} src={comparing.previewSrc} sandbox="" loading="lazy" referrerPolicy="no-referrer" /></figure> : null}
          </div>
        </> : <div className={styles.workSurface}><SystemSurface {...props} system={system} /></div>}
      </section>

      <aside className={styles.aside} aria-label={`About ${system.name}`}>
        <ConnectionsPanel system={system} systemHref={props.systemHref} onOpenSystem={props.onOpenSystem} />
        <PartsPanel system={system} />
        <PossibilitiesPanel system={system} systems={systems} workspaceId={props.workspaceId} readOnly={readOnly} readOnlyReason={readOnlyReason} canMakeReal={props.canMakeReal ?? !readOnly} makeRealReason={props.makeRealReason ?? readOnlyReason} appBase={props.appBase || ""} comparingId={comparing && mode !== "current" ? comparing.id : null} onCompare={system.surface.kind === "website" ? compare : undefined} onAsk={onAsk} />
        <VersionsPanel system={system} systemHref={props.systemHref} onOpenSystem={props.onOpenSystem} />
        {system.audits?.length ? <AuditsPanel system={system} workspaceId={props.workspaceId} appBase={props.appBase || ""} /> : null}
      </aside>
    </div>
  </div>;
}

/**
 * A customer's live site runs on its own origin, so it keeps its scripts. Anything
 * served from Strelva's origin (saved copies, candidates) gets no privileges.
 */
export function websiteSandbox(src: string): string {
  try {
    const url = new URL(src);
    const own = url.hostname === "app.strelva.com" || url.hostname === "localhost" || url.hostname === "127.0.0.1";
    return (url.protocol === "https:" || url.protocol === "http:") && !own ? "allow-scripts allow-same-origin allow-popups" : "";
  } catch {
    return "";
  }
}

function SystemSurface({ system, workspaceId, readOnly, useReadOnly = readOnly, rebuildEnabled, managed, agency, sources, localPreview, workspaceStopped, calendarRecoveryAllowed, inquiryAdapter }: SystemPageProps & { system: SystemView }) {
  const noop = () => undefined;
  if (system.surface.kind === "inquiries") {
    const adapter = inquiryAdapter?.tenantId === system.surface.tenantId ? inquiryAdapter.adapter : undefined;
    return <InquiryServerWorkspaceExperience tenantId={system.surface.tenantId} adapter={adapter} initialView="home" basePath="/workspace" routePrefix="inquiry" />;
  }
  if (system.surface.kind === "listing") return <ListingSurface surface={system.surface} />;
  if (system.surface.kind === "newsletter") return <div className="p-6"><h2 className="text-sm font-semibold">Newsletter</h2><p className="mt-2 text-sm text-gray-muted">{system.surface.audience}</p><p className="mt-2 text-sm text-gray-muted">Strelva drafts each issue. It sends only after the owner approves, from mail.strelva.com, to active subscribers. Each send says how many the mail provider accepted.</p></div>;
  if (system.surface.kind !== "work") return null;
  const { workId, productId } = system.surface;
  if (productId === "applications" || productId === "scheduling") return <BoundedWorkExperience key={workId} workspaceId={workspaceId} workId={workId} productId={productId} sources={[...sources]} readOnly={useReadOnly} canManage={!readOnly} workspaceStopped={workspaceStopped} calendarRecoveryAllowed={calendarRecoveryAllowed} onSaved={noop} />;
  if (productId === "custom-applications") return <CustomApplicationManageExperience key={workId} workId={workId} readOnly={readOnly} />;
  if (productId === "documents" && !localPreview) return <DocumentExperience key={workId} workspaceId={workspaceId} workId={workId} readOnly={readOnly} onSaved={noop} sources={[...sources]} />;
  if (productId === "tracker" && !localPreview) return <TrackerExperience key={workId} workspaceId={workspaceId} workId={workId} readOnly={readOnly} onSaved={noop} />;
  if (productId === "onboarding") return <OnboardingWorkspaceExperience key={workId} workspaceId={workspaceId} initialCaseId={workId} readOnly={readOnly} onSaved={noop} />;
  if (productId === "websites") return <WebsiteExperience key={workId} workspaceId={workspaceId} workId={workId} rebuildVersion={websiteDocumentVersion(sources.find(work => work.id === workId)?.payload)} rebuildEnabled={rebuildEnabled} managed={managed} agency={agency} readOnly={readOnly} onSaved={noop} />;
  if (productId === "unknown" && system.views?.length) return <div className="p-6 text-sm">
    <p className="text-gray-muted">These bookings are taken on the site and kept in its own booking store. Open a view of them:</p>
    <ul className="mt-3 space-y-2">{system.views.map(view => <li key={view.id}>{view.href ? <a className="underline" href={view.href}>{view.label}</a> : <span>{view.label} · not available from here</span>}</li>)}</ul>
  </div>;
  if (productId === "unknown") return <p className="p-6 text-sm text-gray-muted">There is nothing to open for this system here yet. Its record and status are beside it.</p>;
  return <p className="p-6 text-sm text-gray-muted">This system opens in its own view. <Link className="underline" href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}&work=${encodeURIComponent(workId)}`}>Open it</Link></p>;
}

/** The listing's own surface: its health in words and Strelva handled. */
function ListingSurface({ surface }: { surface: Extract<SystemView["surface"], { kind: "listing" }> }) {
  const when = (at: string) => {
    const date = new Date(at);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };
  return <div className="p-6">
    <p role={surface.unavailable ? "alert" : "status"} className="text-sm">{surface.healthMessage}</p>
    <h2 className="mt-6 text-sm font-semibold">Strelva handled</h2>
    {surface.receipts.length ? <ul className={styles.panelList} aria-label="What Strelva did on Google">
      {surface.receipts.map(receipt => <li key={receipt.id}><span>{receipt.headline}</span><small>{when(receipt.at)}</small></li>)}
    </ul> : <p className="mt-2 text-sm text-gray-muted">Nothing yet. Replies, hours and posts Strelva sends to Google show here, each with what changed and how to undo it.</p>}
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

function Panel({ id, title, count, intro, children }: { id: string; title: string; count: number; intro: string; children: ReactNode }) {
  return <section className={styles.panel} aria-labelledby={id}>
    <h2 id={id}>{title}{count ? <span>{count}</span> : null}</h2>
    <p>{intro}</p>
    {children}
  </section>;
}

function SystemLink({ id, label, systemHref, onOpenSystem }: { id?: string; label: string; systemHref: (id: string) => string; onOpenSystem?: (id: string) => void }) {
  if (!id) return <>{label}</>;
  return <Link href={systemHref(id)} onClick={event => { if (!onOpenSystem || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return; event.preventDefault(); onOpenSystem(id); }}>{label}</Link>;
}

function ConnectionsPanel({ system, systemHref, onOpenSystem }: { system: SystemView; systemHref: (id: string) => string; onOpenSystem?: (id: string) => void }) {
  return <Panel id={`${system.id}-connections`} title="Connections" count={system.connections.length} intro="What it works with.">
    {system.connections.length ? <ul className={styles.panelList}>{system.connections.map(connection => <li key={connection.id}>
      <span>{connection.sentence}</span>
      <small>{(connection.direction === "in" ? INCOMING_CONNECTION_LABEL : CONNECTION_KIND_LABEL)[connection.kind]} <SystemLink id={connection.systemId} label={connection.target} systemHref={systemHref} onOpenSystem={onOpenSystem} />{connection.status === "connected" ? "" : connection.status === "not_connected" ? " · Not connected" : " · Not confirmed"}</small>
    </li>)}</ul> : <p className="mt-3">Nothing else is connected to it yet.</p>}
    {system.offers?.map(offer => <p key={offer.kind} className="mt-3">{offer.label}. <Link className="underline" href="/dashboard/google">Connect Google</Link></p>)}
  </Panel>;
}

async function requestMakeReal(request: typeof fetch, workspaceId: string, possibilityId: string): Promise<MakeRealOutcome> {
  try {
    const response = await request("/api/workspace/systems/make-real", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, possibilityId }),
    });
    const body = await response.json().catch(() => null) as { result?: WorkspaceMakeRealResult; error?: string; permission?: string } | null;
    if (response.ok && body?.result) return { kind: "result", result: body.result };
    if (response.status === 403) return { kind: "permission", message: body?.error || "Only an owner of this business can make a possibility real." };
    return { kind: "error", message: `${body?.error || "Make real could not be confirmed."} Your live systems are unchanged.` };
  } catch {
    return { kind: "error", message: "Make real could not be reached. Your live systems are unchanged." };
  }
}

function MakeRealState({ outcome, onAsk, title }: { outcome: MakeRealOutcome; onAsk: (request: string) => void; title: string }) {
  if (outcome.kind !== "result") return <p role={outcome.kind === "error" ? "alert" : "status"} className={styles.makeRealNotice}>{outcome.message}</p>;
  const { result } = outcome;
  return <div role="status" className={styles.makeRealNotice} aria-label="Make real result">
    <h3>{result.headline}</h3>
    <p>{makeRealSummary(result)}</p>
    {result.done.length ? <><h3>Done in the isolated copy</h3><ul>{result.done.map(item => <li key={item.label}>{item.label}</li>)}</ul></> : null}
    {result.waiting.length ? <><h3>Waiting</h3><ul>{result.waiting.map(item => <li key={item.label}>{item.label}: {item.reason}</li>)}</ul></> : null}
    {result.unknown.length ? <><h3>Outcome not known</h3><ul>{result.unknown.map(item => <li key={item}>{item}</li>)}</ul></> : null}
    {result.notStarted.length ? <><h3>Not started</h3><ul>{result.notStarted.map(item => <li key={item}>{item}</li>)}</ul></> : null}
    {result.notConnected.length ? <><h3>Not connected</h3><ul>{result.notConnected.map(item => <li key={item}>{item}</li>)}</ul></> : null}
    <button type="button" className="underline" onClick={() => onAsk(`Make this real: ${title}. `)}>Ask Strelva to finish it</button>
  </div>;
}

function PossibilitiesPanel({ system, systems, workspaceId, readOnly, readOnlyReason, canMakeReal, makeRealReason, appBase, comparingId, onCompare, onAsk }: { system: SystemView; systems: readonly SystemView[]; workspaceId: string; readOnly: boolean; readOnlyReason?: string; canMakeReal: boolean; makeRealReason?: string; appBase: string; comparingId: string | null; onCompare?: (possibility: SystemPossibility) => void; onAsk: (request: string) => void }) {
  const request = useWorkspaceRequest();
  const [outcome, setOutcome] = useState<{ id: string; outcome: MakeRealOutcome } | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  async function makeReal(possibility: SystemPossibility) {
    setRunning(possibility.id);
    setOutcome(null);
    const next = await requestMakeReal(request, workspaceId, possibility.id);
    setOutcome({ id: possibility.id, outcome: next });
    setRunning(null);
  }
  return <Panel id={`${system.id}-possibilities`} title="Possibilities" count={system.possibilities.length} intro="Alternatives you can open and compare before anything changes.">
    {system.possibilities.length ? <ul className={styles.panelList}>{system.possibilities.map(possibility => {
      const scope = possibilityScope(possibility, systems);
      const blockedReason = !canMakeReal ? makeRealReason || "Only an owner of this business can make a possibility real." : possibility.status !== "ready" ? "Still being explored. It can be made real once it is ready." : undefined;
      return <li key={possibility.id}>
        <span className={styles.possibilityHead}><strong>{possibility.title}</strong><span className={styles.lifecycle} data-lifecycle={possibility.status === "ready" ? "live" : "draft"}>{POSSIBILITY_STATUS_LABEL[possibility.status]}</span></span>
        <small>{possibility.summary}</small>
        {possibility.evidence ? <small>{possibility.evidence}</small> : null}
        <small>Changes: {scope.join(", ")}</small>
        <span className={styles.possibilityActions}>
          {onCompare && possibility.previewSrc ? <Button size="sm" variant="secondary" aria-pressed={comparingId === possibility.id} onClick={() => onCompare(possibility)}>Compare</Button> : null}
          {possibility.openHref ? <a className={styles.linkAction} href={`${appBase}${possibility.openHref}`}>Open</a> : null}
          <Button size="sm" disabled={Boolean(blockedReason) || running === possibility.id} title={blockedReason} onClick={() => void makeReal(possibility)}>{running === possibility.id ? "Making real…" : "Make real"}</Button>
        </span>
        {!canMakeReal ? <small>{blockedReason}</small> : null}
        {outcome?.id === possibility.id ? <MakeRealState outcome={outcome.outcome} onAsk={onAsk} title={possibility.title} /> : null}
      </li>;
    })}</ul> : <p className="mt-3">No alternatives are being explored. <button type="button" className="underline" disabled={readOnly} title={readOnly ? readOnlyReason : undefined} onClick={() => onAsk(`What else could ${system.name} become? `)}>Ask what else it could become</button></p>}
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
    {system.versions.length ? <ul className={styles.panelList}>{system.versions.map(version => <li key={version.id}>
      <span>{version.relation === "source" ? "Source · " : ""}<SystemLink id={version.systemId} label={version.title} systemHref={systemHref} onOpenSystem={onOpenSystem} /></span>
      <small>{version.context}</small>
      <small>{version.lineage}</small>
    </li>)}</ul> : <p className="mt-3">It runs in one context today.</p>}
  </Panel>;
}
