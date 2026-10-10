"use client";

import { useRef, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { ArrowRight, Check, Circle, FileText, LayoutGrid, LoaderCircle, Plus, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { actorPresentation } from "@/platform/presentation/actor";
import { STRELVA_HANDLED_LABEL } from "@/platform/presentation/place-labels";
import { StrelvaShell, pinnedApps, pinnedSystems, pinnedWebsites, type StrelvaSection } from "@/experience/app-frame/StrelvaShell";
import { SystemList } from "@/experience/systems/SystemList";
import { SYSTEMS_LABEL, SYSTEMS_LIST_LABEL, type SystemView } from "@/experience/systems/model";
import type { OfferingWebsiteBinding, OfferingWebsiteBindingCommand } from "@/platform/offerings";
import type { WorkspaceSnapshot, WorkspaceSystemActivation, WorkspaceWork } from "./contracts";
import type { ManagedWorkSummary } from "./workspace-discovery";
import type { WorkspaceSearchItem } from "./workspace-search";
import { BusinessOfferingSummary, WebsiteAssignmentHandoff, type WorkspaceOfferingState } from "./WorkspaceOfferings";
import { WorkspaceAllowanceSummary } from "./WorkspaceAllowanceSummary";
import { WorkspaceComposer } from "./WorkspaceComposer";
import { requestDraftKey } from "./request-draft";
import { useBusinessDeliveries } from "./useBusinessDeliveries";
import { NeedsYouSection, StrelvaHandledSection } from "./NeedsYouSection";
import { decisionCount } from "./needs-you-presentation";
import { useNeedsYou } from "./useNeedsYou";
import { SiteSummarySection, useSiteSummary, type SiteSummaryState } from "./SiteSummarySection";
import { workspaceHome } from "./workspace-home";
import { businessRequestRows, deliveryProviderName, type BusinessRequestRow } from "./WorkspaceRequests";
import { workspaceWorkLabel } from "./work-label";
import { LoopRibbon } from "./outcomes/LoopRibbon";
import { useHomeOutcomes } from "./outcomes/HomeOutcomes";
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
  /**
   * `home` (the default) or the Needs you place: the deck of the owner's
   * decisions. The Needs you place exists only while STRELVA_NEEDS_YOU_RELEASE
   * is on; the layout opens Home otherwise.
   */
  view?: "home" | "needs-you";
}

const STARTERS = [
  { label: "Fix customer follow-up", request: "Make sure customer follow-up does not fall through." },
  { label: "Improve our website", request: "Improve our website based on what customers need." },
  { label: "Give my team a better way to request things", request: "Give my team a better way to submit and track requests." },
] as const;

/** The minute, on the client only. The server and hydration render without a clock. */
function subscribeMinute(onChange: () => void) {
  const timer = window.setInterval(onChange, 30_000);
  return () => window.clearInterval(timer);
}
const minuteNow = () => Math.floor(Date.now() / 60_000);
const noMinute = () => null;

function greetingFor(minute: number | null): { greeting: string; line: string | null } {
  if (minute === null) return { greeting: "Welcome back.", line: null };
  const at = new Date(minute * 60_000);
  const hour = at.getHours();
  const weekday = at.toLocaleDateString("en-US", { weekday: "long" });
  const time = at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
  return { greeting: hour < 12 ? "Good morning." : hour < 18 ? "Good afternoon." : "Good evening.", line: `${weekday}, ${time}` };
}

type StepState = "done" | "now" | "attention" | "next";
function stepState(line: WorkspaceSystemActivation["lines"][number]): StepState {
  if (line.state.startsWith("Done") || line.state === "Can't be undone") return "done";
  if (line.detail === "Running now.") return "now";
  if (line.state === "Waiting" || line.state === "Didn't happen" || line.state === "Not sure yet") return "attention";
  return "next";
}
const STEP_ICON = { done: Check, now: LoaderCircle, attention: TriangleAlert, next: Circle } as const;

/** Live chips on the dusk band: only what the snapshot and the site summary actually say. */
function liveChips(siteSummary: SiteSummaryState, systems: readonly SystemView[], sites: readonly ManagedWorkSummary[], systemsReleased: boolean): { id: string; text: string; tone: "live" | "clay" | "quiet" }[] {
  const chips: { id: string; text: string; tone: "live" | "clay" | "quiet" }[] = [];
  const site = siteSummary.status === "ready" ? siteSummary.data.sites[0] : undefined;
  if (site?.visits) chips.push({ id: "visits", text: `${site.siteName} · ${site.visits.thisWeek.toLocaleString("en-US")} found you this week`, tone: "live" });
  if (systemsReleased && systems.length) {
    const live = systems.filter(item => item.lifecycle === "live").length;
    const off = systems.filter(item => item.health.state === "degraded" || item.health.state === "blocked").length;
    if (live) chips.push({ id: "live", text: `${live} ${live === 1 ? "system" : "systems"} live`, tone: "live" });
    if (off) chips.push({ id: "health", text: `${off} ${off === 1 ? "needs" : "need"} a look`, tone: "clay" });
  } else if (!systemsReleased && sites.length) {
    chips.push({ id: "sites", text: `${sites.length} connected ${sites.length === 1 ? "website" : "websites"}`, tone: "quiet" });
  }
  if (site?.leads?.count) chips.push({ id: "leads", text: `${site.leads.count.toLocaleString("en-US")} reached out · 30 days`, tone: "quiet" });
  return chips.slice(0, 3);
}

/** The start and return surface, using the same frame as every saved result. */
export function BusinessHome({ snapshot, sites, unassignedSites, siteAssignmentsKnown, offerings, busy, notice, onOpen, onStart, onCreateWebsite, onRequest, onDraftChange, onNavigate, onWorkspace, onOfferings, appBase = "", accountHref, signOut, managedWorkUnavailable, onWebsiteCommand, onRetryWebsiteAssignments, files, systemHref, onOpenSystem, systemsLoading = false, systemsUnavailable = false, systems: knownSystems = [], systemsReleased = false, view = "home" }: Props) {
  const needsYouHeading = useRef<HTMLHeadingElement>(null);
  // An incomplete list would misplace a System; show none until it loads.
  const systems = systemsReleased && !systemsLoading ? knownSystems : [];
  const current = snapshot.workspaces.find(space => space.id === snapshot.workspaceId);
  const agencySeat = current?.access === "provider_seat";
  const readOnly = current?.access === "delegated_read" || current?.access === "provider_seat";
  const customer = current?.kind === "customer";
  const name = current?.name || "Your business";
  const home = workspaceHome(snapshot.work);
  const deliveryScope = customer && !readOnly && ["owner", "admin"].includes(current?.role || "") ? snapshot.workspaceId : undefined;
  const deliveries = useBusinessDeliveries(deliveryScope);
  const deliveryItems = deliveries.state.status === "ready" ? deliveries.state.items : [];
  const deliveryAttention = deliveryItems.filter(item => item.attention);
  // STRELVA_NEEDS_YOU_RELEASE: Needs you and What changed come from the
  // policy model. Request decisions arrive there as items, so the delivery
  // list no longer adds its own.
  const needsYouReleased = snapshot.releases?.needsYou === true && customer && !readOnly;
  const needsYou = useNeedsYou(needsYouReleased ? snapshot.workspaceId : undefined);
  // Owner entry: the linked site's numbers, inquiries and Strelva's work (the old Today page).
  // Outcome loop: preview-only until the loop is joined on the server (null by default).
  const outcomes = useHomeOutcomes();
  const siteSummary = useSiteSummary(customer && !readOnly ? snapshot.workspaceId : undefined);
  const minute = useSyncExternalStore(subscribeMinute, minuteNow, noMinute);
  const { greeting, line } = greetingFor(minute);
  const attentionCount = home.attention.length + deliveryAttention.length;
  const decisionsWaiting = needsYou.state.status === "ready" && needsYou.state.complete ? needsYou.state.items.length + home.attention.length : null;
  const fileIds = systemsReleased && files ? new Set(files.map(item => item.id)) : null;
  const results = fileIds ? home.results.filter(work => fileIds.has(work.id)) : home.results;
  const savedResultCount = results.length;
  // The Systems layout (Systems list and files split) is for a business with Systems released.
  const business = systemsReleased && customer;
  // Connected sites (the business's own site, any builder) open at /workspace/site when on for this business.
  const connectSiteHref = business && !readOnly && (snapshot.releases?.connectedSites === true || snapshot.releases?.websiteRebuild === true)
    ? `${appBase}/workspace/site?${new URLSearchParams({ workspaceId: snapshot.workspaceId })}` : null;
  const openSystemHref = systemHref || ((id: string) => `${appBase}/workspace?view=system&system=${encodeURIComponent(id)}&workspaceId=${encodeURIComponent(snapshot.workspaceId)}`);
  const live = systems.filter(item => item.lifecycle === "live").length;
  const drafts = systems.filter(item => item.lifecycle === "draft").length;
  const paused = systems.filter(item => item.lifecycle === "paused").length;
  const agencyNames = new Map(snapshot.workspaces.filter(space => space.kind === "agency").map(space => [space.id, space.name]));
  const requestRows = businessRequestRows(deliveryItems, snapshot.work, item => deliveryProviderName(item, agencyNames));
  const handled = requestRows.filter(row => row.stage === "done").slice(0, 5);
  const inProgress = requestRows.filter(row => row.stage === "in_progress" || row.stage === "asked");
  // With Systems released, What changed is the receipt feed, not done Requests,
  // and In progress also lists every Make real that is running or partly live.
  const receipts = systemsReleased ? snapshot.systems?.handled ?? [] : [];
  const making = systemsReleased ? snapshot.systems?.activations ?? [] : [];
  /** Requests belong to a business. Personal workspaces only see these lists when something is in them. */
  const showRequests = customer || requestRows.length > 0;
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

  const attentionRows = home.attention.map(({ work, reason }) => <li key={work.id}><button type="button" aria-label={`Open ${work.title}`} className={styles.row} onClick={() => onOpen(work.id)}><span><strong>{work.title}</strong><small>{reason}</small></span><ArrowRight size={16} aria-hidden="true" /></button></li>);
  const receiptList = <ul className={styles.list} aria-label="This week’s changes">{receipts.slice(0, 7).map(receipt => <li key={receipt.id}><span className={styles.row}><span><strong>{receipt.sentence}</strong>{actorPresentation(receipt.actor).credit ? <small>{actorPresentation(receipt.actor).credit}</small> : null}<small>{new Date(receipt.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {receipt.undo}</small></span></span></li>)}</ul>;

  // ---- Strelva is working (ink-moss): what is moving now, then recorded changes.
  const lead = making[0];
  const otherMaking = making.slice(lead ? 1 : 0);
  const leadRequest = lead ? undefined : inProgress[0];
  const otherRequests = inProgress.slice(leadRequest ? 1 : 0, 5);
  const progressChecking = busy || deliveryPending;
  const anyWork = Boolean(lead || leadRequest);
  const working = <section className={`${styles.working} ${styles.reveal}`} style={{ "--i": 1 } as CSSProperties} aria-labelledby="home-progress">
    <p className={styles.eyebrow} data-tone="aurora"><span className={styles.dot} aria-hidden="true" data-live={anyWork || undefined} />{anyWork ? "In progress" : "This week"}</p>
    <h2 id="home-progress" className={styles.srOnly}>In progress</h2>
    {lead ? <div className={styles.lead}>
      <h3>{lead.partlyLive ? `${lead.title}: Partly live` : lead.title}</h3>
      <p>{lead.partlyLive ? `${lead.done} of ${lead.total} done` : lead.headline}</p>
      <div className={styles.progressCard}>
        <div className={styles.track} role="progressbar" aria-label={`${lead.title} progress`} aria-valuemin={0} aria-valuemax={lead.total} aria-valuenow={lead.done}><span style={{ "--pct": `${lead.total ? Math.round((lead.done / lead.total) * 100) : 0}%` } as CSSProperties} /></div>
        {lead.lines.length ? <ol className={styles.steps} aria-label={`${lead.title} steps`}>{lead.lines.map((step, index) => {
          const state = stepState(step);
          const Icon = STEP_ICON[state];
          return <li key={`${step.label}-${index}`} data-state={state}><Icon size={14} strokeWidth={1.8} aria-hidden="true" /><span>{step.label}{step.detail && state !== "now" ? <small>{step.detail}</small> : null}</span><em>{state === "now" ? "now" : step.state}</em></li>;
        })}</ol> : <p className={styles.progressNote}>{lead.done} of {lead.total} done</p>}
      </div>
    </div> : leadRequest ? <div className={styles.lead}>
      <h3>{leadRequest.title}</h3>
      <p>{leadRequest.detail}</p>
    </div> : progressChecking ? <p role="status" className={styles.muted}>Checking your requests…</p> : <div className={styles.lead}>
      <h3>{readOnly ? "No shared requests are in progress." : "Nothing is in progress."}</h3>
      {readOnly ? null : <>
        <p>Ask Strelva above for something with an end, like a new page or an intake form.</p>
        <div className={styles.starters} aria-label="Try asking Strelva">{STARTERS.map(starter => <button key={starter.label} type="button" disabled={busy} onClick={() => request(starter.request)}>{starter.label}</button>)}</div>
      </>}
    </div>}
    {otherMaking.length || (!progressChecking && otherRequests.length) ? <ul className={styles.list} aria-label="Also in progress">
      {otherMaking.map(activation => <li key={activation.id}><span className={styles.row}><span><strong>{activation.partlyLive ? `${activation.title}: Partly live` : activation.headline}</strong><small>{activation.done} of {activation.total} done</small></span></span></li>)}
      {progressChecking ? null : otherRequests.map(row => requestRow(row))}
    </ul> : null}
    {lead && progressChecking ? <p role="status" className={styles.muted}>Checking your requests…</p> : null}
    {needsYouReleased ? <StrelvaHandledSection state={needsYou.state} pending={needsYou.pending} notices={needsYou.receiptNotices} onUndo={needsYou.undo}
      fallback={receipts.length ? receiptList : handled.length && !systemsReleased ? <ul className={styles.list}>{handled.map(row => requestRow(row))}</ul> : undefined} />
      : <section className={styles.handled} aria-labelledby="home-handled">
        <header className={styles.handledHeader}><h2 id="home-handled">{STRELVA_HANDLED_LABEL}</h2>{systemsReleased ? <span>This week</span> : null}</header>
        {systemsReleased ? (receipts.length ? receiptList : <p className={styles.muted}>Nothing this week. When something changes for you, it shows here with what changed and how to undo it.</p>)
          : progressChecking ? <p role="status" className={styles.muted}>Checking what finished…</p> : handled.length ? <ul className={styles.list}>{handled.map(row => requestRow(row))}</ul> : <p className={styles.muted}>Nothing finished yet. When Strelva or your agency finishes something, it appears here with what changed.</p>}
        {customer && sites.length ? <a className={styles.textAction} href={`${appBase}/workspace/recaps?workspaceId=${encodeURIComponent(snapshot.workspaceId)}`}>Weekly and monthly recaps<ArrowRight size={16} aria-hidden="true" /></a> : null}
      </section>}
    <button type="button" className={styles.textAction} onClick={() => onNavigate("requests")}>All requests<ArrowRight size={16} aria-hidden="true" /></button>
  </section>;

  // ---- Your side (linen): the owner's decisions, the rule behind them, and the site's week.
  const policy = needsYouReleased ? <p className={styles.policy}><ShieldCheck size={15} aria-hidden="true" />Strelva asks you before anything goes live, quotes a price, or books your time.<button type="button" onClick={() => onNavigate("settings")}>Who decides</button></p> : null;
  const needsYouEmpty = <p className={styles.sideTitle}>Nothing needs you right now.</p>;
  const decisions = needsYouReleased
    ? <NeedsYouSection state={needsYou.state} pending={needsYou.pending} notices={needsYou.notices} onDecide={needsYou.decide} onRetry={needsYou.refresh} appBase={appBase}
      extraCount={home.attention.length} extra={home.attention.length ? attentionRows : null} empty={needsYouEmpty} />
    : <section className={styles.section} aria-labelledby="home-attention">
      <header className={styles.sideHeader}>
        <h2 id="home-attention" className={styles.eyebrow} data-tone="clay"><span className={styles.dot} aria-hidden="true" />Needs you{!busy && !deliveryPending && attentionCount > 0 ? <span className={styles.count}>{attentionCount}</span> : null}</h2>
        {!busy && !deliveryPending ? <p className={styles.sideTitle}>{attentionCount ? `${decisionCount(attentionCount)} waiting on you.` : "Nothing needs a decision right now."}</p> : null}
      </header>
      {busy || deliveryPending ? <p role="status" className={styles.muted}>Checking your work…</p> : attentionCount ? <ul className={styles.decisions}>
        {deliveryAttention.map(item => <li key={`delivery-${item.id}`}><a className={styles.row} href={item.href}><span><strong>{item.title}</strong><small>{item.detail}</small></span><ArrowRight size={16} aria-hidden="true" /></a></li>)}
        {attentionRows}
      </ul> : null}
      {deliveryUnavailable ? <p role="status" className={styles.notice}>{systemsReleased ? "Requests waiting on your decision could not be checked." : "Delivery decisions could not be checked."} <button type="button" onClick={deliveries.refresh}>Check again</button></p> : null}
    </section>;
  const yourSide = <div className={`${styles.yourSide} ${styles.reveal}`} style={{ "--i": 2 } as CSSProperties} aria-label="Your side">
    {decisions}
    {policy}
    <SiteSummarySection state={siteSummary.state} workspaceId={snapshot.workspaceId} appBase={appBase} onRetry={siteSummary.retry} />
  </div>;

  const composer = <WorkspaceComposer key={`${snapshot.actor.email}:${snapshot.workspaceId}`} tone="glass" draftKey={requestDraftKey({ actorEmail: snapshot.actor.email, workspaceId: snapshot.workspaceId })} disabled={busy} onSubmit={request} onEdited={onDraftChange} onTemplates={() => onNavigate("products")} placeholder={customer ? "Ask Strelva for anything your business needs" : "Ask Strelva for anything you need"} systemsReleased={systemsReleased} />;
  const chips = liveChips(siteSummary.state, systems, sites, systemsReleased);
  const systemsLine = business && systems.length ? [live ? `${live} live` : "", drafts ? `${drafts} in draft` : "", paused ? `${paused} paused` : ""].filter(Boolean).join(" · ") : "";

  const homePage = <div className={styles.home} aria-busy={busy || undefined}>
    <section className={`${styles.dusk} ${styles.reveal}`} aria-labelledby="business-start-title">
      <div className={styles.duskMain}>
        <p className={styles.duskLine}>{readOnly ? systemsReleased ? "Shared with you" : "Shared workspace" : line}{(readOnly || line) ? " · " : ""}{name}</p>
        <h1 id="business-start-title" className="font-display">{agencySeat ? "Your client’s website work." : readOnly ? "Review what was shared." : greeting}</h1>
        {readOnly ? <p className={styles.duskNote}>{agencySeat ? `Your agency has assigned you to ${name}. Open a saved website to continue working.` : `${name} shared this with your agency to review.`}</p> : composer}
      </div>
      {chips.length || systemsLine ? <ul className={styles.chips} aria-label="Right now">
        {chips.map(chip => <li key={chip.id} data-tone={chip.tone}><span className={styles.dot} aria-hidden="true" />{chip.text}</li>)}
        {systemsLine && !chips.some(chip => chip.id === "live") ? <li data-tone="quiet"><span className={styles.dot} aria-hidden="true" />{systemsLine}</li> : null}
      </ul> : null}
    </section>

    {managedWorkUnavailable ? <p role="status" className={styles.notice}>Some websites could not be loaded. <a href={accountHref}>Check website access</a></p> : null}

    {outcomes ? <LoopRibbon {...outcomes.loop} className={styles.outcome} /> : null}
    {customer ? <div className={styles.sides}>{working}{yourSide}</div> : <div className={styles.single}>
      {decisions}
      {showRequests ? working : null}
    </div>}

    {business || systems.length ? <section className={styles.section} aria-labelledby="home-systems">
      <header className={styles.sectionHeader}><h2 id="home-systems"><LayoutGrid size={18} aria-hidden="true" />{SYSTEMS_LABEL}</h2>{systems.length ? <Button variant="ghost" size="sm" onClick={() => onNavigate("apps")}>{SYSTEMS_LIST_LABEL}<ArrowRight size={16} aria-hidden="true" /></Button> : null}</header>
      {busy || systemsLoading ? <p role="status" className={styles.muted}>Loading your systems…</p> : systemsUnavailable ? <p role="status" className={styles.notice}>Your systems could not be loaded just now. Nothing about them has changed.</p> : systems.length ? <SystemList systems={systems} href={openSystemHref} onOpen={onOpenSystem} label={`${name} ${SYSTEMS_LABEL.toLowerCase()}`} /> : <div className={styles.empty}><LayoutGrid size={24} aria-hidden="true" /><div><h3>{readOnly ? "Nothing has been shared here yet." : "Nothing is running yet."}</h3><p>{readOnly ? "Systems the owner shares will appear here." : "Your website, inquiries, bookings and the tools your team uses will appear here once Strelva builds them. Tell Strelva what you need above."}</p></div></div>}
      {connectSiteHref && !busy && !systemsLoading ? <p className={styles.muted} data-home-connect-site>{snapshot.releases?.websiteRebuild === true
        ? <>Your next website: <a className="underline underline-offset-4" href={connectSiteHref}>Open website options</a>.</>
        : systems.some(item => item.kind === "website")
        ? <>Have another website? <a className="underline underline-offset-4" href={connectSiteHref}>Connect it</a>. It stays where it is.</>
        : <>Already have a website? <a className="underline underline-offset-4" href={connectSiteHref}>Bring it into Strelva</a>. It stays where it is; Strelva takes its inquiries.</>}</p> : null}
    </section> : null}

    {!business || results.length || !systems.length ? <section className={styles.section} aria-labelledby="home-recent">
      <header className={styles.sectionHeader}><h2 id="home-recent">{systemsReleased ? "Files and results" : "Recent"}</h2>{!business || !systems.length ? <Button variant="ghost" size="sm" onClick={() => onNavigate("apps")}>{systemsReleased ? SYSTEMS_LIST_LABEL : "All apps and files"}{savedResultCount ? ` (${savedResultCount})` : ""}<ArrowRight size={16} aria-hidden="true" /></Button> : null}</header>
      {busy ? <p role="status" className={styles.muted}>Loading saved work…</p> : results.length ? <ul className={styles.list}>
        {results.slice(0, 6).map(work => <li key={work.id}><button type="button" aria-label={`Open ${work.title}`} className={styles.row} onClick={() => onOpen(work.id)}>{work.productId === "applications" ? <LayoutGrid size={18} aria-hidden="true" /> : <FileText size={18} aria-hidden="true" />}<span><strong>{work.title}</strong><small>{workspaceWorkLabel(work)}</small></span><ArrowRight size={16} aria-hidden="true" /></button></li>)}
      </ul> : <div className={styles.empty}><LayoutGrid size={24} aria-hidden="true" /><div><h3>{readOnly ? "Nothing has been shared here yet." : systemsReleased ? "No saved files yet." : "No saved result yet."}</h3><p>{readOnly ? "Shared work will appear here." : systemsReleased ? "Checks, reports and plans Strelva makes for you are kept here." : "Describe the outcome above. Strelva will show you what it can create or handle."}</p></div>{!readOnly && !business ? <Button variant="secondary" onClick={() => onNavigate("products")}><Plus size={16} aria-hidden="true" />{systemsReleased ? "Get or build something" : "Get or build an app"}</Button> : null}</div>}
      {!readOnly && onCreateWebsite ? <button type="button" className={styles.textAction} disabled={busy} onClick={onCreateWebsite}>Prefer to build a website yourself? Start a private draft.<ArrowRight size={16} aria-hidden="true" /></button> : null}
      {!business ? <p className={styles.contextLine} aria-label="Current Strelva context"><span>Working in <strong>{name}</strong></span>{savedResultCount ? <span>{savedResultCount} saved {savedResultCount === 1 ? "result" : "results"}</span> : null}{sites.length ? <span>{sites.length} connected {sites.length === 1 ? "website" : "websites"}</span> : null}</p> : null}
    </section> : null}

    {unassignedSites.length ? <details className={styles.details} aria-label="Websites available to your account"><summary>Websites available to your account <span>{unassignedSites.length}</span></summary><p className={styles.muted}>{current?.kind !== "customer" ? "These websites are available through your account. Assign them from the appropriate client business." : siteAssignmentsKnown ? "These websites are not yet assigned to this business." : "Business assignments could not be confirmed."}</p>{current?.kind !== "customer" ? <ul className={styles.list}>{unassignedSites.map(site => <li key={site.id}><a className={styles.row} href={site.href}><span><strong>{site.title}</strong><small>Account-authorized website</small></span><ArrowRight size={16} /></a></li>)}</ul> : <WebsiteAssignmentHandoff businessName={name} state={managedWorkUnavailable ? { status: "unavailable", reason: "Linked website access is unavailable right now." } : offerings} sites={unassignedSites} onRetry={onRetryWebsiteAssignments} onCommand={onWebsiteCommand} />}</details> : null}

    <details className={styles.details} aria-label="Usage and connected services"><summary>Usage and connected services</summary><div className={styles.connections}>{customer && !readOnly ? <WorkspaceAllowanceSummary businessId={snapshot.workspaceId} enabled compact onOpenSettings={() => onNavigate("settings")} /> : null}<BusinessOfferingSummary state={offerings} work={snapshot.work} onOpen={onOfferings} systemsReleased={systemsReleased} /></div></details>
  </div>;

  // ---- The Needs you place: one card per decision, shaped for it.
  const deckCards = home.attention.map(({ work, reason }) => <li key={work.id} className={styles.decisionCard} data-shape="plain"><div className={styles.cardBody}><p className={styles.cardMeta}><span className={styles.dot} aria-hidden="true" />{workspaceWorkLabel(work)}</p><h3>{work.title}</h3><p>{reason}</p></div><div className={styles.decisionActions}><Button size="sm" onClick={() => onOpen(work.id)} aria-label={`Open ${work.title}`}>Open</Button></div></li>);
  const needsYouPage = <div className={styles.home} aria-busy={busy || undefined}>
    <header className={`${styles.pageHeader} ${styles.reveal}`}>
      <h1 ref={needsYouHeading} tabIndex={-1} className="font-display">Needs you</h1>
      <p>{decisionsWaiting === null ? `Decisions only you can make for ${name}.` : decisionsWaiting ? `${decisionCount(decisionsWaiting)} only you can make.` : "Nothing is waiting on you."}</p>
    </header>
    <NeedsYouSection retryFocusTarget={needsYouHeading} variant="deck" state={needsYou.state} pending={needsYou.pending} notices={needsYou.notices} onDecide={needsYou.decide} onRetry={needsYou.refresh} appBase={appBase}
      extraCount={home.attention.length} extra={home.attention.length ? deckCards : null}
      empty={<div className={styles.deckEmpty}><Check size={20} aria-hidden="true" /><div><h2>Nothing needs you.</h2><p>When Strelva needs your yes, it shows here first, with what happens either way.</p></div><Button variant="secondary" size="sm" onClick={() => onNavigate("home")}>Back to Home</Button></div>} />
    {policy}
  </div>;

  return <StrelvaShell active={view === "needs-you" ? "needs-you" : "home"} title={view === "needs-you" ? "Needs you" : name} appBase={appBase} workspaceId={snapshot.workspaceId} accountName={snapshot.actor.email.split("@")[0] || "Your account"} accountDetail={snapshot.actor.email} signOut={signOut} onNavigate={onNavigate} onStart={onStart} startDisabled={readOnly || busy} searchItems={searchItems} searchScopeName={name} recentWork={recentWork} pinned={systemsReleased ? pinnedSystems(systems, openSystemHref, onOpenSystem) : [...pinnedWebsites(sites), ...pinnedApps(snapshot.work, workHref, onOpen)]} systemsReleased={systemsReleased} notice={notice} contentId="business-home-main"
    needsYou={needsYouReleased ? { count: decisionsWaiting } : undefined}
    businessContext={<label><span className={styles.srOnly}>Current workspace</span><select aria-label="Current workspace" value={snapshot.workspaceId} disabled={busy} onChange={event => onWorkspace(event.target.value)}>{snapshot.workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}{workspace.access === "delegated_read" ? " · Read-only" : ""}</option>)}</select></label>}>
    {view === "needs-you" && needsYouReleased ? needsYouPage : homePage}
  </StrelvaShell>;
}
